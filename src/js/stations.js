const userId = localStorage.getItem('userId');

const createStationButton = document.querySelector('#criar');
createStationButton.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "stationsForm.html";
});

const stationsList = document.querySelector('.stationsManager');
let stations = [];

// desenha a lista inteira (usado só na primeira renderização)
function renderStations() {
  stationsList.innerHTML = '';

  stations.forEach((station) => {
    const li = document.createElement('li');
    li.classList.add('stationCard');
    li.dataset.stationId = station.stationId;

    li.innerHTML = `
      <p>Nome: <span class="stationName">${station.name}</span></p>
      <p>ID: <span class="stationId">${station.stationId}</span></p>
      <p>Temp: <span class="stationTemp">${station.temperatureC?.toFixed(1) ?? '--'}</span> °C</p>
      <p>Umidade: <span class="stationHumidity">${station.humidityPct?.toFixed(0) ?? '--'}</span> %</p>
      <p>Pressão: <span class="stationPressure">${station.pressureHpa?.toFixed(1) ?? '--'}</span> hPa</p>
      <p>Vento: <span class="stationWindSpeed">${station.windSpeedMs?.toFixed(1) ?? '--'}</span> m/s
         (<span class="stationWindDir">${station.windDirectionDeg ?? '--'}</span>°)</p>
    `;

    stationsList.appendChild(li);
  });
}

// atualiza só os valores que mudam, sem recriar os <li> (evita "piscar" a lista)
function updateStationsInPlace(novasStations) {
  novasStations.forEach((novaStation) => {
    const card = stationsList.querySelector(`.stationCard[data-station-id="${novaStation.stationId}"]`);
    if (!card) return;

    card.querySelector('.stationTemp').textContent = novaStation.temperatureC?.toFixed(1) ?? '--';
    card.querySelector('.stationHumidity').textContent = novaStation.humidityPct?.toFixed(0) ?? '--';
    card.querySelector('.stationPressure').textContent = novaStation.pressureHpa?.toFixed(1) ?? '--';
    card.querySelector('.stationWindSpeed').textContent = novaStation.windSpeedMs?.toFixed(1) ?? '--';
    card.querySelector('.stationWindDir').textContent = novaStation.windDirectionDeg ?? '--';
  });
}

// clique num card -> vai pra tela de detalhe
stationsList.addEventListener('click', (e) => {
  const card = e.target.closest('.stationCard');
  if (!card) return;

  const station = stations.find(s => s.stationId === card.dataset.stationId);
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
  sseConnection.close();
});