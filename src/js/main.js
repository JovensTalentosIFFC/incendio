let data;
let csvInput = document.getElementById("csv"); 

// objeto para armazenar os dados do CSV
let values = {
  registros: []
};

const fetchAPI = async () =>{
  // como consultar os dados da api
  data = await fetch('https://api.openweathermap.org/data/2.5/weather?q=Campos&appid=750472f04629eac0ae572e08097b1438&units=metric&lang=pt_br');
  data = await data.json();
}

const start = async () =>{
  await fetchAPI()

  h1Temp.textContent = Math.floor(data.main.temp) + ' °C'

  let date = new Date(data.dt*1000)
  let minutes = '0' + date.getMinutes()
  h1Clock.textContent = date.getHours() + ':' + minutes.substr(-2)

  weatherSpecsSpans.forEach((k, i) =>{
    switch(i){
      case 0: k.textContent = data.wind.speed + ' m/s'; break;
      case 1: k.textContent = data.main.humidity + ' %'; break;
      case 2: k.textContent = data.visibility/1000 + ' km'; break;
      case 3: k.textContent = data.main.pressure + ' hPa'; break;
      case 4: k.textContent = Math.floor(data.main.feels_like) + ' °C'; break;
      case 5: k.textContent = Math.floor(data.main.temp_max) + ' °C'; break;
    }
  })
}

const weatherSpecsSpans = Array.from(document.querySelectorAll('.weatherSpecs li span'))
const h1Temp = document.querySelector('.weatherInfos .left .imgContainer .mainTemperature');
const h1Clock = document.querySelector('.weatherInfos .left .imgContainer .mainClock');

// botão importar
const btnImportar = document.getElementById("btnImportar");
btnImportar.addEventListener("click", loadCsv);

// chama quando clicar no botão importar
function loadCsv() {

    const file = csvInput.files[0];

    if (!file) {
        alert("Selecione um arquivo CSV primeiro!");
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        const text = e.target.result;
        const linhas = text.split('\n').map(l => l.trim()).filter(l => l);

        if (linhas.length === 0) {
            alert("CSV vazio!");
            return;
        }

        // Ignora cabeçalho
        const cabecalhoEsperado = "station_id,timestamp_unix,timezone_unix,temperature_c,humidity_pct,pressure_hpa,wind_speed_ms,wind_direction_deg";

        if (linhas[0] && linhas[0].toLowerCase().startsWith(cabecalhoEsperado)) {
            linhas.shift();
        } else {
            alert("❌ Cabeçalho inválido!");
            return;
        }

        const registros = linhas.map((linha) => {

            const [station_id, timestamp_unix, timezone_unix, temperature_c, humidity_pct, pressure_hpa, wind_speed_ms, wind_direction_deg] = linha.split(',');

            if (!station_id) {
                console.error("Linha inválida:", linha);
                return null;
            }

            return {
                station_id,
                timestamp_unix: +timestamp_unix,
                timezone_unix: +timezone_unix,
                temperature_c: +temperature_c,
                humidity_pct: +humidity_pct,
                pressure_hpa: +pressure_hpa,
                wind_speed_ms: +wind_speed_ms,
                wind_direction_deg: +wind_direction_deg
            } 
        }).filter(p => p !== null);

        // 🔥 AQUI ESTAVA FALTANDO
        values.registros = detectarIncendio(registros);

        console.log("✅ Dados com análise:", values.registros);

        // 📊 CRIA O GRÁFICO
        criarGrafico(values.registros);
    };

    reader.readAsText(file, 'UTF-8');
}

function detectarIncendio(registros) {
  return registros.map(r => {

    let incendio = false;

    if (r.temperature_c > 35 && r.humidity_pct < 30) {
      incendio = true;
    }

    return {
      ...r,
      incendio
    }
  });
}

function criarGrafico(registros) {

  const labels = registros.map(r => {
    const d = new Date(r.timestamp_unix * 1000);
    return d.getHours() + ":" + d.getMinutes();
  });

  const temperaturas = registros.map(r => r.temperature_c);
  const incendios = registros.map(r => r.incendio ? 40 : null);

  const ctx = document.getElementById("grafico").getContext("2d");

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: "Temperatura",
          data: temperaturas
        },
        {
          label: "🔥 Incêndio",
          data: incendios,
          borderDash: [5,5]
        }
      ]
    }
  });
}

// inicia a API só uma vez
start();

console.log(values.registros);