const submitBtn = document.querySelector('.submit-btn');
const latitudeInput = document.querySelector('#latitudeInput');
const longitudeInput = document.querySelector('#longitudeInput');
const timeZoneInput = document.querySelector('#timeZoneInput');

function generateStationId(lat, lon) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';

  const latFormatted = Math.abs(lat).toFixed(4).replace('.', '').padStart(6, '0');
  const lonFormatted = Math.abs(lon).toFixed(4).replace('.', '').padStart(7, '0');

  return `${latDir}${latFormatted}${lonDir}${lonFormatted}`;
}

submitBtn.addEventListener("click", (e) => {
  e.preventDefault();

  const lat = latitudeInput.value.trim();
  const lon = longitudeInput.value.trim();
  const tz  = timeZoneInput.value.trim();

  if (!lat || !lon || !tz) {
    alert('Preencha todos os campos!');
    return;
  }

  const stationId = generateStationId(parseFloat(lat), parseFloat(lon));

  const stationData = {
  stationId,
  timeZone: parseInt(tz),
  timestamp: Math.floor(Date.now() / 1000),
};

  const existing = JSON.parse(localStorage.getItem('stations') || '[]');
  existing.push(stationData);
  localStorage.setItem('stations', JSON.stringify(existing));

window.location.href = "stations.html";
});