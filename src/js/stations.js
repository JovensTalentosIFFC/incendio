// ============================================
// MODO MOCK (testar sem o backend)
// ============================================
// Deixe true enquanto o backend não estiver disponível na sua máquina.
// Quando for testar com a API real (ex: na máquina do seu colega, ou
// quando o backend estiver rodando aqui também), é só trocar para false
// — nenhuma outra linha precisa mudar.
const MOCK_MODE = true;

const MOCK_STATIONS = [
  {
    station_id: 'S231234W0461234',
    user_id: 'mock-user',
    name: 'Estação Centro',
    timestamp_unix: Math.floor(Date.now() / 1000),
    timezone_unix: -10800, // UTC-3
    temperature_c: 28.5,
    humidity_pct: 65,
    pressure_hpa: 1013.2,
    wind_speed_ms: 3.4,
    wind_direction_deg: 45
  },
  {
    station_id: 'S231987W0461987',
    user_id: 'mock-user',
    name: 'Estação Zona Sul',
    timestamp_unix: Math.floor(Date.now() / 1000),
    timezone_unix: -10800,
    temperature_c: 26.2,
    humidity_pct: 70,
    pressure_hpa: 1010.5,
    wind_speed_ms: 2.1,
    wind_direction_deg: 200
  },
  {
    station_id: 'S230456W0460456',
    user_id: 'mock-user',
    name: 'Estação Norte',
    timestamp_unix: Math.floor(Date.now() / 1000),
    timezone_unix: -10800,
    temperature_c: 31.0,
    humidity_pct: 55,
    pressure_hpa: 1015.8,
    wind_speed_ms: 5.6,
    wind_direction_deg: 90
  }
];

const userId = localStorage.getItem('userId');

const createStationButton = document.querySelector('#criar');
createStationButton.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "stationsForm.html";
});

const stationsBody = document.querySelector('.stationsManager tbody');
let stations = [];

// formata timestamp_unix (segundos) + timezone_unix (offset em segundos) em data/hora local da estação
function formatTimestamp(timestampUnix, timezoneUnix) {
  if (timestampUnix === undefined || timestampUnix === null) return '--';

  const offsetMs = (timezoneUnix ?? 0) * 1000;
  const date = new Date(timestampUnix * 1000 + offsetMs);

  const pad = (n) => String(n).padStart(2, '0');
  const dia = pad(date.getUTCDate());
  const mes = pad(date.getUTCMonth() + 1);
  const hora = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());

  return `${dia}/${mes} ${hora}:${min}`;
}

// desenha a tabela inteira (usado só na primeira renderização)
function renderStations() {
  stationsBody.innerHTML = '';

  stations.forEach((station) => {
    const tr = document.createElement('tr');
    tr.classList.add('stationCard');
    tr.dataset.stationId = station.stationId;

    tr.innerHTML = `
      <td class="stationName">${station.name}</td>
      <td class="stationId">${station.stationId}</td>
      <td class="stationTemp">${station.temperatureC?.toFixed(1) ?? '--'} °C</td>
      <td class="stationHumidity">${station.humidityPct?.toFixed(0) ?? '--'} %</td>
      <td class="stationPressure">${station.pressureHpa?.toFixed(1) ?? '--'} hPa</td>
      <td class="stationWindSpeed">${station.windSpeedMs?.toFixed(1) ?? '--'} m/s</td>
      <td class="stationWindDir">${station.windDirectionDeg ?? '--'}°</td>
      <td class="stationTimestamp">${formatTimestamp(station.timestampUnix, station.timezoneUnix)}</td>
    `;

    stationsBody.appendChild(tr);
  });
}

// atualiza só os valores que mudam, sem recriar as <tr> (evita "piscar" a tabela)
function updateStationsInPlace(novasStations) {
  novasStations.forEach((novaStation) => {
    const row = stationsBody.querySelector(`tr.stationCard[data-station-id="${novaStation.stationId}"]`);
    if (!row) return;

    row.querySelector('.stationTemp').textContent = `${novaStation.temperatureC?.toFixed(1) ?? '--'} °C`;
    row.querySelector('.stationHumidity').textContent = `${novaStation.humidityPct?.toFixed(0) ?? '--'} %`;
    row.querySelector('.stationPressure').textContent = `${novaStation.pressureHpa?.toFixed(1) ?? '--'} hPa`;
    row.querySelector('.stationWindSpeed').textContent = `${novaStation.windSpeedMs?.toFixed(1) ?? '--'} m/s`;
    row.querySelector('.stationWindDir').textContent = `${novaStation.windDirectionDeg ?? '--'}°`;
    row.querySelector('.stationTimestamp').textContent = formatTimestamp(novaStation.timestampUnix, novaStation.timezoneUnix);
  });
}

// clique numa linha -> vai pra tela de detalhe
stationsBody.addEventListener('click', (e) => {
  const row = e.target.closest('tr.stationCard');
  if (!row) return;

  const station = stations.find(s => s.stationId === row.dataset.stationId);
  if (!station) return;

  localStorage.setItem('currentStation', JSON.stringify(station));
  window.location.href = 'stationsData.html';
});

function mapStation(s) {
  return {
    stationId: s.station_id,
    userId: s.user_id,
    name: s.name,
    timestampUnix: s.timestamp_unix,
    timezoneUnix: s.timezone_unix,
    temperatureC: s.temperature_c,
    humidityPct: s.humidity_pct,
    pressureHpa: s.pressure_hpa,
    windSpeedMs: s.wind_speed_ms,
    windDirectionDeg: s.wind_direction_deg
  };
}

// 1) carrega a lista inicial via fetch normal (rota estática: /stations/byUserId)
async function loadInitialStations() {
  if (MOCK_MODE) {
    stations = MOCK_STATIONS.map(mapStation);
    renderStations();
    return;
  }

  try {
    const res = await fetch(`http://localhost:8080/stations/byUserId?userId=${userId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    stations = data.map(mapStation);
    renderStations();
  } catch (err) {
    console.error('Erro ao carregar estações:', err);
  }
}

// 2) abre o SSE (rota dinâmica: /stations/currentData) pra manter os dados atualizados
function connectSSE() {
  if (MOCK_MODE) {
    // Sem backend, não há o que escutar via SSE — a tabela já foi
    // preenchida pelo loadInitialStations() com os dados mock.
    return null;
  }

  const es = new EventSource(`http://localhost:8080/stations/currentData?userId=${userId}`);

  es.onmessage = (event) => {
    const novasStations = JSON.parse(event.data).map(mapStation);

    if (stations.length === 0) {
      stations = novasStations;
      renderStations();
    } else {
      stations = novasStations;
      updateStationsInPlace(novasStations);
    }
  };

  es.onerror = (err) => {
    console.error('Erro no SSE:', err);
  };

  return es;
}

loadInitialStations();
const sseConnection = connectSSE();

window.addEventListener('beforeunload', () => {
  sseConnection?.close();
});