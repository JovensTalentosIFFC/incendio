// Deve apontar para o mesmo servidor usado em http_server no Arduino.
const API_BASE_URL = 'http://localhost:8080';

const submitBtn = document.querySelector('.submit-btn');
const latitudeInput = document.querySelector('#latitudeInput');
const longitudeInput = document.querySelector('#longitudeInput');
const timeZoneInput = document.querySelector('#timeZoneInput');
const nameInput = document.querySelector('#nameInput');

if (!submitBtn || !latitudeInput || !longitudeInput || !timeZoneInput || !nameInput) {
  throw new Error('Elementos obrigatorios do formulario nao encontrados.');
}

let userId = localStorage.getItem('userId');
if (!userId) {
  userId = crypto.randomUUID ? crypto.randomUUID() : `user-${Date.now()}`;
  localStorage.setItem('userId', userId);
}

function generateStationId(latitude, longitude) {
  const latDirection = latitude >= 0 ? 'N' : 'S';
  const lonDirection = longitude >= 0 ? 'E' : 'W';
  const lat = Math.abs(latitude).toFixed(4).replace('.', '').padStart(6, '0');
  const lon = Math.abs(longitude).toFixed(4).replace('.', '').padStart(6, '0');
  return `${latDirection}${lat}${lonDirection}${lon}`;
}

function validateInputs(lat, lon, timezone, name) {
  if (!lat || !lon || !timezone || !name) {
    alert('Preencha todos os campos.');
    return false;
  }

  const latitude = Number(lat);
  const longitude = Number(lon);
  const tz = Number(timezone);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    alert('Latitude invalida. Use um valor entre -90 e 90.');
    return false;
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    alert('Longitude invalida. Use um valor entre -180 e 180.');
    return false;
  }
  if (!Number.isInteger(tz) || tz < -43200 || tz > 50400) {
    alert('Fuso horario invalido. Informe o offset em segundos, por exemplo -10800 para UTC-3.');
    return false;
  }
  if (name.length > 20) {
    alert('O nome deve ter no maximo 20 caracteres.');
    return false;
  }
  return true;
}

function saveLocalStation(station) {
  const current = JSON.parse(localStorage.getItem('stations') || '[]');
  const withoutDuplicate = current.filter((item) => item.stationId !== station.stationId);
  withoutDuplicate.push(station);
  localStorage.setItem('stations', JSON.stringify(withoutDuplicate));
}

submitBtn.addEventListener('click', async (event) => {
  event.preventDefault();

  const lat = latitudeInput.value.trim().replace(',', '.');
  const lon = longitudeInput.value.trim().replace(',', '.');
  const timezone = timeZoneInput.value.trim();
  const name = nameInput.value.trim();

  if (!validateInputs(lat, lon, timezone, name)) return;

  const stationData = {
    stationId: generateStationId(Number(lat), Number(lon)),
    userId: String(userId),
    name,
    timeZone: Number(timezone),
    timestamp: Math.floor(Date.now() / 1000)
  };

  submitBtn.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/stations/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stationData)
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).erro || ''; } catch (_) { }
      throw new Error(`Falha ao cadastrar a estacao (HTTP ${response.status}) ${detail}`);
    }

    saveLocalStation(stationData);
    window.location.href = 'stations.html';
  } catch (error) {
    console.error(error);
    alert('Nao foi possivel cadastrar a estacao. Verifique se o backend esta ligado.');
    submitBtn.disabled = false;
  }
});

function returnToStations() {
  window.location.href = 'stations.html';
}

window.returnToStations = returnToStations;
