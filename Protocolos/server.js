var net = require('net');
var fs = require('fs');

var servidor = net.createServer(function(socket) {
    console.log('Cliente conectado desde: ' + socket.remoteAddress);

    socket.on('data', function(data) {
        // Convertimos el buffer a string y separamos por el caracter "|"
        // Estructura esperada: COMANDO|NOMBRE|CONTENIDO
        var instruccion = data.toString().trim().split('|');
        var comando = instruccion[0].toUpperCase();
        var nombreArchivo = instruccion[1];
        var contenido = instruccion[2] || "";

        try {
            if (comando === "CREAR") {
                fs.writeFileSync(nombreArchivo, contenido);
                socket.write("Respuesta: Archivo '" + nombreArchivo + "' creado con éxito.");
            } 
            else if (comando === "ADICIONAR") {
                fs.appendFileSync(nombreArchivo, contenido);
                socket.write("Respuesta: Contenido agregado a '" + nombreArchivo + "'.");
            } 
            else if (comando === "LEER") {
                if (fs.existsSync(nombreArchivo)) {
                    var dataArchivo = fs.readFileSync(nombreArchivo, 'utf8');
                    socket.write("Contenido de " + nombreArchivo + ":\n" + dataArchivo);
                } else {
                    socket.write("Error: El archivo no existe.");
                }
            } 
            else if (comando === "ELIMINAR") {
                if (fs.existsSync(nombreArchivo)) {
                    fs.unlinkSync(nombreArchivo);
                    socket.write("Respuesta: Archivo '" + nombreArchivo + "' eliminado.");
                } else {
                    socket.write("Error: El archivo no existe.");
                }
            } 
            else if (comando === "CERRAR") {
                socket.write("Cerrando conexión. Adiós.");
                socket.end();
            } 
            else {
                socket.write("Error: Comando no reconocido.");
            }
        } catch (err) {
            socket.write("Error en el servidor: " + err.message);
        }
    });
});

// IMPORTANTE: '0.0.0.0' permite conexiones de otras laptops en la misma red
servidor.listen(1337, '0.0.0.0', function() {
    console.log("Servidor de archivos listo en el puerto 1337");
});