const currentStation = JSON.parse(localStorage.getItem('currentStation'));
if(!currentStation) window.location.href = 'stations.html'
const { lat, lon } = parseStationId(currentStation.stationId);
function parseStationId(stationId) {
  const latDir = stationId[0];
  const latRaw = stationId.slice(1, 7);
  const lonDir = stationId[7];
  const lonRaw = stationId.slice(8, 14);

  const latNum = parseFloat(latRaw.slice(0, 2) + '.' + latRaw.slice(2));
  const lonNum = parseFloat(lonRaw.slice(0, 2) + '.' + lonRaw.slice(3));

  return {
    lat: latDir === 'S' ? -latNum : latNum,
    lon: lonDir === 'W' ? -lonNum : lonNum
  };
}

// preenche latitude e longitude imediatamente (vêm do localStorage, não do SSE)
document.querySelector('.latitude').textContent  = lat;
document.querySelector('.longitude').textContent = lon;

const source = new EventSource(`http://localhost:8080/temperatura?id=${currentStation.stationId}`);

source.onmessage = (e) => {
  const data = JSON.parse(e.data);

  const date = new Date((data.timestamp_unix + data.timezone_unix) * 1000);
  const day    = String(date.getUTCDate()).padStart(2, '0');
  const month  = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year   = date.getUTCFullYear();
  const hours  = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  const formatted = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;

  document.querySelector('.date').textContent      = formatted;

  document.querySelector('.temperature').textContent  = data.temperature_c  + ' °C';
  document.querySelector('.humidity').textContent     = data.humidity_pct   + ' %';

  const humidityFiles = [
    { max: 20,  file: 'muito-seco'  },
    { max: 40,  file: 'seco'        },
    { max: 60,  file: 'moderado'    },
    { max: 80,  file: 'umido'       },
    { max: 100, file: 'muito-umido' }
  ];
  const humidityLevel = humidityFiles.find(level => data.humidity_pct <= level.max) || humidityFiles[humidityFiles.length - 1];
  document.getElementById('humidityImg').src = `./assets/imgs/${humidityLevel.file}.png`;

  document.querySelector('.pressure').textContent     = data.pressure_hpa   + ' hPa';
  document.querySelector('.windSpeed').textContent    = data.wind_speed_ms  + ' m/s';
  document.querySelector('.windDirection').textContent = data.wind_direction_deg + '°';

  const windDirLabels = ['N','NE','L','SE','S','SO','O','NO'];
  const windDirFiles  = ['norte','nordeste','leste','sudeste','sul','sudoeste','oeste','noroeste'];
  const windDirIndex  = Math.round(data.wind_direction_deg / 45) % 8;

  document.querySelector('.windDirection').textContent += ` (${windDirLabels[windDirIndex]})`;
  document.getElementById('windDirectionImg').src = `./assets/imgs/${windDirFiles[windDirIndex]}.png`;

  document.querySelector('.weatherInfos .topBar h3').textContent = data.name;

};

source.onerror = () => {
  console.error('SSE desconectado');
  source.close(); 
};

const trashButton = document.querySelector('.bx.bxs-trash');
const allScreen = document.querySelector('.allScreen');
trashButton.addEventListener('click', () =>{
  allScreen.classList.toggle('active'); 
})


const deleteStation = async () =>{
  await fetch(`http://localhost:8080/stations/delete?id=${currentStation.stationId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  localStorage.setItem('stations', '[]');
  window.location.href = "stations.html";
}

const cancelDeleteStation = () =>{
  allScreen.classList.toggle('active');
}