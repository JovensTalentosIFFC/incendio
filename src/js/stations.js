const tempValue = document.querySelector('.tempValue');

// const source = new EventSource('http://192.168.18.138:8080/temperatura');

// source.onmessage = (event) => {
//     console.log("Temperatura:", event.data);
//     tempValue.textContent = Number(event.data).toFixed(2);
// };

// source.onerror = (error) => {
//     console.error("Erro no SSE:", error);
// };

const createStationButton = document.querySelector('#criar');

createStationButton.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "stationsForm.html";
});

const stationsList = document.querySelector('.stationsManager');
let stations;
async function renderStations() {
  stations = JSON.parse(localStorage.getItem('stations') || '[]');
  if(stations.length===0){
    const allStationsData = await fetch('http://localhost:8080/stations', {
      method: 'GET',
      headers: {'Content-type': 'application/json'}
    })
    console.log(allStationsData)
    stations = await allStationsData.json();
    stations = stations.map(s => ({
      stationId: s.station_id,
      user_id: s.user_id,
      name: s.name,
      timestampUnix: s.timestamp_unix,
      timezoneUnix: s.timezone_unix,
      temperatureC: s.temperature_c,
      humidityPct: s.humidity_pct,
      pressureHpa: s.pressure_hpa,
      windSpeedMs: s.wind_speed_ms,
      windDirectionDeg: s.wind_direction_deg
    }));
    localStorage.setItem('stations', JSON.stringify(stations));
  }
  console.log(stations[0])
  stationsList.innerHTML = '';

   stations.forEach((station) => {
    const li = document.createElement('li');
    li.classList.add('stationCard');
    li.dataset.stationId = station.stationId; // guarda o ID direto no elemento

    li.innerHTML = `
      <p>Nome: <span class="stationId">${station.name}</span></p>
      <p>ID: <span class="stationId">${station.stationId}</span></p>`;

    stationsList.appendChild(li);
  });
}

renderStations(); 

stationsList.addEventListener('click', (e) => {
  const card = e.target.closest('.stationCard');
  if (!card) return; // clique fora de um card, ignora

  const station = stations.find(s => s.stationId === card.dataset.stationId);
  if (!station) return;

  localStorage.setItem('currentStation', JSON.stringify(station));
  window.location.href = 'stationsData.html';
});