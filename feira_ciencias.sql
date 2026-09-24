CREATE DATABASE IF NOT EXISTS feira_ciencia;

USE feira_ciencia;

CREATE TABLE IF NOT EXISTS leituras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    estacao_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100),
    nome VARCHAR(100),
    timestamp_unix BIGINT,
    timezone_unix INT,
    temperatura DECIMAL(10,2),
    umidade DECIMAL(10,2),
    pressao DECIMAL(10,2),
    co2 DECIMAL(10,2),
    tvoc DECIMAL(10,2),
    altitude DECIMAL(10,2),
    lux DECIMAL(10,2),
    indice_uv DECIMAL(10,2),
    nivel_uv VARCHAR(50),
    nivel_chuva VARCHAR(50),
    digital_chuva VARCHAR(50),
    intens_vento DECIMAL(10,2),
    direcao_vento INT,
    data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);