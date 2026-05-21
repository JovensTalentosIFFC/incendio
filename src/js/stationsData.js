const currentStation = JSON.parse(localStorage.getItem('currentStation'))
const { lat, lon } = parseStationId(currentStation.stationId);


function parseStationId(stationId) {
  const latDir = stationId[0];
  const latRaw = stationId.slice(1, 7);
  const lonDir = stationId[7];
  const lonRaw = stationId.slice(8, 15);

  // reinsere o ponto decimal: 229068 → 22.9068
  const latNum = parseFloat(latRaw.slice(0, 2) + '.' + latRaw.slice(2));
  const lonNum = parseFloat(lonRaw.slice(0, 3) + '.' + lonRaw.slice(3));

  const lat = latDir === 'S' ? -latNum : latNum;
  const lon = lonDir === 'W' ? -lonNum : lonNum;

  return { lat, lon };
}


console.log(lat, lon)