package incendio2;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.PreparedStatement;

public class ServidorEstacoes {
    private static final int PORTA = 8080;
    private static final String URL_BANCO = "jdbc:mysql://localhost:3306/feira_ciencia";
    private static final String USUARIO_BANCO = "root";
    private static final String SENHA_BANCO = "root";
    private static final Map<String, Estacao> estacoes = new ConcurrentHashMap<>();
    private static final Map<String, CopyOnWriteArrayList<HttpExchange>> assinantesPorUsuario = new ConcurrentHashMap<>();
    private static final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor();

    public static void main(String[] args) throws IOException {
    	testarBanco();
        HttpServer servidor = HttpServer.create(new InetSocketAddress(PORTA), 0);
        servidor.setExecutor(Executors.newCachedThreadPool());

        servidor.createContext("/api/estacao", new ReceberEstacaoHandler());
        servidor.createContext("/stations/add", new AdicionarEstacaoHandler());
        servidor.createContext("/stations/delete", new RemoverEstacaoHandler());
        servidor.createContext("/stations", new ListarTodasHandler());
        servidor.createContext("/stations/byUserId", new ListarPorUsuarioHandler());
        servidor.createContext("/stations/currentData", new StreamPorUsuarioHandler());

        heartbeat.scheduleAtFixedRate(ServidorEstacoes::enviarHeartbeats, 20, 20, TimeUnit.SECONDS);
        servidor.start();

        System.out.println("Servidor de estacoes iniciado na porta " + PORTA);
        System.out.println("POST Arduino: http://0.0.0.0:" + PORTA + "/api/estacao");
        System.out.println("SSE: http://<ip-do-servidor>:" + PORTA + "/stations/currentData?userId=SEU_ID");
    }

    static class ReceberEstacaoHandler implements HttpHandler {
        @Override public void handle(HttpExchange exchange) throws IOException {
            adicionarCors(exchange);
            if (isOptions(exchange)) return;
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                responder(exchange, 405, "{\"erro\":\"Metodo nao permitido\"}"); return;
            }

            String json = lerCorpo(exchange);
            String stationId = primeiroTexto(json, "estacao_id", "station_id");
            if (stationId == null || stationId.isBlank()) {
                responder(exchange, 400, "{\"erro\":\"Campo estacao_id ou station_id obrigatorio\"}"); return;
            }

            Estacao estacao = estacoes.computeIfAbsent(stationId, Estacao::new);
            // A telemetria nao pode alterar o dono da estacao. O userId vem do cadastro.
            atualizarEstacao(estacao, json, false);
            salvarLeituraNoBanco(estacao);
            transmitirParaUsuario(estacao.userId);

            String resposta = String.format(Locale.US,
                    "{\"status\":\"ok\",\"station_id\":\"%s\",\"total_estacoes\":%d}",
                    escaparJson(stationId), estacoes.size());
            responder(exchange, 200, resposta);
        }
    }

    static class AdicionarEstacaoHandler implements HttpHandler {
        @Override public void handle(HttpExchange exchange) throws IOException {
            adicionarCors(exchange);
            if (isOptions(exchange)) return;
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                responder(exchange, 405, "{\"erro\":\"Metodo nao permitido\"}"); return;
            }

            String body = lerCorpo(exchange);
            String stationId = texto(body, "stationId");
            String userId = texto(body, "userId");
            String name = texto(body, "name");
            Double timestamp = numero(body, "timestamp");
            Double timezone = numero(body, "timeZone");

            if (stationId == null || stationId.isBlank() || userId == null || userId.isBlank()) {
                responder(exchange, 400, "{\"erro\":\"stationId e userId sao obrigatorios\"}"); return;
            }

            Estacao estacao = estacoes.computeIfAbsent(stationId, Estacao::new);
            estacao.userId = userId;
            if (name != null && !name.isBlank()) estacao.name = name;
            if (timestamp != null) estacao.timestampUnix = timestamp.longValue();
            if (timezone != null) estacao.timezoneUnix = timezone.intValue();

            transmitirParaUsuario(userId);
            responder(exchange, 200, "{\"ok\":true,\"station_id\":\"" + escaparJson(stationId) + "\"}");
        }
    }

    static class RemoverEstacaoHandler implements HttpHandler {
        @Override public void handle(HttpExchange exchange) throws IOException {
            adicionarCors(exchange);
            if (isOptions(exchange)) return;
            if (!"DELETE".equalsIgnoreCase(exchange.getRequestMethod()) && !"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                responder(exchange, 405, "{\"erro\":\"Use DELETE ou POST\"}"); return;
            }

            String stationId = parametro(exchange, "id");
            if (stationId == null || stationId.isBlank()) {
                responder(exchange, 400, "{\"erro\":\"Informe o parametro id\"}"); return;
            }

            Estacao removida = estacoes.remove(stationId);
            if (removida != null) transmitirParaUsuario(removida.userId);
            responder(exchange, 200, "{\"ok\":true}");
        }
    }

    static class ListarTodasHandler implements HttpHandler {
        @Override public void handle(HttpExchange exchange) throws IOException {
            adicionarCors(exchange);
            if (isOptions(exchange)) return;
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                responder(exchange, 405, "{\"erro\":\"Metodo nao permitido\"}"); return;
            }
            responder(exchange, 200, listaComoJson(estacoes.values()));
        }
    }

    static class ListarPorUsuarioHandler implements HttpHandler {
        @Override public void handle(HttpExchange exchange) throws IOException {
            adicionarCors(exchange);
            if (isOptions(exchange)) return;
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                responder(exchange, 405, "{\"erro\":\"Metodo nao permitido\"}"); return;
            }
            String userId = parametro(exchange, "userId");
            if (userId == null || userId.isBlank()) {
                responder(exchange, 400, "{\"erro\":\"Informe o parametro userId\"}"); return;
            }
            responder(exchange, 200, listaComoJson(estacoesDoUsuario(userId)));
        }
    }

    static class StreamPorUsuarioHandler implements HttpHandler {
        @Override public void handle(HttpExchange exchange) throws IOException {
            adicionarCors(exchange);
            if (isOptions(exchange)) return;
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                responder(exchange, 405, "{\"erro\":\"Metodo nao permitido\"}"); return;
            }

            String userId = parametro(exchange, "userId");
            if (userId == null || userId.isBlank()) {
                responder(exchange, 400, "{\"erro\":\"Informe o parametro userId\"}"); return;
            }

            exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=UTF-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-transform");
            exchange.getResponseHeaders().set("Connection", "keep-alive");
            exchange.sendResponseHeaders(200, 0);

            assinantesPorUsuario.computeIfAbsent(userId, key -> new CopyOnWriteArrayList<>()).add(exchange);
            try {
                enviar(exchange, "data: " + listaComoJson(estacoesDoUsuario(userId)) + "\n\n");
            } catch (IOException e) {
                removerAssinante(userId, exchange);
            }
            // Nao fechar aqui: a resposta fica aberta para os proximos eventos.
        }
    }

    private static void atualizarEstacao(Estacao e, String json, boolean atualizarCadastro) {
        if (atualizarCadastro) {
            String userId = texto(json, "user_id");
            if (userId != null) e.userId = userId;
        }
        String name = texto(json, "estacao_alias");
        if (name != null) e.name = name;
        Double utc = numero(json, "estacao_UTC");
        if (utc != null) e.timezoneUnix = (int) (-utc * 3600);
        Double v;
        if ((v = numero(json, "temperatura")) != null) e.temperatureC = v;
        if ((v = numero(json, "umidade")) != null) e.humidityPct = v;
        if ((v = numero(json, "pressao")) != null) e.pressureHpa = v / 100.0;
        if ((v = numero(json, "CO2")) != null) e.co2Ppm = v;
        if ((v = numero(json, "TVOC")) != null) e.tvocPpb = v;
        if ((v = numero(json, "altitude")) != null) e.altitudeM = v;
        if ((v = numero(json, "lux")) != null) e.lux = v;
        if ((v = numero(json, "indice_uv")) != null) e.uvIndex = v;
        String s = texto(json, "nivel_uv"); if (s != null) e.uvLevel = s;
        s = texto(json, "nivel_chuva"); if (s != null) e.rainLevel = s;
        s = texto(json, "digital_chuva"); if (s != null) e.isRaining = s.equalsIgnoreCase("Chovendo");
        if ((v = numero(json, "intens_vento")) != null) e.windSpeedMs = v;
        if ((v = numero(json, "direcao_vento")) != null) e.windDirectionDeg = v.intValue();
        e.timestampUnix = System.currentTimeMillis() / 1000L;
    }

    private static void transmitirParaUsuario(String userId) {
        if (userId == null || userId.isBlank()) return;
        CopyOnWriteArrayList<HttpExchange> assinantes = assinantesPorUsuario.get(userId);
        if (assinantes == null) return;
        String evento = "data: " + listaComoJson(estacoesDoUsuario(userId)) + "\n\n";
        for (HttpExchange ex : assinantes) {
            try { enviar(ex, evento); }
            catch (IOException e) { removerAssinante(userId, ex); }
        }
    }

    private static void enviarHeartbeats() {
        for (Map.Entry<String, CopyOnWriteArrayList<HttpExchange>> entry : assinantesPorUsuario.entrySet()) {
            for (HttpExchange ex : entry.getValue()) {
                try { enviar(ex, ": heartbeat\n\n"); }
                catch (IOException e) { removerAssinante(entry.getKey(), ex); }
            }
        }
    }

    private static void enviar(HttpExchange exchange, String texto) throws IOException {
        OutputStream out = exchange.getResponseBody();
        out.write(texto.getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private static void removerAssinante(String userId, HttpExchange exchange) {
        CopyOnWriteArrayList<HttpExchange> lista = assinantesPorUsuario.get(userId);
        if (lista != null) {
            lista.remove(exchange);
            if (lista.isEmpty()) assinantesPorUsuario.remove(userId, lista);
        }
        try { exchange.close(); } catch (Exception ignored) { }
    }

    private static List<Estacao> estacoesDoUsuario(String userId) {
        List<Estacao> resultado = new ArrayList<>();
        for (Estacao e : estacoes.values()) if (userId.equals(e.userId)) resultado.add(e);
        return resultado;
    }

    static class Estacao {
        final String stationId;
        volatile String userId;
        volatile String name;
        volatile long timestampUnix;
        volatile int timezoneUnix;
        volatile double temperatureC, humidityPct, pressureHpa, co2Ppm, tvocPpb, altitudeM, lux, uvIndex, windSpeedMs;
        volatile String uvLevel = "", rainLevel = "";
        volatile boolean isRaining;
        volatile int windDirectionDeg;
        Estacao(String stationId) { this.stationId = stationId; this.name = stationId; }
    }

    private static String listaComoJson(Collection<Estacao> lista) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Estacao e : lista) {
            if (!first) sb.append(',');
            sb.append(estacaoParaJson(e)); first = false;
        }
        return sb.append(']').toString();
    }

    private static String estacaoParaJson(Estacao e) {
        return String.format(Locale.US,
            "{\"station_id\":\"%s\",\"user_id\":\"%s\",\"name\":\"%s\",\"timestamp_unix\":%d,\"timezone_unix\":%d,\"temperature_c\":%.2f,\"humidity_pct\":%.2f,\"pressure_hpa\":%.2f,\"co2_ppm\":%.2f,\"tvoc_ppb\":%.2f,\"altitude_m\":%.2f,\"lux\":%.2f,\"uv_index\":%.2f,\"uv_level\":\"%s\",\"rain_level\":\"%s\",\"is_raining\":%b,\"wind_speed_ms\":%.2f,\"wind_direction_deg\":%d}",
            escaparJson(e.stationId), escaparJson(e.userId), escaparJson(e.name), e.timestampUnix, e.timezoneUnix,
            e.temperatureC, e.humidityPct, e.pressureHpa, e.co2Ppm, e.tvocPpb, e.altitudeM, e.lux, e.uvIndex,
            escaparJson(e.uvLevel), escaparJson(e.rainLevel), e.isRaining, e.windSpeedMs, e.windDirectionDeg);
    }

    private static String lerCorpo(HttpExchange e) throws IOException {
        return new String(e.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static String primeiroTexto(String json, String... campos) {
        for (String campo : campos) { String v = texto(json, campo); if (v != null) return v; }
        return null;
    }

    private static String texto(String json, String campo) {
        String key = "\"" + campo + "\"";
        int p = json.indexOf(key); if (p < 0) return null;
        int colon = json.indexOf(':', p + key.length()); if (colon < 0) return null;
        int a = json.indexOf('"', colon + 1); if (a < 0) return null;
        int b = a + 1;
        while ((b = json.indexOf('"', b)) >= 0 && json.charAt(b - 1) == '\\') b++;
        if (b < 0) return null;
        return json.substring(a + 1, b).replace("\\\"", "\"").replace("\\\\", "\\");
    }

    private static Double numero(String json, String campo) {
        String key = "\"" + campo + "\"";
        int p = json.indexOf(key); if (p < 0) return null;
        int colon = json.indexOf(':', p + key.length()); if (colon < 0) return null;
        int end = colon + 1;
        while (end < json.length() && ",}".indexOf(json.charAt(end)) < 0) end++;
        try { return Double.parseDouble(json.substring(colon + 1, end).trim()); }
        catch (Exception ignored) { return null; }
    }

    private static String parametro(HttpExchange exchange, String nome) {
        String query = exchange.getRequestURI().getRawQuery(); if (query == null) return null;
        for (String part : query.split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2 && kv[0].equals(nome)) {
                try { return URLDecoder.decode(kv[1], StandardCharsets.UTF_8); }
                catch (Exception ignored) { return kv[1]; }
            }
        }
        return null;
    }

    private static String escaparJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    private static boolean isOptions(HttpExchange e) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(e.getRequestMethod())) { e.sendResponseHeaders(204, -1); return true; }
        return false;
    }

    private static void adicionarCors(HttpExchange e) {
        e.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        e.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        e.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private static void responder(HttpExchange e, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        e.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        e.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = e.getResponseBody()) { out.write(bytes); }
    }
    
    private static Connection conectarBanco() throws SQLException {
        return DriverManager.getConnection(
            URL_BANCO,
            USUARIO_BANCO,
            SENHA_BANCO
        );
    }
    
    private static void testarBanco() {
        try (Connection conn = conectarBanco()) {
            System.out.println("Conexao com o MySQL realizada com sucesso!");
        } catch (SQLException e) {
            System.out.println("Erro ao conectar ao MySQL:");
            e.printStackTrace();
        }
    }
    
    private static void salvarLeituraNoBanco(Estacao e) {
        String sql =
            "INSERT INTO leituras (" +
            "estacao_id, user_id, nome, timestamp_unix, timezone_unix, " +
            "temperatura, umidade, pressao, co2, tvoc, altitude, lux, indice_uv, " +
            "nivel_uv, nivel_chuva, digital_chuva, intens_vento, direcao_vento" +
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        try (Connection conn = conectarBanco();
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            stmt.setString(1, e.stationId);
            stmt.setString(2, e.userId);
            stmt.setString(3, e.name);
            stmt.setLong(4, e.timestampUnix);
            stmt.setInt(5, e.timezoneUnix);
            stmt.setDouble(6, e.temperatureC);
            stmt.setDouble(7, e.humidityPct);
            stmt.setDouble(8, e.pressureHpa);
            stmt.setDouble(9, e.co2Ppm);
            stmt.setDouble(10, e.tvocPpb);
            stmt.setDouble(11, e.altitudeM);
            stmt.setDouble(12, e.lux);
            stmt.setDouble(13, e.uvIndex);
            stmt.setString(14, e.uvLevel);
            stmt.setString(15, e.rainLevel);
            stmt.setString(16, e.isRaining ? "Chovendo" : "Nao chovendo");
            stmt.setDouble(17, e.windSpeedMs);
            stmt.setInt(18, e.windDirectionDeg);

            stmt.executeUpdate();

            System.out.println("Leitura salva no MySQL: " + e.stationId);

        } catch (SQLException ex) {
            System.out.println("Erro ao salvar leitura no MySQL:");
            ex.printStackTrace();
        }
    }
}

// Compile: javac ServidorEstacoes.java
// Run:     java ServidorEstacoes
// Java 11+ is required because the code uses readAllBytes().

// Arduino payload expected at /api/estacao:
// {"estacao_id":"S231234W0461234","temperatura":28.5,"umidade":65,"pressao":101320}

// IMPORTANT: the Arduino must not send user_id. The station owner is defined by /stations/add.

// If the frontend is served from another computer, replace localhost in the JS files by the
// LAN IP or DNS name of the computer running this server.