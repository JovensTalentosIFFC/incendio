// Deve ser o mesmo computador/IP usado pelo Arduino em http_server.
const API_BASE_URL = 'http://localhost:8080';
const MOCK_MODE = false; // false para usar o backend real
const MOCK_USER_ID = 'mock-user';
const FALLBACK_USER_ID = 'teste'; // usado quando a estacao nao tem userId (o servidor exige nao vazio)
const SSE_RETRY_MS = 3000;

const createStationButton = document.querySelector('#criar');
const stationsBody = document.querySelector('.stationsManager tbody');

// Estado: todas as estacoes por stationId (mantem a ordem de insercao).
const stationsById = new Map();
// Uma conexao SSE por userId, igual ao stationsData.js (que usa o userId da propria estacao).
const sseConnections = new Map(); // userId -> EventSource
const sseRetryTimers = new Map(); // userId -> timeout

if (!stationsBody) throw new Error('Elemento .stationsManager tbody nao encontrado.');

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
  stationsById.forEach((station) => {
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

function findRow(stationId) {
  return stationsBody.querySelector(`tr.stationCard[data-station-id="${CSS.escape(stationId)}"]`);
}

// Insere/atualiza estacoes vindas do servidor. So redesenha a tabela se aparecer
// uma estacao nova; caso contrario, atualiza as celulas das linhas existentes.
function upsertStations(list) {
  let hasNew = false;
  list.forEach((station) => {
    if (!station.stationId) return;
    if (!stationsById.has(station.stationId)) hasNew = true;
    stationsById.set(station.stationId, station);
  });

  if (hasNew) {
    renderStations();
    return;
  }

  list.forEach((station) => {
    const row = findRow(station.stationId);
    if (row) preencherLinha(row, station);
  });
}

stationsBody.addEventListener('click', (event) => {
  const row = event.target.closest('tr.stationCard');
  if (!row) return;
  const station = stationsById.get(row.dataset.stationId);
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
    upsertStations(mockStations.map(mapStation));
    return;
  }
  const response = await fetch(`${API_BASE_URL}/stations`);
  if (!response.ok) throw new Error(`Falha ao carregar estacoes: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Resposta invalida do backend.');
  upsertStations(data.map(mapStation));
}

// ---------- SSE ----------

function connectSSE(sseUserId) {
  clearTimeout(sseRetryTimers.get(sseUserId));
  sseConnections.get(sseUserId)?.close();

  const connection = new EventSource(
    `${API_BASE_URL}/stations/currentData?userId=${encodeURIComponent(sseUserId)}`
  );
  sseConnections.set(sseUserId, connection);

  connection.onopen = () => console.info(`SSE conectado (userId="${sseUserId}").`);

  connection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!Array.isArray(data)) throw new Error('Evento SSE nao contem uma lista.');
      console.debug(`SSE userId="${sseUserId}": ${data.length} estacao(oes)`);
      if (data.length === 0) return; // nunca apaga a tela por causa de uma lista vazia
      upsertStations(data.map(mapStation));
      ensureConnections(); // se apareceu um userId novo, abre a conexao dele
    } catch (error) {
      console.error('Evento SSE invalido:', error);
    }
  };

  connection.onerror = () => {
    // CONNECTING: o navegador reconecta sozinho. CLOSED: o servidor recusou
    // ou estava fora do ar ao abrir, entao reconectamos manualmente.
    if (connection.readyState === EventSource.CLOSED) {
      console.warn(`SSE fechado (userId="${sseUserId}"); tentando reconectar...`);
      sseRetryTimers.set(sseUserId, setTimeout(() => connectSSE(sseUserId), SSE_RETRY_MS));
    }
  };
}

// Abre uma conexao para cada userId presente nas estacoes (ou o fallback se nao houver nenhum).
function ensureConnections() {
  if (MOCK_MODE) return;

  const ids = new Set();
  stationsById.forEach((station) => ids.add(station.userId || FALLBACK_USER_ID));
  if (ids.size === 0) ids.add(FALLBACK_USER_ID);

  ids.forEach((id) => {
    if (!sseConnections.has(id)) connectSSE(id);
  });
}

async function start() {
  try {
    await loadInitialStations();
  } catch (error) {
    console.error(error);
    stationsBody.innerHTML =
      '<tr><td colspan="13">Servidor indisponível. Tentando reconectar...</td></tr>';
    setTimeout(start, 3000);
    return;
  }
  ensureConnections();
}

start();

window.addEventListener('beforeunload', () => {
  sseRetryTimers.forEach((timer) => clearTimeout(timer));
  sseConnections.forEach((connection) => connection.close());
});