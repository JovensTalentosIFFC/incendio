const submitBtn = document.querySelector('.submit-btn');
const latitudeInput = document.querySelector('#latitudeInput');
const longitudeInput = document.querySelector('#longitudeInput');
const timeZoneInput = document.querySelector('#timeZoneInput');

function generateStationId(lat, lon) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';

  const latFormatted = Math.abs(lat).toFixed(4).replace('.', '').padStart(6, '0');
  const lonFormatted = Math.abs(lon).toFixed(4).replace('.', '').padStart(6, '0');

  return `${latDir}${latFormatted}${lonDir}${lonFormatted}`;
}

function validateInputs(lat, lon, tz) {
  if (!lat || !lon || !tz) {
    alert('Preencha todos os campos!');
    return false;
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const tzNum  = parseInt(tz);

  if (isNaN(latNum)) {
    alert('Latitude inválida! Informe um número.');
    return false;
  }
  if (latNum < -90 || latNum > 90) {
    alert('Latitude inválida! O valor deve estar entre -90 e 90.');
    return false;
  }

  if (isNaN(lonNum)) {
    alert('Longitude inválida! Informe um número.');
    return false;
  }
  if (lonNum < -180 || lonNum > 180) {
    alert('Longitude inválida! O valor deve estar entre -180 e 180.');
    return false;
  }

  if (isNaN(tzNum)) {
    alert('Fuso horário inválido! Informe um número em segundos (ex: -10800).');
    return false;
  }
  if (tzNum < -43200 || tzNum > 50400) {
    alert('Fuso horário inválido! O valor deve estar entre -43200 (UTC-12) e 50400 (UTC+14).');
    return false;
  }

  return true;
}

submitBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  const lat = latitudeInput.value.trim();
  const lon = longitudeInput.value.trim();
  const tz  = timeZoneInput.value.trim();

  if (!validateInputs(lat, lon, tz)) return;

  const stationId = generateStationId(parseFloat(lat), parseFloat(lon));

  const stationData = {
    stationId,
    timeZone: parseInt(tz),
    timestamp: Math.floor(Date.now() / 1000),
  };

  const existing = JSON.parse(localStorage.getItem('stations') || '[]');
  existing.push(stationData);
  localStorage.setItem('stations', JSON.stringify(existing));

  await fetch('http://localhost:8080/stations/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stationId, timeZone: parseInt(tz), timestamp: Math.floor(Date.now() / 1000) })
  });

  window.location.href = "stations.html";
});