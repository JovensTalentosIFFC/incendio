
let data;
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
