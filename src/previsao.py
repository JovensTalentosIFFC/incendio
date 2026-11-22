from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen
from urllib.error import URLError
from datetime import datetime
from statistics import mean, pstdev
import json
import math
import re
import time

JAVA_API = "http://localhost:8080"
PORTA_PYTHON = 8081
HORAS_FUTURO = 6
INTERVALO_MINUTOS = 30

# Parametros do modelo
TAU_HORAS = 3.0            # em quanto tempo o "desvio atual" some e a previsao volta ao normal
JANELA_ATUAL_MIN = 30      # janela para estimar a temperatura atual (media, nao um unico ponto)
MIN_DIAS_CICLO = 2         # dias de historico necessarios para usar o ciclo diario
MIN_COBERTURA_MIN = 30     # com menos historico que isso nao ha base para prever
MARGEM_LIMITE_C = 1.0      # a previsao nunca sai de [min - margem, max + margem] do historico


def converter_data(texto):
    padrao = r"^(\d{2,4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?"
    resultado = re.match(padrao, texto or "")
    if not resultado:
        return None
    ano, mes, dia, hora, minuto, segundo = resultado.groups()
    ano = int(ano)
    if ano < 100:
        ano += 2000
    return datetime(ano, int(mes), int(dia), int(hora), int(minuto), int(segundo or 0)).timestamp()


def ler_csv(texto):
    linhas = texto.replace("\ufeff", "").splitlines()
    linhas = [linha.strip() for linha in linhas if linha.strip()]
    if len(linhas) < 2:
        return []

    separador = ";" if linhas[0].count(";") >= linhas[0].count(",") else ","
    cabecalho = [c.strip().lower() for c in linhas[0].split(separador)]

    def indice(nome):
        for i, coluna in enumerate(cabecalho):
            if nome in coluna:
                return i
        return -1

    i_unix = indice("timestamp")
    i_data = indice("data")
    i_temp = indice("temp")
    i_umid = indice("umid") if indice("umid") >= 0 else indice("humid")

    registros = []
    for linha in linhas[1:]:
        partes = [p.strip() for p in linha.split(separador)]
        try:
            temperatura = float(partes[i_temp].replace(",", "."))
        except (IndexError, ValueError):
            continue

        # Prefere o timestamp unix (sempre UTC). Interpretar "data_hora" depende
        # do fuso horario da maquina que roda o Python e pode deslocar horas.
        timestamp = None
        if i_unix >= 0:
            try:
                timestamp = float(partes[i_unix])
            except (IndexError, ValueError):
                timestamp = None
        if timestamp is None and i_data >= 0 and i_data < len(partes):
            timestamp = converter_data(partes[i_data])
        if timestamp is None:
            continue

        registro = {"timestamp_unix": timestamp, "temperature_c": temperatura}
        if i_umid >= 0:
            try:
                registro["humidity_pct"] = float(partes[i_umid].replace(",", "."))
            except (IndexError, ValueError):
                registro["humidity_pct"] = None
        registros.append(registro)

    registros.sort(key=lambda r: r["timestamp_unix"])
    return registros


# ---------------------------------------------------------------- previsao

def _perfil_horario(registros):
    """Temperatura media por hora do dia (0..23). None se nao houver dados suficientes."""
    por_hora = {}
    for r in registros:
        h = datetime.utcfromtimestamp(r["timestamp_unix"]).hour
        por_hora.setdefault(h, []).append(r["temperature_c"])
    if len(por_hora) < 20:
        return None
    return {h: mean(v) for h, v in por_hora.items()}


def _clima(perfil, base, ts):
    """Temperatura 'normal' para o instante ts (interpola entre horas, fechando o ciclo 24h)."""
    if perfil is None:
        return base
    dt = datetime.utcfromtimestamp(ts)
    h = dt.hour + dt.minute / 60
    h0 = int(h) % 24
    h1 = (h0 + 1) % 24
    frac = h - int(h)
    v0 = perfil.get(h0, base)
    v1 = perfil.get(h1, base)
    return v0 + (v1 - v0) * frac


def calcular_previsao(registros, horas=HORAS_FUTURO):
    """
    Modelo: previsao(t) = normal(t) + (atual - normal(agora)) * exp(-dt / tau)

      normal(t): ciclo diario medio (se houver >= 2 dias) ou a media do historico.
      atual:     media dos ultimos 30 min (suaviza o ruido do sensor).
      O desvio atual em relacao ao normal vai se dissipando com o tempo,
      entao a curva comeca perto do ultimo valor e volta suavemente ao padrao.
      Sem extrapolacao de reta, portanto nao existe "explosao" de valores.
    """
    if len(registros) < 3:
        return []
    if (registros[-1]["timestamp_unix"] - registros[0]["timestamp_unix"]) / 60 < MIN_COBERTURA_MIN:
        return []

    valores = [r["temperature_c"] for r in registros]
    ultimo_ts = registros[-1]["timestamp_unix"]
    base = mean(valores)
    desvio = pstdev(valores)
    minimo, maximo = min(valores) - MARGEM_LIMITE_C, max(valores) + MARGEM_LIMITE_C

    duracao_dias = (ultimo_ts - registros[0]["timestamp_unix"]) / 86400
    perfil = _perfil_horario(registros) if duracao_dias >= MIN_DIAS_CICLO else None

    recentes = [r["temperature_c"] for r in registros if r["timestamp_unix"] >= ultimo_ts - JANELA_ATUAL_MIN * 60]
    atual = mean(recentes if len(recentes) >= 3 else valores[-10:])
    anomalia = atual - _clima(perfil, base, ultimo_ts)

    passo = INTERVALO_MINUTOS * 60
    previsoes = []
    for i in range(1, int(horas * 3600 // passo) + 1):
        ts = ultimo_ts + i * passo
        decaimento = math.exp(-(i * passo / 3600) / TAU_HORAS)
        temp = _clima(perfil, base, ts) + anomalia * decaimento
        temp = max(minimo, min(maximo, temp))
        previsoes.append({
            "timestamp_unix": int(ts),
            "temperature_c": round(temp, 2),
            "minima_c": round(max(minimo, temp - desvio), 2),
            "maxima_c": round(min(maximo, temp + desvio), 2),
            "tipo": "previsao",
        })
    return previsoes


# ---------------------------------------------------------------- servidor

class Handler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        parametros = parse_qs(url.query)

        estacao = parametros.get("id", [None])[0]
        try:
            horas = int(parametros.get("horas", ["24"])[0])
        except ValueError:
            self._responder(400, {"erro": "Parametro horas invalido"})
            return

        if not estacao:
            self._responder(400, {"erro": "Informe o parametro id"})
            return

        dias = max(1, (horas + 23) // 24)
        destino = f"{JAVA_API}/stations/export?id={estacao}&dias={dias}"

        try:
            with urlopen(destino, timeout=10) as resposta:
                csv = resposta.read().decode("utf-8")
        except (URLError, TimeoutError):
            self._responder(502, {"erro": "Nao foi possivel consultar o servidor Java"})
            return

        registros = ler_csv(csv)
        agora = time.time()
        historico = [r for r in registros if r["timestamp_unix"] >= agora - horas * 3600]

        # O ciclo diario usa todo o CSV; o grafico mostra so a janela pedida.
        previsoes = calcular_previsao(registros, HORAS_FUTURO if horas >= HORAS_FUTURO else horas)

        resposta = {"station_id": estacao, "historico": historico, "previsao": previsoes}
        if not previsoes:
            resposta["aviso"] = f"Historico insuficiente para previsao (minimo {MIN_COBERTURA_MIN} min de dados)"
        self._responder(200, resposta)

    def _responder(self, status, objeto):
        corpo = json.dumps(objeto, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=UTF-8")
        self.send_header("Content-Length", str(len(corpo)))
        self._cors()
        self.end_headers()
        self.wfile.write(corpo)

    def log_message(self, formato, *args):
        return


if __name__ == "__main__":
    servidor = ThreadingHTTPServer(("0.0.0.0", PORTA_PYTHON), Handler)
    print(f"Servidor de previsao rodando em http://localhost:{PORTA_PYTHON}")
    servidor.serve_forever()