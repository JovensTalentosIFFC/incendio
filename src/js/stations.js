const tempValue = document.querySelector('.tempValue');

const source = new EventSource('http://192.168.18.138:8080/temperatura');

source.onmessage = (event) => {
    console.log("Temperatura:", event.data);
    tempValue.textContent = Number(event.data).toFixed(2);
};

source.onerror = (error) => {
    console.error("Erro no SSE:", error);
};