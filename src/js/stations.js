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
  window.location.href = "stationsdata.html";
});

const stationsList = document.querySelector('.stationsManager');

function renderStations() {
  const stations = JSON.parse(localStorage.getItem('stations') || '[]');

  if (stations.length === 0) {
    stationsList.innerHTML = '<p>Nenhuma estação cadastrada.</p>';
    return;
  }

  stationsList.innerHTML = '';

  stations.forEach((station) => {
    const li = document.createElement('li');
    li.classList.add('stationCard');
    li.innerHTML = `<p>ID: <span class="stationId">${station.stationId}</span></p>`;
    stationsList.appendChild(li);
  });
}

renderStations();