package incendio2;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Guarda as leituras das estacoes em arquivos CSV (um por estacao, na pasta "dados")
 * e exporta o periodo pedido em GET /stations/export?id=<estacao>&dias=30
 * (ou &inicio=2026-11-01&fim=2026-11-20).
 */
public class ExportacaoCsv {

    private static final Path PASTA = Paths.get("dados");
    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    // pt-BR: decimais com virgula, para o Excel abrir certo. Use Locale.US se preferir ponto.
    private static final Locale LOCALE = Locale.forLanguageTag("pt-BR");
    // Grava no maximo 1 leitura por estacao a cada X segundos (60 = 1 por minuto)
    private static final long INTERVALO_SEGUNDOS = 5;

    private static final String CABECALHO =
            "timestamp_unix;data_hora;estacao_id;nome;temperatura_c;umidade_pct;pressao_hpa;" +
                    "co2_ppm;tvoc_ppb;altitude_m;lux;indice_uv;nivel_uv;nivel_chuva;chovendo;" +
                    "vento_ms;direcao_vento_graus";

    private static final Map<String, Long> ultimaGravacao = new ConcurrentHashMap<>();

    // ---------------------------------------------------------------- gravacao

    public static synchronized void salvar(ServidorEstacoes.Estacao e) {
        long agora = Instant.now().getEpochSecond();
        Long ultima = ultimaGravacao.get(e.stationId);
        if (ultima != null && agora - ultima < INTERVALO_SEGUNDOS) return;
        ultimaGravacao.put(e.stationId, agora);

        try {
            Files.createDirectories(PASTA);
            Path arquivo = arquivoDaEstacao(e.stationId);
            boolean novo = !Files.exists(arquivo);

            String linha = String.join(";",
                    String.valueOf(agora),
                    Instant.ofEpochSecond(agora).atZone(FUSO).format(FMT),
                    csv(e.stationId),
                    csv(e.name),
                    num(e.temperatureC),
                    num(e.humidityPct),
                    num(e.pressureHpa),
                    num(e.co2Ppm),
                    num(e.tvocPpb),
                    num(e.altitudeM),
                    num(e.lux),
                    num(e.uvIndex),
                    csv(e.uvLevel),
                    csv(e.rainLevel),
                    e.isRaining ? "Chovendo" : "Nao chovendo",
                    num(e.windSpeedMs),
                    String.valueOf(e.windDirectionDeg));

            try (BufferedWriter w = Files.newBufferedWriter(arquivo, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {
                // \uFEFF (BOM) faz o Excel abrir os acentos corretamente
                if (novo) w.write("\uFEFF" + CABECALHO + "\n");
                w.write(linha + "\n");
            }
        } catch (IOException ex) {
            System.out.println("Erro ao gravar CSV da estacao " + e.stationId + ":");
            ex.printStackTrace();
        }
    }

    // --------------------------------------------------------------- exportacao

    public static class ExportarHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange ex) throws IOException {
            ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
            ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

            if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
                ex.sendResponseHeaders(204, -1);
                return;
            }
            if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
                erro(ex, 405, "Metodo nao permitido");
                return;
            }

            String id = parametro(ex, "id");
            if (id == null || id.isBlank()) {
                erro(ex, 400, "Informe o parametro id");
                return;
            }

            Path arquivo = arquivoDaEstacao(id);
            if (!Files.exists(arquivo)) {
                erro(ex, 404, "Ainda nao ha dados gravados para esta estacao");
                return;
            }

            long inicio = 0, fim = 0;
            try {
                String f = parametro(ex, "fim");
                String i = parametro(ex, "inicio");

                fim = (f != null && !f.isBlank())
                        ? LocalDate.parse(f).plusDays(1).atStartOfDay(FUSO).toEpochSecond()
                        : Instant.now().getEpochSecond() + 1;

                if (i != null && !i.isBlank()) {
                    inicio = LocalDate.parse(i).atStartOfDay(FUSO).toEpochSecond();
                } else {
                    String d = parametro(ex, "dias");
                    int dias = (d != null && !d.isBlank()) ? Integer.parseInt(d) : 30;
                    inicio = fim - dias * 86400L;
                }
            } catch (Exception e) {
                erro(ex, 400, "Parametros invalidos (use dias=30 ou inicio/fim como AAAA-MM-DD)");
                return;
            }

            ex.getResponseHeaders().set("Content-Type", "text/csv; charset=UTF-8");
            ex.getResponseHeaders().set("Content-Disposition",
                    "attachment; filename=\"" + arquivo.getFileName() + "\"");
            ex.sendResponseHeaders(200, 0);   // 0 = resposta em blocos (streaming)

            try (BufferedReader r = Files.newBufferedReader(arquivo, StandardCharsets.UTF_8);
                 Writer w = new BufferedWriter(new OutputStreamWriter(ex.getResponseBody(), StandardCharsets.UTF_8))) {

                String linha = r.readLine();                  // cabecalho (ja com BOM)
                if (linha != null) w.write(linha + "\n");

                while ((linha = r.readLine()) != null) {
                    int p = linha.indexOf(';');
                    if (p < 0) continue;
                    try {
                        long ts = Long.parseLong(linha.substring(0, p));
                        if (ts >= inicio && ts < fim) w.write(linha + "\n");
                    } catch (NumberFormatException ignored) { }
                }
            }
        }
    }

    // ------------------------------------------------------------------ apoio

    private static Path arquivoDaEstacao(String stationId) {
        // evita caracteres perigosos no nome do arquivo
        String seguro = stationId.replaceAll("[^A-Za-z0-9_-]", "_");
        return PASTA.resolve("estacao_" + seguro + ".csv");
    }

    private static String num(double v) {
        return String.format(LOCALE, "%.2f", v);
    }

    private static String csv(String s) {
        if (s == null) return "";
        s = s.replace("\r", " ").replace("\n", " ");
        if (s.contains(";") || s.contains("\"")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    private static String parametro(HttpExchange ex, String nome) {
        String query = ex.getRequestURI().getRawQuery();
        if (query == null) return null;
        for (String part : query.split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2 && kv[0].equals(nome)) {
                try { return URLDecoder.decode(kv[1], StandardCharsets.UTF_8); }
                catch (Exception ignored) { return kv[1]; }
            }
        }
        return null;
    }

    private static void erro(HttpExchange ex, int status, String mensagem) throws IOException {
        byte[] bytes = ("{\"erro\":\"" + mensagem + "\"}").getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }
}