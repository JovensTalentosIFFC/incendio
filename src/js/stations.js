// Deve ser o mesmo computador/IP usado pelo Arduino em http_server.
const API_BASE_URL = 'http://localhost:8080';
const MOCK_MODE = false; // false para usar o backend real
const MOCK_USER_ID = 'mock-user';

const userId = localStorage.getItem('userId');
const createStationButton = document.querySelector('#criar');
const stationsBody = document.querySelector('.stationsManager tbody');
let stations = [];
let sseConnection = null;

if (!stationsBody) throw new Error('Elemento .stationsManager tbody nao encontrado.');
if (!MOCK_MODE && !userId) {
  console.error('userId nao encontrado no localStorage. Redirecionando para o formulario.');
  window.location.href = 'stationsForm.html';
}

createStationButton?.addEventListener('click', (event) => {
  event.preventDefault();
  window.location.href = 'stationsForm.html';
});

function formatTimestamp(timestampUnix, timezoneUnix) {
  if (timestampUnix === undefined || timestampUnix === null) return '--';
  const date = new Date(timestampUnix * 1000 + (timezoneUnix ?? 0) * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function mapStation(s) {
  return {
    stationId: s.station_id,
    userId: s.user_id,
    name: s.name || s.station_id,
    timestampUnix: s.timestamp_unix,
    timezoneUnix: s.timezone_unix,
    temperatureC: s.temperature_c,
    humidityPct: s.humidity_pct,
    pressureHpa: s.pressure_hpa,
    co2Ppm: s.co2_ppm,
    tvocPpb: s.tvoc_ppb,
    altitudeM: s.altitude_m,
    lux: s.lux,
    uvIndex: s.uv_index,
    uvLevel: s.uv_level,
    rainLevel: s.rain_level,
    isRaining: s.is_raining,
    windSpeedMs: s.wind_speed_ms,
    windDirectionDeg: s.wind_direction_deg
  };
}

function number(value, digits, suffix) {
  return value === undefined || value === null || Number.isNaN(Number(value))
    ? '--'
    : `${Number(value).toFixed(digits)}${suffix}`;
}

function renderStations() {
  stationsBody.innerHTML = '';
  stations.forEach((station) => {
    const tr = document.createElement('tr');
    tr.className = 'stationCard';
    tr.dataset.stationId = station.stationId;
    tr.innerHTML = `
      <td class="stationName"></td><td class="stationId"></td>
      <td class="stationTemp"></td><td class="stationHumidity"></td>
      <td class="stationPressure"></td><td class="stationCo2"></td>
      <td class="stationTvoc"></td><td class="stationLux"></td>
      <td class="stationUv"></td><td class="stationRain"></td>
      <td class="stationWindSpeed"></td><td class="stationWindDir"></td>
      <td class="stationTimestamp"></td>`;
    preencherLinha(tr, station);
    stationsBody.appendChild(tr);
  });
}

function preencherLinha(row, station) {
  row.querySelector('.stationName').textContent = station.name ?? '--';
  row.querySelector('.stationId').textContent = station.stationId ?? '--';
  row.querySelector('.stationTemp').textContent = number(station.temperatureC, 1, ' °C');
  row.querySelector('.stationHumidity').textContent = number(station.humidityPct, 0, ' %');
  row.querySelector('.stationPressure').textContent = number(station.pressureHpa, 1, ' hPa');
  row.querySelector('.stationCo2').textContent = number(station.co2Ppm, 0, ' ppm');
  row.querySelector('.stationTvoc').textContent = number(station.tvocPpb, 0, ' ppb');
  row.querySelector('.stationLux').textContent = number(station.lux, 0, ' lux');
  row.querySelector('.stationUv').textContent = `${number(station.uvIndex, 1, '')} (${station.uvLevel ?? '--'})`;
  row.querySelector('.stationRain').textContent = station.isRaining ? 'Chovendo' : (station.rainLevel ?? '--');
  row.querySelector('.stationWindSpeed').textContent = number(station.windSpeedMs, 1, ' m/s');
  row.querySelector('.stationWindDir').textContent = number(station.windDirectionDeg, 0, '°');
  row.querySelector('.stationTimestamp').textContent = formatTimestamp(station.timestampUnix, station.timezoneUnix);
}

function sameStationSet(current, next) {
  if (current.length !== next.length) return false;
  const ids = new Set(current.map((station) => station.stationId));
  return next.every((station) => ids.has(station.stationId));
}

function updateStationsInPlace(nextStations) {
  nextStations.forEach((station) => {
    const row = stationsBody.querySelector(`tr.stationCard[data-station-id="${CSS.escape(station.stationId)}"]`);
    if (row) preencherLinha(row, station);
  });
}

stationsBody.addEventListener('click', (event) => {
  const row = event.target.closest('tr.stationCard');
  if (!row) return;
  const station = stations.find((item) => item.stationId === row.dataset.stationId);
  if (station) {
    localStorage.setItem('currentStation', JSON.stringify(station));
    window.location.href = 'stationsData.html';
  }
});

const mockStations = [
  { station_id: 'S231234W0461234', user_id: MOCK_USER_ID, name: 'Estacao Centro', timestamp_unix: Math.floor(Date.now() / 1000), timezone_unix: -10800, temperature_c: 28.5, humidity_pct: 65, pressure_hpa: 1013.2, co2_ppm: 480, tvoc_ppb: 12, altitude_m: 0, lux: 340, uv_index: 4.2, uv_level: 'Moderado', rain_level: 'Sem Chuva', is_raining: false, wind_speed_ms: 3.4, wind_direction_deg: 45 }
];

async function loadInitialStations() {
  if (MOCK_MODE) {
    stations = mockStations.map(mapStation);
    renderStations();
    return;
  }
  const response = await fetch(`${API_BASE_URL}/stations/byUserId?userId=${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error(`Falha ao carregar estacoes: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Resposta invalida do backend.');
  stations = data.map(mapStation);
  renderStations();
}

function connectSSE() {
  if (MOCK_MODE) return null;
  if (sseConnection) sseConnection.close();
  const connection = new EventSource(`${API_BASE_URL}/stations/currentData?userId=${encodeURIComponent(userId)}`);
  sseConnection = connection;
  connection.onopen = () => console.info('SSE conectado.');
  connection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!Array.isArray(data)) throw new Error('Evento SSE nao contem uma lista.');
      const nextStations = data.map(mapStation);
      const updateInPlace = sameStationSet(stations, nextStations);
      stations = nextStations;
      if (updateInPlace) updateStationsInPlace(nextStations);
      else renderStations();
    } catch (error) {
      console.error('Evento SSE invalido:', error);
    }
  };
  connection.onerror = () => console.warn('SSE desconectado; o navegador tentara reconectar.');
  return connection;
}

async function start() {
  try {
    await loadInitialStations();
    connectSSE();
  } catch (error) {
    console.error(error);
    stationsBody.innerHTML = '<tr><td colspan="13">Nao foi possivel carregar as estacoes.</td></tr>';
  }
}

start();
window.addEventListener('beforeunload', () => sseConnection?.close());
