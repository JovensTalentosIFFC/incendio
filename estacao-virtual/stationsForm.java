package estacaoVirtual;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Tela "Crie sua estação" em Swing.
 * Valida os campos, gera o stationId a partir de latitude/longitude
 * e faz POST em /stations/add.
 *
 * O checkbox "Estação virtual" acrescenta "Virtual" ao nome da estação.
 * O EstacaoVirtual simula dados para as estações cujo nome contém "virtual".
 */
public class stationsForm extends JFrame {

    // Deve apontar para o mesmo servidor (ServidorEstacoes).
    private static final String API_BASE_URL = "http://localhost:8080";

    // O servidor ignora o userId: todos veem todas as estações.
    private static final String USER_ID = "";

    private static final Color AZUL = new Color(0x1F3AC4);
    private static final Color AZUL_ESCURO = new Color(0x172D9C);
    private static final Color TEXTO = new Color(0x4A3F35);
    private static final Color CINZA = new Color(0x667085);

    private static final HttpClient CLIENT = HttpClient.newHttpClient();

    private final JTextField nomeField = new JTextField();
    private final JTextField latitudeField = new JTextField();
    private final JTextField longitudeField = new JTextField();
    private final JTextField fusoField = new JTextField();
    private final JCheckBox virtualCheck = new JCheckBox("Estação virtual (dados simulados)");
    private final JButton cadastrarBtn = new JButton("Cadastrar estação");

    // Chamado ao concluir o cadastro ou ao clicar em fechar (ex.: abrir a tela de listagem).
    private final Runnable aoVoltar;

    public stationsForm() {
        this(null);
    }

    public stationsForm(Runnable aoVoltar) {
        super("Crie sua estação");
        this.aoVoltar = aoVoltar;
        montarTela();
    }

    private void montarTela() {
        setDefaultCloseOperation(DISPOSE_ON_CLOSE);

        JPanel raiz = new JPanel(new BorderLayout());
        raiz.setBorder(new EmptyBorder(24, 32, 24, 32));
        raiz.setBackground(Color.WHITE);

        // Cabeçalho
        JPanel cabecalho = new JPanel(new BorderLayout());
        cabecalho.setOpaque(false);

        JLabel titulo = new JLabel("Crie sua estação", SwingConstants.CENTER);
        titulo.setFont(new Font("Segoe UI", Font.BOLD, 26));
        titulo.setForeground(TEXTO);

        JButton fechar = new JButton("✕");
        fechar.setFont(new Font("Segoe UI", Font.PLAIN, 18));
        fechar.setForeground(TEXTO);
        fechar.setContentAreaFilled(false);
        fechar.setBorderPainted(false);
        fechar.setFocusPainted(false);
        fechar.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        fechar.setToolTipText("Voltar para a lista de estações");
        fechar.addActionListener(e -> voltar());

        JLabel subtitulo = new JLabel("Adicione as informações da sua estação meteorológica.",
                SwingConstants.CENTER);
        subtitulo.setForeground(new Color(0x738DA2));

        JPanel topo = new JPanel(new BorderLayout());
        topo.setOpaque(false);
        topo.add(titulo, BorderLayout.CENTER);
        topo.add(fechar, BorderLayout.EAST);
        // espaçador à esquerda para manter o título centralizado
        topo.add(Box.createRigidArea(fechar.getPreferredSize()), BorderLayout.WEST);

        cabecalho.add(topo, BorderLayout.NORTH);
        cabecalho.add(subtitulo, BorderLayout.SOUTH);
        cabecalho.setBorder(new EmptyBorder(0, 0, 20, 0));
        raiz.add(cabecalho, BorderLayout.NORTH);

        // Formulário
        JPanel form = new JPanel();
        form.setOpaque(false);
        form.setLayout(new BoxLayout(form, BoxLayout.Y_AXIS));

        form.add(campo("Nome da estação", nomeField, "Ex.: IFF Campos Centro", null));
        form.add(campo("Latitude", latitudeField, "Ex.: -21.7618", null));
        form.add(campo("Longitude", longitudeField, "Ex.: -41.3393", null));
        form.add(campo("Fuso horário da estação (offset em segundos)", fusoField,
                "Ex.: -10800 para UTC-3",
                "Para o valor do Arduino estacao_UTC: 3, informe -10800."));

        // Checkbox de estação virtual
        virtualCheck.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        virtualCheck.setForeground(TEXTO);
        virtualCheck.setOpaque(false);
        virtualCheck.setFocusPainted(false);
        virtualCheck.setToolTipText(
                "Acrescenta \"Virtual\" ao nome; o simulador envia dados para esse tipo de estação.");

        JPanel linhaVirtual = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
        linhaVirtual.setOpaque(false);
        linhaVirtual.setAlignmentX(Component.LEFT_ALIGNMENT);
        linhaVirtual.setBorder(new EmptyBorder(0, 0, 8, 0));
        linhaVirtual.add(virtualCheck);
        form.add(linhaVirtual);

        raiz.add(form, BorderLayout.CENTER);

        // Botão
        cadastrarBtn.setFont(new Font("Segoe UI", Font.BOLD, 14));
        cadastrarBtn.setForeground(Color.WHITE);
        cadastrarBtn.setBackground(AZUL);
        cadastrarBtn.setOpaque(true);
        cadastrarBtn.setBorderPainted(false);
        cadastrarBtn.setFocusPainted(false);
        cadastrarBtn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        cadastrarBtn.setBorder(new EmptyBorder(12, 28, 12, 28));
        cadastrarBtn.addActionListener(e -> cadastrar());
        cadastrarBtn.addMouseListener(new java.awt.event.MouseAdapter() {
            @Override public void mouseEntered(java.awt.event.MouseEvent e) {
                if (cadastrarBtn.isEnabled()) cadastrarBtn.setBackground(AZUL_ESCURO);
            }
            @Override public void mouseExited(java.awt.event.MouseEvent e) {
                cadastrarBtn.setBackground(AZUL);
            }
        });

        JPanel rodape = new JPanel(new FlowLayout(FlowLayout.CENTER));
        rodape.setOpaque(false);
        rodape.setBorder(new EmptyBorder(12, 0, 0, 0));
        rodape.add(cadastrarBtn);
        raiz.add(rodape, BorderLayout.SOUTH);

        setContentPane(raiz);
        getRootPane().setDefaultButton(cadastrarBtn); // Enter envia o formulário

        setSize(520, 620);
        setMinimumSize(new Dimension(460, 580));
        setLocationRelativeTo(null);
    }

    private JPanel campo(String rotulo, JTextField input, String dica, String ajuda) {
        JPanel p = new JPanel();
        p.setOpaque(false);
        p.setLayout(new BoxLayout(p, BoxLayout.Y_AXIS));
        p.setBorder(new EmptyBorder(0, 0, 14, 0));

        JLabel label = new JLabel(rotulo);
        label.setFont(new Font("Segoe UI", Font.BOLD, 13));
        label.setForeground(TEXTO);
        label.setAlignmentX(Component.LEFT_ALIGNMENT);

        input.setFont(new Font("Segoe UI", Font.PLAIN, 14));
        input.setToolTipText(dica);
        input.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(AZUL, 1, true),
                new EmptyBorder(8, 10, 8, 10)));
        input.setAlignmentX(Component.LEFT_ALIGNMENT);
        input.setMaximumSize(new Dimension(Integer.MAX_VALUE, input.getPreferredSize().height + 4));

        p.add(label);
        p.add(Box.createVerticalStrut(4));
        p.add(input);

        String textoAjuda = ajuda != null ? ajuda : dica;
        JLabel help = new JLabel(textoAjuda);
        help.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        help.setForeground(CINZA);
        help.setAlignmentX(Component.LEFT_ALIGNMENT);
        p.add(Box.createVerticalStrut(2));
        p.add(help);

        return p;
    }

    // ---------- Lógica ----------

    private void cadastrar() {
        String nome = nomeField.getText().trim();
        String latTxt = latitudeField.getText().trim().replace(',', '.');
        String lonTxt = longitudeField.getText().trim().replace(',', '.');
        String fusoTxt = fusoField.getText().trim();

        // Estação virtual: garante "Virtual" no nome, que é o que o simulador procura.
        if (virtualCheck.isSelected() && !nome.isEmpty()
                && !nome.toLowerCase(Locale.ROOT).contains("virtual")) {
            nome = "Virtual " + nome;
        }

        if (!validar(latTxt, lonTxt, fusoTxt, nome)) return;

        double latitude = Double.parseDouble(latTxt);
        double longitude = Double.parseDouble(lonTxt);
        int fuso = Integer.parseInt(fusoTxt);

        String stationId = gerarStationId(latitude, longitude);
        long timestamp = System.currentTimeMillis() / 1000L;

        String json = String.format(Locale.US,
                "{\"stationId\":\"%s\",\"userId\":\"%s\",\"name\":\"%s\",\"timeZone\":%d,\"timestamp\":%d}",
                escaparJson(stationId), escaparJson(USER_ID), escaparJson(nome), fuso, timestamp);

        cadastrarBtn.setEnabled(false);

        // Rede fora da thread da interface para não travar a janela.
        new SwingWorker<HttpResponse<String>, Void>() {
            @Override
            protected HttpResponse<String> doInBackground() throws Exception {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(API_BASE_URL + "/stations/add"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .build();
                return CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            }

            @Override
            protected void done() {
                try {
                    HttpResponse<String> resp = get();
                    if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
                        String detalhe = extrairErro(resp.body());
                        throw new RuntimeException(
                                "Falha ao cadastrar a estação (HTTP " + resp.statusCode() + ") " + detalhe);
                    }
                    JOptionPane.showMessageDialog(stationsForm.this,
                            "Estação cadastrada!\nID: " + stationId,
                            "Sucesso", JOptionPane.INFORMATION_MESSAGE);
                    voltar();
                } catch (Exception ex) {
                    ex.printStackTrace();
                    erro("Não foi possível cadastrar a estação. Verifique se o backend está ligado.");
                    cadastrarBtn.setEnabled(true);
                }
            }
        }.execute();
    }

    private boolean validar(String lat, String lon, String fuso, String nome) {
        if (lat.isEmpty() || lon.isEmpty() || fuso.isEmpty() || nome.isEmpty()) {
            erro("Preencha todos os campos.");
            return false;
        }

        double latitude, longitude;
        int tz;

        try {
            latitude = Double.parseDouble(lat);
            if (Double.isNaN(latitude) || Double.isInfinite(latitude)
                    || latitude < -90 || latitude > 90) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            erro("Latitude inválida. Use um valor entre -90 e 90.");
            return false;
        }

        try {
            longitude = Double.parseDouble(lon);
            if (Double.isNaN(longitude) || Double.isInfinite(longitude)
                    || longitude < -180 || longitude > 180) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            erro("Longitude inválida. Use um valor entre -180 e 180.");
            return false;
        }

        try {
            tz = Integer.parseInt(fuso);
            if (tz < -43200 || tz > 50400) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            erro("Fuso horário inválido. Informe o offset em segundos, por exemplo -10800 para UTC-3.");
            return false;
        }

        if (nome.length() > 20) {
            erro("O nome deve ter no máximo 20 caracteres"
                    + (virtualCheck.isSelected() ? " (o prefixo \"Virtual \" conta)." : "."));
            return false;
        }
        return true;
    }

    /** Mesmo formato do formulário JS: ex. S217618W413393 */
    private static String gerarStationId(double latitude, double longitude) {
        char latDir = latitude >= 0 ? 'N' : 'S';
        char lonDir = longitude >= 0 ? 'E' : 'W';
        String lat = String.format(Locale.US, "%.4f", Math.abs(latitude)).replace(".", "");
        String lon = String.format(Locale.US, "%.4f", Math.abs(longitude)).replace(".", "");
        return "" + latDir + zeros(lat, 6) + lonDir + zeros(lon, 6);
    }

    private static String zeros(String s, int tamanho) {
        StringBuilder sb = new StringBuilder();
        for (int i = s.length(); i < tamanho; i++) sb.append('0');
        return sb.append(s).toString();
    }

    private static String escaparJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }

    private static String extrairErro(String body) {
        if (body == null) return "";
        Matcher m = Pattern.compile("\"erro\"\\s*:\\s*\"([^\"]*)\"").matcher(body);
        return m.find() ? m.group(1) : "";
    }

    private void erro(String msg) {
        JOptionPane.showMessageDialog(this, msg, "Atenção", JOptionPane.WARNING_MESSAGE);
    }

    private void voltar() {
        dispose();
        if (aoVoltar != null) aoVoltar.run();
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> new stationsForm().setVisible(true));
    }
}