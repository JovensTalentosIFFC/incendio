package estacaoVirtual;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Simulador de estacoes meteorologicas.
 *
 * Nao tem nenhum ID fixo: a cada ciclo ele pergunta ao servidor quais estacoes
 * existem (GET /stations) e envia telemetria simulada para as que tem dono
 * (cadastradas pelo formulario) e cujo nome contem a palavra "virtual".
 * Para criar uma estacao virtual, basta cadastrar no formulario um nome como "Virtual 1".
 */
public class EstacaoVirtual {

    private static final String URL_BASE = "http://localhost:8080";
    private static final String URL_LISTA = URL_BASE + "/stations";
    private static final String URL_TELEMETRIA = URL_BASE + "/api/estacao";

    // Estacoes cujo nome contem este texto (sem diferenciar maiusculas) sao simuladas.
    private static final String MARCADOR = "virtual";

    // Segue a ordem dos campos gerada pelo servidor em estacaoParaJson():
    // station_id, user_id, name. Aceita user_id vazio.
    private static final Pattern ESTACAO = Pattern.compile(
            "\"station_id\":\"([^\"]*)\",\"user_id\":\"([^\"]*)\",\"name\":\"([^\"]*)\"");

    private static final HttpClient CLIENT = HttpClient.newHttpClient();
    private static final Random RANDOM = new Random();

    private static boolean avisouSemEstacoes = false;

    public static void main(String[] args) {

        System.out.println("Simulador iniciado. Servidor: " + URL_BASE);
        System.out.println("Simulando estacoes cujo nome contem \"" + MARCADOR + "\".");

        while (true) {
            try {
                ciclo();
            } catch (Exception e) {
                System.out.println("Erro: " + e.getMessage());
            }

            try {
                Thread.sleep(5000);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private static void ciclo() throws Exception {

        List<String> ids = buscarEstacoesVirtuais();

        if (ids.isEmpty()) {
            if (!avisouSemEstacoes) {
                System.out.println("Nenhuma estacao virtual encontrada. "
                        + "Crie uma no formulario com \"" + MARCADOR + "\" no nome.");
                avisouSemEstacoes = true;
            }
            return;
        }

        avisouSemEstacoes = false;

        for (String id : ids) {
            enviarDados(id, gerarJson(id));
        }
    }

    private static List<String> buscarEstacoesVirtuais() throws Exception {

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(URL_LISTA))
                .GET()
                .build();

        HttpResponse<String> response =
                CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new Exception("Falha ao listar estacoes: HTTP " + response.statusCode());
        }

        List<String> ids = new ArrayList<>();
        Matcher matcher = ESTACAO.matcher(response.body());

        while (matcher.find()) {
            String nome = matcher.group(3);
            if (nome.toLowerCase(Locale.ROOT).contains(MARCADOR)) {
                ids.add(matcher.group(1));
            }
        }

        return ids;
    }

    private static String gerarJson(String estacaoId) {

        double temperatura = 25 + RANDOM.nextDouble() * 8;
        double umidade = 50 + RANDOM.nextDouble() * 30;
        double pressao = 100500 + RANDOM.nextDouble() * 1500;
        double co2 = 400 + RANDOM.nextDouble() * 300;
        double tvoc = 80 + RANDOM.nextDouble() * 150;
        double altitude = 5;
        double lux = 300 + RANDOM.nextDouble() * 1000;
        double indiceUv = RANDOM.nextDouble() * 10;
        double vento = RANDOM.nextDouble() * 8;
        int direcaoVento = RANDOM.nextInt(360);

        String nivelUv;

        if (indiceUv < 3) {
            nivelUv = "Baixo";
        } else if (indiceUv < 6) {
            nivelUv = "Moderado";
        } else if (indiceUv < 8) {
            nivelUv = "Alto";
        } else {
            nivelUv = "Muito alto";
        }

        boolean estaChovendo = RANDOM.nextInt(5) == 0;

        String nivelChuva = estaChovendo
                ? "Chuva"
                : "Sem chuva";

        String digitalChuva = estaChovendo
                ? "Chovendo"
                : "Nao chovendo";

        // Sem estacao_alias e estacao_UTC: nome e fuso do formulario continuam valendo.
        return String.format(
            Locale.US,
            """
            {
                "estacao_id":"%s",
                "temperatura":%.2f,
                "umidade":%.2f,
                "pressao":%.2f,
                "CO2":%.2f,
                "TVOC":%.2f,
                "altitude":%.2f,
                "lux":%.2f,
                "indice_uv":%.2f,
                "nivel_uv":"%s",
                "nivel_chuva":"%s",
                "digital_chuva":"%s",
                "intens_vento":%.2f,
                "direcao_vento":%d
            }
            """,
            estacaoId,
            temperatura,
            umidade,
            pressao,
            co2,
            tvoc,
            altitude,
            lux,
            indiceUv,
            nivelUv,
            nivelChuva,
            digitalChuva,
            vento,
            direcaoVento
        );
    }

    private static void enviarDados(String estacaoId, String json) throws Exception {

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(URL_TELEMETRIA))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        HttpResponse<String> response =
                CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

        System.out.println("Enviado para " + estacaoId
                + " -> HTTP " + response.statusCode());

        if (response.statusCode() != 200) {
            System.out.println(response.body());
        }
    }
}