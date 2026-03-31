let data;
let csvInput = document.getElementById("csvInput"); 

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
      case 0:
        k.textContent = data.wind.speed + ' m/s'
        break;
      case 1: 
        k.textContent = data.main.humidity + ' %'
        break;
      case 2:
        k.textContent = data.visibility/1000 + ' km'
        break;
      case 3:
        k.textContent = data.main.pressure + ' hPa'
        break;
      case 4:
        k.textContent = Math.floor(data.main.feels_like) + ' °C'
        break;
      case 5:
        k.textContent = Math.floor(data.main.temp_max) + ' °C'
        break;
    }
  })

}

const weatherSpecsSpans = Array.from(document.querySelectorAll('.weatherSpecs li span'))
const h1Temp = document.querySelector('.weatherInfos .left .imgContainer .mainTemperature');
const h1Clock = document.querySelector('.weatherInfos .left .imgContainer .mainClock');

start()

// chama automaticamente quando o usuário seleciona o arquivo
csvInput.addEventListener("change", loadCsv);

function loadCsv() {
  submitFormButton.disabled=false
    const file = csvInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const text = e.target.result;
            const linhas = text.split('\n').map(l => l.trim()).filter(l => l);

            // Se o CSV for do usuário, ele precisa ter o cabeçalho exatamente igual ao do arquivo padrão para ser reconhecido, caso contrário, o código tentará processar a primeira linha como dados, o que pode causar erros. Se o cabeçalho for encontrado, ele será removido antes de processar as perguntas. Se o cabeçalho não for encontrado, o código tentará processar todas as linhas como perguntas, o que pode resultar em erros se a primeira linha for realmente um cabeçalho.
            // Ignora cabeçalho
            if (linhas[0] && linhas[0].toLowerCase().startsWith("station_id;timestamp_unix;timezone_unix;temperature_c;humidity_pct;pressure_hpa;wind_speed_ms;wind_direction_deg")) {
                linhas.shift();
            }

            const registros = linhas.map((linha) => {
                // Usar ';' como delimitador para ser consistente com o arquivo padrão
                const [station_id, timestamp_unix, timezone_unix, temperature_c, humidity_pct, pressure_hpa, wind_speed_ms, wind_direction_deg] = linha.split(';');

                // Certifique-se de que todas as 8 colunas estão presentes
                if (!station_id || !timestamp_unix || !timezone_unix || !temperature_c || !humidity_pct || !pressure_hpa || !wind_speed_ms || !wind_direction_deg) {
                    console.error("⚠️ Linha do CSV em formato incorreto:", linha);
                    return null; // Ignora linhas mal formatadas
                }

                return {
                    station_id: station_id,
                    timestamp_unix: +timestamp_unix,
                    timezone_unix: +timezone_unix,
                    temperature_c: +temperature_c,
                    humidity_pct: +humidity_pct,
                    pressure_hpa: +pressure_hpa,
                    wind_speed_ms: +wind_speed_ms,
                    wind_direction_deg: +wind_direction_deg
                } 
            }).filter(p => p !== null); // Remove qualquer linha que tenha falhado
            
            console.log(levelsQuantity, valorFases.textContent)

            values.registros = registros;

            console.log("✅ Dados importados do CSV:", registros);
        };
        reader.readAsText(file, 'UTF-8');
    }
}

console.log(values.registros);