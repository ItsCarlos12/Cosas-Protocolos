var net = require('net');
var readline = require('readline');

// CONFIGURACIÓN: Cambia esto por la IP de la laptop Servidor
var IP_SERVIDOR = '192.168.1.XX'; 
var PUERTO = 1337;

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function conectarYEnviar(comando, archivo, texto) {
    var cliente = new net.Socket();

    cliente.connect(PUERTO, IP_SERVIDOR, function() {
        // Enviamos la cadena formateada con "|"
        cliente.write(comando + "|" + archivo + "|" + texto);
    });

    cliente.on("data", function(data) {
        console.log("\n[SERVIDOR]: " + data);
        cliente.destroy();
        menu(); // Volver a mostrar el menú
    });

    cliente.on("error", function(err) {
        console.log("Error de conexión: " + err.message);
        menu();
    });
}

function menu() {
    console.log("\n--- OPERACIONES REMOTAS ---");
    console.log("1. Crear  2. Adicionar  3. Leer  4. Eliminar  5. Cerrar/Salir");
    rl.question("Seleccione una opción: ", function(opcion) {
        if (opcion === '5') {
            conectarYEnviar("CERRAR", "", "");
            process.exit();
        }

        rl.question("Nombre del archivo: ", function(nom) {
            if (opcion === '1' || opcion === '2') {
                rl.question("Contenido: ", function(cont) {
                    var cmd = (opcion === '1') ? "CREAR" : "ADICIONAR";
                    conectarYEnviar(cmd, nom, cont);
                });
            } else {
                var cmd = (opcion === '3') ? "LEER" : "ELIMINAR";
                conectarYEnviar(cmd, nom, "");
            }
        });
    });
}

menu();