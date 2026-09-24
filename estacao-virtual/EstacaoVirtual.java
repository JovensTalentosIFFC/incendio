package estacaoVirtual;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Random;

public class EstacaoVirtual {

    private static final String URL_SERVIDOR =
            "http://localhost:8080/api/estacao";

    private static final String ESTACAO_ID = "VIRTUAL_01";

    private static final HttpClient CLIENT = HttpClient.newHttpClient();
    private static final Random RANDOM = new Random();

    public static void main(String[] args) {

        System.out.println("Estacao virtual iniciada.");
        System.out.println("Enviando dados para: " + URL_SERVIDOR);

        while (true) {
            try {

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

                String json = String.format(
                    java.util.Locale.US,
                    """
                    {
                        "estacao_id":"%s",
                        "estacao_alias":"Estacao Virtual 01",
                        "estacao_UTC":3,
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
                    ESTACAO_ID,
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

                enviarDados(json);

                Thread.sleep(5000);

            } catch (Exception e) {
                System.out.println("Erro: " + e.getMessage());

                try {
                    Thread.sleep(5000);
                } catch (InterruptedException ignored) {
                }
            }
        }
    }

    private static void enviarDados(String json) throws Exception {

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(URL_SERVIDOR))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        HttpResponse<String> response =
                CLIENT.send(request,
                        HttpResponse.BodyHandlers.ofString());

        System.out.println("--------------------------------");
        System.out.println("Dados enviados:");
        System.out.println(json);
        System.out.println("Resposta do servidor: "
                + response.statusCode());
        System.out.println(response.body());
    }
}