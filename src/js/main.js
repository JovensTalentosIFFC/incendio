let data;
let csvInput = document.getElementById("csv");

// objeto para armazenar os dados do gráfico
let values = {
  registros: [],
  previsao: [],
  aviso: ''
};

// ⚠️ NÃO deixe a chave da API no código do navegador (qualquer pessoa vê).
// Gere uma nova no painel da OpenWeather e, de preferência, faça a chamada pelo seu servidor.
const OWM_KEY = 'COLE_SUA_CHAVE_AQUI';

const fetchAPI = async () => {
  data = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Campos&appid=${OWM_KEY}&units=metric&lang=pt_br`);
  data = await data.json();
};

const start = async () => {
  await fetchAPI();

  h1Temp.textContent = Math.floor(data.main.temp) + ' °C';

  let date = new Date(data.dt * 1000);
  let minutes = '0' + date.getMinutes();
  h1Clock.textContent = date.getHours() + ':' + minutes.substr(-2);

  weatherSpecsSpans.forEach((k, i) => {
    switch (i) {
      case 0: k.textContent = data.wind.speed + ' m/s'; break;
      case 1: k.textContent = data.main.humidity + ' %'; break;
      case 2: k.textContent = data.visibility / 1000 + ' km'; break;
      case 3: k.textContent = data.main.pressure + ' hPa'; break;
      case 4: k.textContent = Math.floor(data.main.feels_like) + ' °C'; break;
      case 5: k.textContent = Math.floor(data.main.temp_max) + ' °C'; break;
    }
  });
};

const weatherSpecsSpans = Array.from(document.querySelectorAll('.weatherSpecs li span'));
const h1Temp = document.querySelector('.weatherInfos .left .imgContainer .mainTemperature');
const h1Clock = document.querySelector('.weatherInfos .left .imgContainer .mainClock');

// botão importar
const btnImportar = document.getElementById("btnImportar");

btnImportar.addEventListener("click", () => {
  csvInput.click();
});

csvInput.addEventListener("change", () => {
  nomeArquivo.textContent = csvInput.files.length > 0
    ? csvInput.files[0].name
    : "Nenhum arquivo selecionado";
});

csvInput.addEventListener("change", loadCsv);

const API_BASE_URL = 'http://localhost:8080';
const API_PREVISAO = 'http://localhost:8081';
const selectEstacao = document.getElementById('selectEstacao');
const selectPeriodo = document.getElementById('selectPeriodo');

// ---------------------------------------------------------------- importar CSV

function loadCsv() {
  const file = csvInput.files[0];

  if (!file) {
    alert("Selecione um arquivo CSV primeiro!");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    const text = e.target.result;
    const linhas = text.split('\n').map(l => l.trim()).filter(l => l);

    if (linhas.length === 0) {
      alert("CSV vazio!");
      return;
    }

    const cabecalhoEsperado = "station_id,timestamp_unix,timezone_unix,temperature_c,humidity_pct,pressure_hpa,wind_speed_ms,wind_direction_deg";

    if (linhas[0] && linhas[0].toLowerCase().startsWith(cabecalhoEsperado)) {
      linhas.shift();
    } else {
      alert("❌ Cabeçalho inválido!");
      return;
    }

    const registros = linhas.map((linha) => {
      const [station_id, timestamp_unix, timezone_unix, temperature_c, humidity_pct, pressure_hpa, wind_speed_ms, wind_direction_deg] = linha.split(',');

      if (!station_id) {
        console.error("Linha inválida:", linha);
        return null;
      }

      return {
        station_id,
        timestamp_unix: +timestamp_unix,
        timezone_unix: +timezone_unix,
        temperature_c: +temperature_c,
        humidity_pct: +humidity_pct,
        pressure_hpa: +pressure_hpa,
        wind_speed_ms: +wind_speed_ms,
        wind_direction_deg: +wind_direction_deg
      };
    }).filter(p => p !== null);

    ciclo++; // cancela qualquer atualização em andamento
    values.registros = detectarIncendio(registros);
    values.previsao = [];   // CSV importado não tem previsão
    values.aviso = '';
    criarGrafico(values.registros, values.previsao, values.aviso);
  };

  reader.readAsText(file, 'UTF-8');
}

function detectarIncendio(registros) {
  return registros.map(r => {
    let incendio = false;

    if (r.temperature_c >= 30 && r.humidity_pct <= 30) incendio = true;
    if (r.temperature_c >= 100) incendio = true;

    return { ...r, incendio };
  });
}

function formatarHora(timestamp, comSegundos = false) {
  const d = new Date(timestamp * 1000);
  const hm = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  return comSegundos ? hm + ":" + String(d.getSeconds()).padStart(2, "0") : hm;
}

// ---------------------------------------------------------------- gráfico

function criarGrafico(registros, previsoes = [], aviso = '') {
  const ponto = (t, y) => ({ x: t, y });

  const historico = registros.map(r => ponto(r.timestamp_unix, r.temperature_c));
  const incendios = registros.filter(r => r.incendio).map(r => ponto(r.timestamp_unix, r.temperature_c));

  // A previsão começa no último ponto real, para a linha tracejada "grudar" no histórico.
  const ultimo = registros[registros.length - 1];
  const ancora = ultimo ? [ponto(ultimo.timestamp_unix, ultimo.temperature_c)] : [];
  const linhaPrevisao = previsoes.length ? [...ancora, ...previsoes.map(p => ponto(p.timestamp_unix, p.temperature_c))] : [];
  const faixaMin = previsoes.length ? [...ancora, ...previsoes.map(p => ponto(p.timestamp_unix, p.minima_c ?? p.temperature_c))] : [];
  const faixaMax = previsoes.length ? [...ancora, ...previsoes.map(p => ponto(p.timestamp_unix, p.maxima_c ?? p.temperature_c))] : [];

  // Se o histórico dura poucos minutos, mostra segundos no eixo.
  const span = registros.length ? registros[registros.length - 1].timestamp_unix - registros[0].timestamp_unix : 0;
  const comSegundos = span < 600 && previsoes.length === 0;

  const ctx = document.getElementById("grafico").getContext("2d");

  if (window.graficoIncendio) window.graficoIncendio.destroy();

  window.graficoIncendio = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: "Temperatura (°C)",
          data: historico,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointRadius: historico.length > 100 ? 0 : 2,
          pointHoverRadius: 6
        },
        {
          label: "🔥 Risco de Incêndio",
          data: incendios,
          borderColor: "#dc2626",
          backgroundColor: "#dc2626",
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false
        },
        {
          label: "Previsão (°C)",
          data: linhaPrevisao,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.15)",
          borderDash: [6, 6],
          borderWidth: 3,
          tension: 0.4,
          fill: false,
          pointRadius: 3,
          pointHoverRadius: 6
        },
        {
          label: "_min", // escondido da legenda
          data: faixaMin,
          borderColor: "transparent",
          backgroundColor: "transparent",
          pointRadius: 0,
          tension: 0.4,
          fill: false
        },
        {
          label: "Faixa provável",
          data: faixaMax,
          borderColor: "transparent",
          backgroundColor: "rgba(245, 158, 11, 0.18)",
          pointRadius: 0,
          tension: 0.4,
          fill: '-1' // preenche até o dataset anterior (_min)
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        title: {
          display: !!aviso,
          text: aviso,
          color: "#92400e",
          font: { size: 13 }
        },
        legend: {
          labels: {
            color: "#111",
            font: { size: 13, weight: 'bold' },
            filter: (item) => item.text !== '_min'
          }
        },
        tooltip: {
          backgroundColor: "#111827",
          padding: 12,
          titleFont: { size: 14 },
          bodyFont: { size: 13 },
          filter: (item) => item.dataset.label !== '_min',
          callbacks: {
            title: (items) => formatarHora(items[0].parsed.x, true)
          }
        }
      },
      scales: {
        x: {
          type: 'linear', // espaçamento proporcional ao tempo real
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#333",
            maxTicksLimit: 8,
            callback: (v) => formatarHora(v, comSegundos)
          },
          title: {
            display: true,
            text: "Horário",
            color: "#111",
            font: { size: 14, weight: 'bold' }
          }
        },
        y: {
          // sem beginAtZero: com ele a curva de ~29 °C vira uma linha reta
          grace: '10%',
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: { color: "#333" },
          title: {
            display: true,
            text: "Temperatura (°C)",
            color: "#111",
            font: { size: 14, weight: 'bold' }
          }
        }
      }
    }
  });
}

// ---------------------------------------------------------------- dados do servidor

async function carregarEstacoes() {
  const resp = await fetch(`${API_BASE_URL}/stations`);
  const lista = await resp.json();

  lista.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.station_id;
    opt.textContent = `${s.name} (${s.station_id})`;
    selectEstacao.appendChild(opt);
  });

  if (lista.length) atualizar();
}

function csvParaRegistros(texto) {
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (linhas.length < 2) return [];

  const cont = (c) => linhas[0].split(c).length - 1;
  const sep = cont(';') > 0 && cont(';') >= cont(',') ? ';' : ',';
  const cab = linhas[0].split(sep).map(c => c.trim().toLowerCase());

  const col = (teste) => cab.findIndex(teste);
  const iTempo = col(h => h === 'timestamp_unix' || h === 'timestamp');
  const iData = col(h => h.includes('data'));
  const iTz = col(h => h.includes('timezone') || h.includes('fuso'));
  const iTemp = col(h => h.includes('temp'));
  const iUmid = col(h => h.includes('umid') || h.includes('humid'));
  const iPress = col(h => h.includes('press'));
  const iDir = col(h => (h.includes('vento') || h.includes('wind')) && h.includes('dir'));
  const iVento = col(h => (h.includes('vento') || h.includes('wind')) && !h.includes('dir'));
  const iId = col(h => h === 'station_id' || h === 'estacao_id');

  const num = (v) => (v === undefined || v === '') ? NaN : Number(String(v).replace(',', '.'));

  const lerData = (txt) => {
    const m = /^(\d{2,4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(txt || '');
    if (!m) return NaN;
    const ano = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
    return new Date(ano, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime() / 1000;
  };

  return linhas.slice(1).map((linha) => {
    const v = linha.split(sep).map(c => c.trim());
    return {
      station_id: iId >= 0 ? v[iId] : undefined,
      timestamp_unix: iTempo >= 0 ? num(v[iTempo]) : lerData(v[iData]),
      timezone_unix: iTz >= 0 ? num(v[iTz]) : 0,
      temperature_c: num(v[iTemp]),
      humidity_pct: num(v[iUmid]),
      pressure_hpa: num(v[iPress]),
      wind_speed_ms: num(v[iVento]),
      wind_direction_deg: num(v[iDir])
    };
  }).filter(r => Number.isFinite(r.timestamp_unix) && Number.isFinite(r.temperature_c));
}

// Só retorna dados (não desenha), para o desenho acontecer uma única vez com histórico + previsão.
async function buscarHistorico(id, horas) {
  try {
    const dias = Math.max(1, Math.ceil(horas / 24));
    const resp = await fetch(`${API_BASE_URL}/stations/export?id=${id}&dias=${dias}`);
    if (!resp.ok) { console.error('Falha ao carregar histórico:', resp.status); return []; }

    const desde = Date.now() / 1000 - horas * 3600;
    return csvParaRegistros(await resp.text())
      .filter(r => r.timestamp_unix >= desde)
      .sort((a, b) => a.timestamp_unix - b.timestamp_unix);
  } catch (erro) {
    console.error('Erro ao buscar histórico:', erro);
    return [];
  }
}

async function buscarPrevisao(id, horas) {
  try {
    const resp = await fetch(`${API_PREVISAO}/forecast?id=${id}&horas=${horas}`);
    if (!resp.ok) { console.error('Falha ao carregar previsão:', resp.status); return { previsao: [], aviso: 'Servidor de previsão indisponível' }; }
    const dados = await resp.json();
    return { previsao: dados.previsao || [], aviso: dados.aviso || '' };
  } catch (erro) {
    console.error('Erro ao buscar previsão (o servidor Python na porta 8081 está rodando?):', erro);
    return { previsao: [], aviso: 'Servidor de previsão indisponível' };
  }
}

// Evita que uma resposta antiga sobrescreva uma mais nova (ex.: trocar de estação rapidamente).
let ciclo = 0;

async function atualizar() {
  if (!selectEstacao.value) return;

  const meu = ++ciclo;
  const id = encodeURIComponent(selectEstacao.value);
  const horas = Number(selectPeriodo.value) || 24;

  const [registros, prev] = await Promise.all([
    buscarHistorico(id, horas),
    buscarPrevisao(id, horas)
  ]);

  if (meu !== ciclo) return;

  console.log(`Histórico: ${registros.length} registros | Previsão: ${prev.previsao.length} pontos`);

  values.registros = detectarIncendio(registros);
  values.previsao = prev.previsao;
  values.aviso = prev.aviso;
  criarGrafico(values.registros, values.previsao, values.aviso);
}

selectEstacao.addEventListener('change', atualizar);
selectPeriodo.addEventListener('change', atualizar);

carregarEstacoes();
start();