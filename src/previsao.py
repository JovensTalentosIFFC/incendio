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
FUSO_HORARIO_H = -3        # horario local da estacao em relacao ao UTC (Brasil: -3)
HORA_PICO = 15.0           # hora local da temperatura maxima do dia
AMPLITUDE_PADRAO_C = 3.5   # metade da variacao diaria tipica (3.5 => ~7 C entre minima e maxima). 0 = sem ciclo
AMPLITUDE_MIN_PERFIL_C = 1.0  # se o perfil medido nos dados variar menos que isso, e ruido: usa o ciclo tipico
TAU_HORAS = 3.0            # em quanto tempo o desvio atual some e a previsao segue o ciclo normal
JANELA_ATUAL_MIN = 30      # janela para estimar a temperatura atual (media, nao um unico ponto)
JANELA_NIVEL_H = 6         # janela para estimar o nivel medio do dia
MIN_DIAS_CICLO = 2         # dias de historico necessarios para aprender o ciclo dos proprios dados
MIN_COBERTURA_MIN = 5      # minutos de historico necessarios
MIN_REGISTROS = 10         # e quantidade minima de leituras
DESVIO_MINIMO_C = 0.5      # piso da faixa: com pouco dado o desvio medido engana
INCERTEZA_RAIZ_HORA_C = 0.8  # a faixa alarga com o horizonte: 0.8 * raiz(horas)
LIMITE_ABS_C = (-20.0, 50.0)
MAX_DESVIO_ATUAL_C = 15.0  # a previsao nunca fica a mais que isso da temperatura atual


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

def _hora_local(ts):
    return ((ts / 3600) + FUSO_HORARIO_H) % 24


def _ciclo_tipico(ts, amplitude):
    """Curva diaria tipica: maxima as HORA_PICO, minima 12 h depois, suave entre as duas."""
    return amplitude * math.cos(2 * math.pi * (_hora_local(ts) - HORA_PICO) / 24)


def _perfil_horario(registros):
    """Media por hora local medida nos dados. None se faltar cobertura ou se for so ruido."""
    por_hora = {}
    for r in registros:
        por_hora.setdefault(int(_hora_local(r["timestamp_unix"])), []).append(r["temperature_c"])
    if len(por_hora) < 20:
        return None
    medias = {h: mean(v) for h, v in por_hora.items()}
    if (max(medias.values()) - min(medias.values())) / 2 < AMPLITUDE_MIN_PERFIL_C:
        return None
    return medias


def _clima_perfil(perfil, ts):
    x = _hora_local(ts) - 0.5            # cada media representa o meio da hora
    h0 = int(math.floor(x)) % 24
    frac = x - math.floor(x)
    ref = mean(perfil.values())
    v0 = perfil.get(h0, ref)
    v1 = perfil.get((h0 + 1) % 24, ref)
    return v0 + (v1 - v0) * frac


def calcular_previsao(registros, horas=HORAS_FUTURO):
    """
    previsao(t) = normal(t) + (atual - normal(agora)) * exp(-dt / tau)

    normal(t):
      - com >= 2 dias de historico e um ciclo diario real nos dados: media por hora medida;
      - caso contrario: curva diaria tipica (cosseno, pico as 15h) ancorada no nivel
        medio das ultimas horas, de modo que a curva parte do valor atual e segue
        a subida/descida natural do dia.
    O desvio atual em relacao ao normal se dissipa em ~3 h. A faixa alarga com o horizonte.
    """
    if len(registros) < MIN_REGISTROS:
        return []
    ultimo_ts = registros[-1]["timestamp_unix"]
    if (ultimo_ts - registros[0]["timestamp_unix"]) / 60 < MIN_COBERTURA_MIN:
        return []

    duracao_dias = (ultimo_ts - registros[0]["timestamp_unix"]) / 86400
    perfil = _perfil_horario(registros) if duracao_dias >= MIN_DIAS_CICLO else None

    if perfil is not None:
        clima = lambda ts: _clima_perfil(perfil, ts)
    else:
        recentes_nivel = [r for r in registros if r["timestamp_unix"] >= ultimo_ts - JANELA_NIVEL_H * 3600]
        nivel = mean(r["temperature_c"] - _ciclo_tipico(r["timestamp_unix"], AMPLITUDE_PADRAO_C)
                     for r in recentes_nivel)
        clima = lambda ts: nivel + _ciclo_tipico(ts, AMPLITUDE_PADRAO_C)

    valores = [r["temperature_c"] for r in registros]
    recentes = [r["temperature_c"] for r in registros if r["timestamp_unix"] >= ultimo_ts - JANELA_ATUAL_MIN * 60]
    atual = mean(recentes if len(recentes) >= 3 else valores[-10:])
    anomalia = atual - clima(ultimo_ts)

    # ruido das leituras em torno do que o modelo considera normal
    desvio = max(pstdev([r["temperature_c"] - clima(r["timestamp_unix"]) for r in registros]), DESVIO_MINIMO_C)

    minimo = max(LIMITE_ABS_C[0], atual - MAX_DESVIO_ATUAL_C)
    maximo = min(LIMITE_ABS_C[1], atual + MAX_DESVIO_ATUAL_C)

    passo = INTERVALO_MINUTOS * 60
    previsoes = []
    for i in range(1, int(horas * 3600 // passo) + 1):
        ts = ultimo_ts + i * passo
        h = i * passo / 3600
        temp = clima(ts) + anomalia * math.exp(-h / TAU_HORAS)
        temp = max(minimo, min(maximo, temp))
        incerteza = math.sqrt(desvio ** 2 + (INCERTEZA_RAIZ_HORA_C * math.sqrt(h)) ** 2)
        previsoes.append({
            "timestamp_unix": int(ts),
            "temperature_c": round(temp, 2),
            "minima_c": round(max(minimo, temp - incerteza), 2),
            "maxima_c": round(min(maximo, temp + incerteza), 2),
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
            resposta["aviso"] = f"Historico insuficiente para previsao (minimo {MIN_COBERTURA_MIN} min e {MIN_REGISTROS} leituras)"
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