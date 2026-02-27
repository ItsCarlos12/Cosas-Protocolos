# Protocolos de Red — Prácticas TCP y UDP

Este repositorio contiene ejercicios prácticos centrados en los protocolos **TCP** y **UDP** usando Node.js sobre Windows.

## Contenidos actuales
- **TCP (Clase 1):** sockets TCP en Node.js (cliente/servidor simple, eco, pruebas desde consola).
- **UDP (Clase 2):** envío y recepción de datagramas UDP mediante una pequeña consola/CLI y un servidor.

## Estructura del repositorio

```
README.md
Clase1-TCP/
	clase 1 - Protocolos de Red - TCP.excalidraw
	src/
		example/
			client.js
			server.js
		tcp_client.js
		tcp_server.js
		test_cmd.js
Clase2-UDP/
	cli.js
	config.env
	package.json
	server.js
```

- Material de apoyo TCP: [Clase1-TCP/clase 1 - Protocolos de Red - TCP.excalidraw](Clase1-TCP/clase%201%20-%20Protocolos%20de%20Red%20-%20TCP.excalidraw)

## Requisitos
- Windows (PowerShell)
- Node.js 18 o superior

## TCP — Ejemplos y pruebas

Código en: `Clase1-TCP/src/`

- Servidor TCP básico: `tcp_server.js`
- Cliente TCP básico: `tcp_client.js`
- Ejemplo cliente/servidor separado: `example/client.js`, `example/server.js`
- Comandos de prueba desde consola: `test_cmd.js`

Ejecución típica desde la raíz del repositorio:

```powershell
cd .\Clase1-TCP\src
node tcp_server.js   # en una consola
node tcp_client.js   # en otra consola
```

## UDP — CLI y servidor

Código en: `Clase2-UDP/`

- Servidor UDP: `server.js`
- CLI / cliente UDP: `cli.js`
- Configuración de entorno: `config.env`

Instalación de dependencias (una vez):

```powershell
cd .\Clase2-UDP
npm install
```

Ejemplo de ejecución:

```powershell
# Consola 1: servidor UDP
cd .\Clase2-UDP
node server.js

# Consola 2: CLI UDP
cd .\Clase2-UDP
node cli.js
```

## Notas
- Por ahora el repositorio solo incluye prácticas de **TCP** y **UDP**.
- Otros protocolos (HTTP, DNS, etc.) se podrán añadir en módulos futuros.

