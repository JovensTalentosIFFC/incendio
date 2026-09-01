const API_BASE_URL = 'http://localhost:8080';
const FIXED_STATION_ID = 'S217618W413393';
const FIXED_STATION_USER_ID = 'teste';

const currentStation = JSON.parse(localStorage.getItem('currentStation') || 'null');
const selectedStationId = currentStation?.stationId || currentStation?.station_id;

if (!currentStation || !selectedStationId) {
  window.location.href = 'stations.html';
  throw new Error('Nenhuma estação foi selecionada.');
}

function parseStationId(stationId) {
  if (!stationId || stationId.length < 14) {
    return { lat: '--', lon: '--' };
  }

  const latDirection = stationId[0];
  const latRaw = stationId.slice(1, 7);
  const lonDirection = stationId[7];
  const lonRaw = stationId.slice(8, 14);

  const lat = Number(`${latRaw.slice(0, 2)}.${latRaw.slice(2)}`);
  const lon = Number(`${lonRaw.slice(0, 2)}.${lonRaw.slice(2)}`);

  return {
    lat: latDirection === 'S' ? -lat : lat,
    lon: lonDirection === 'W' ? -lon : lon
  };
}

function element(...selectors) {
  for (const selector of selectors) {
    const found = document.querySelector(selector);
    if (found) return found;
  }
  return null;
}

function setText(value, ...selectors) {
  const target = element(...selectors);
  if (target) target.textContent = value ?? '--';
}

function formatNumber(value, digits = 1, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${number.toFixed(digits)}${suffix}`;
}

function formatDate(timestampUnix, timezoneUnix) {
  const timestamp = Number(timestampUnix);
  const timezone = Number(timezoneUnix || 0);
  if (!Number.isFinite(timestamp)) return '--';

  const date = new Date((timestamp + timezone) * 1000);
  const pad = (value) => String(value).padStart(2, '0');

  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function updateHumidityImage(humidity) {
  const image = document.getElementById('humidityImg');
  if (!image) return;

  const value = Number(humidity);
  const levels = [
    { max: 20, file: 'muito-seco' },
    { max: 40, file: 'seco' },
    { max: 60, file: 'moderado' },
    { max: 80, file: 'umido' },
    { max: 100, file: 'muito-umido' }
  ];

  const level = levels.find((item) => value <= item.max) || levels[levels.length - 1];
  image.src = `./assets/imgs/${level.file}.png`;
  image.alt = `Nível de umidade: ${level.file}`;
}

function getWindDirection(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return { label: '--', file: null };

  const labels = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const files = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
  const index = ((Math.round(value / 45) % 8) + 8) % 8;

  return { label: labels[index], file: files[index] };
}

function updateWindImage(degrees) {
  const image = document.getElementById('windDirectionImg');
  if (!image) return;

  const direction = getWindDirection(degrees);
  if (direction.file) {
    image.src = `./assets/imgs/${direction.file}.png`;
    image.alt = `Direção do vento: ${direction.label}`;
  }
}

function renderStation(data) {
  setText(data.name || data.station_id, '.weatherInfos .topBar h3', '.stationName');
  setText(formatDate(data.timestamp_unix, data.timezone_unix), '.date');

  setText(formatNumber(data.temperature_c, 1, ' °C'), '.temperature');
  setText(formatNumber(data.humidity_pct, 0, ' %'), '.humidity');
  setText(formatNumber(data.pressure_hpa, 1, ' hPa'), '.pressure');
  setText(formatNumber(data.co2_ppm, 0, ' ppm'), '.co2', '.co2Ppm', '.co2Value');
  setText(formatNumber(data.tvoc_ppb, 0, ' ppb'), '.tvoc', '.tvocPpb', '.tvocValue');
  setText(formatNumber(data.altitude_m, 1, ' m'), '.altitude', '.altitudeM', '.altitudeValue');
  setText(formatNumber(data.lux, 0, ' lux'), '.lux', '.luxValue');
  setText(formatNumber(data.uv_index, 1, ''), '.uvIndex', '.uv-index', '.uvValue');
  setText(data.uv_level || '--', '.uvLevel', '.uv-level');
  setText(data.rain_level || '--', '.rainLevel', '.rain-level');
  setText(data.is_raining ? 'Chovendo' : (data.rain_level || 'Sem Chuva'), '.rain', '.rainStatus', '.rain-status');
  setText(formatNumber(data.wind_speed_ms, 1, ' m/s'), '.windSpeed');

  const windDirection = getWindDirection(data.wind_direction_deg);
  const windText = Number.isFinite(Number(data.wind_direction_deg))
    ? `${formatNumber(data.wind_direction_deg, 0, '°')} (${windDirection.label})`
    : '--';
  setText(windText, '.windDirection');

  updateHumidityImage(data.humidity_pct);
  updateWindImage(data.wind_direction_deg);
}

function normalizeCurrentStation(station) {
  return {
    station_id: station.station_id ?? station.stationId,
    user_id: station.user_id ?? station.userId,
    name: station.name,
    timestamp_unix: station.timestamp_unix ?? station.timestampUnix,
    timezone_unix: station.timezone_unix ?? station.timezoneUnix,
    temperature_c: station.temperature_c ?? station.temperatureC,
    humidity_pct: station.humidity_pct ?? station.humidityPct,
    pressure_hpa: station.pressure_hpa ?? station.pressureHpa,
    co2_ppm: station.co2_ppm ?? station.co2Ppm,
    tvoc_ppb: station.tvoc_ppb ?? station.tvocPpb,
    altitude_m: station.altitude_m ?? station.altitudeM,
    lux: station.lux,
    uv_index: station.uv_index ?? station.uvIndex,
    uv_level: station.uv_level ?? station.uvLevel,
    rain_level: station.rain_level ?? station.rainLevel,
    is_raining: station.is_raining ?? station.isRaining,
    wind_speed_ms: station.wind_speed_ms ?? station.windSpeedMs,
    wind_direction_deg: station.wind_direction_deg ?? station.windDirectionDeg
  };
}

const { lat, lon } = parseStationId(selectedStationId);
setText(lat, '.latitude');
setText(lon, '.longitude');

// Mostra imediatamente os dados que vieram da lista.
// Depois, o SSE substitui esses valores pelos dados mais recentes.
renderStation(normalizeCurrentStation(currentStation));

// Para a estação do Arduino, o cadastro compartilhado é "teste".
// Para as demais estações, usa-se o userId armazenado na estação selecionada.
// A estação fixa do Arduino está cadastrada para o usuário compartilhado.
// Igual ao stations.js, esta tela deve consumir o SSE desse usuário.
const sseUserId = localStorage.getItem('userId') || currentStation.userId;

if (!sseUserId) {
  console.error('Não foi possível determinar o userId da estação.');
} else {
  const source = new EventSource(
    `${API_BASE_URL}/stations/currentData?userId=${encodeURIComponent(sseUserId)}`
  );

  source.onopen = () => {
    console.info('SSE da tela de detalhes conectado.');
  };

  source.onmessage = (event) => {
    try {
      const lista = JSON.parse(event.data);

      if (!Array.isArray(lista) || lista.length === 0) {
        console.warn('O SSE não retornou estações; mantendo os dados iniciais.');
        return;
      }

      // O backend envia a mesma lista usada pelo stations.js.
      // A estação fixa é o primeiro elemento da lista do usuário "teste".
      const data = lista[0];

      if (!data) {
        console.warn('O SSE retornou uma lista vazia.');
        return;
      }

      renderStation(data);

      // Mantém o localStorage atualizado para a próxima tela/retorno.
      localStorage.setItem('currentStation', JSON.stringify({
        ...currentStation,
        stationId: data.station_id || selectedStationId,
        userId: data.user_id || sseUserId,
        name: data.name
      }));
    } catch (error) {
      console.error('Erro ao interpretar o evento SSE:', error);
    }
  };

  source.onerror = () => {
    // Não fechar manualmente: EventSource tenta reconectar automaticamente.
    console.warn('SSE da tela de detalhes desconectado; aguardando reconexão.');
  };

  window.addEventListener('beforeunload', () => source.close());
}

const trashButton = document.querySelector('.bx.bxs-trash');
const allScreen = document.querySelector('.allScreen');

trashButton?.addEventListener('click', () => {
  allScreen?.classList.toggle('active');
});

async function deleteStation() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/stations/delete?id=${encodeURIComponent(selectedStationId)}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error(`Falha ao excluir estação: HTTP ${response.status}`);
    }

    localStorage.removeItem('currentStation');
    window.location.href = 'stations.html';
  } catch (error) {
    console.error(error);
    alert('Não foi possível excluir a estação.');
  }
}

function cancelDeleteStation() {
  allScreen?.classList.remove('active');
}

window.deleteStation = deleteStation;
window.cancelDeleteStation = cancelDeleteStation;
