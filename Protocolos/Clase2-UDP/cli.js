import { createSocket } from 'dgram';
import { existsSync, statSync, readFileSync } from 'fs';
import { basename } from 'path';
import { createInterface } from 'readline';

const client = createSocket('udp4');
const DEFAULT_SERVER_PORT = 4000;
const DEFAULT_SERVER_HOST = 'localhost';

// UDP no maneja bien archivos grandes de una sola vez.
//Se divide en chunks de 1024 bytes (1KB).
const CHUNK_SIZE = 1024;

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

function preguntar(texto) {
    return new Promise(resolve => rl.question(texto, respuesta => resolve(respuesta)));
}

// Envía opcionalmente: mensaje, archivo y una imagen extra
async function sendPayload(fileData, fileChunks, imageData, imageChunks, serverPort, serverHost, metadata) {
    // Enviamos primero los metadatos (correo, nombre de archivo, mensaje, etc.)
    const metaString = JSON.stringify(metadata);
    const metaBuffer = Buffer.from(metaString);
    console.log('Enviando metadatos (correo, mensaje y archivo/imagen si aplica)...');

    client.send(metaBuffer, serverPort, serverHost, (err) => {
        if (err) console.error('Error enviando metadatos:', err);
    });

    // Pequeña pausa para separar metadatos de los chunks de archivo
    await new Promise(resolve => setTimeout(resolve, 20));

    // 1) Enviar el archivo principal (si hay)
    if (fileChunks > 0) {
        console.log(`Iniciando envío de archivo (${fileData.length} bytes) en ${fileChunks} paquetes...`);

        for (let i = 0; i < fileChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const chunk = fileData.slice(start, end);

            client.send(chunk, serverPort, serverHost, (err) => {
                if (err) console.error(err);
            });

            const porcentaje = Math.round(((i + 1) / fileChunks) * 100);
            process.stdout.write(`\rEnviado archivo: ${i + 1}/${fileChunks} paquetes (${porcentaje}%)`);

            // IMPORTANTE: UDP no tiene control de flujo. Si enviamos muy rápido,
            // perdemos paquetes. Ponemos una pequeña pausa artificial.
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        process.stdout.write('\n');
    }

    // 2) Enviar la imagen extra (si hay)
    if (imageChunks > 0) {
        console.log(`Iniciando envío de imagen (${imageData.length} bytes) en ${imageChunks} paquetes...`);

        for (let i = 0; i < imageChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const chunk = imageData.slice(start, end);

            client.send(chunk, serverPort, serverHost, (err) => {
                if (err) console.error(err);
            });

            const porcentaje = Math.round(((i + 1) / imageChunks) * 100);
            process.stdout.write(`\rEnviando imagen: ${i + 1}/${imageChunks} paquetes (${porcentaje}%)`);

            await new Promise(resolve => setTimeout(resolve, 5));
        }

        process.stdout.write('\n');
    }

    if (fileChunks === 0 && imageChunks === 0) {
        console.log('No se adjunta archivo ni imagen. Solo se enviará el mensaje.');
    }

    // Al finalizar, enviamos la señal de fin (EOF)
    setTimeout(() => {
        client.send('EOF', serverPort, serverHost, (err) => {
            if (err) {
                console.error(err);
            } else {
                console.log('Archivo enviado y señal EOF transmitida.');
            }
            client.close();
        });
    }, 100);
}

(async () => {
    try {
        // 1) Preguntar SIEMPRE el correo de destino
        const emailInput = await preguntar('Correo electrónico de destino: ');
        const email = emailInput.trim();

        if (!email) {
            console.error('No se ingresó ningún correo electrónico de destino.');
            rl.close();
            client.close();
            return;
        }

        // 2) Preguntar si quiere enviar un mensaje de texto
        const wantsMessage = (await preguntar('¿Quieres escribir un mensaje de texto? (s/N): ')).trim().toLowerCase();
        let textMessage = '';
        if (wantsMessage === 's' || wantsMessage === 'si' || wantsMessage === 'sí') {
            textMessage = await preguntar('Escribe el mensaje: ');
        }

        // 3) Preguntar si quiere adjuntar un archivo o imagen (archivo principal)
        const wantsFile = (await preguntar('¿Quieres adjuntar un archivo (por ejemplo un documento)? (s/N): ')).trim().toLowerCase();

        let filePath = '';
        let fileName = '';
        let fileSize = 0;
        let fileChunks = 0;
        let fileData = Buffer.alloc(0);

        if (wantsFile === 's' || wantsFile === 'si' || wantsFile === 'sí') {
            const rutaInput = await preguntar('Ruta del archivo a enviar: ');
            filePath = rutaInput.trim();

            if (!filePath) {
                console.error('No se ingresó ninguna ruta de archivo.');
                rl.close();
                client.close();
                return;
            }

            if (!existsSync(filePath)) {
                console.error(`El archivo "${filePath}" no existe.`);
                rl.close();
                client.close();
                return;
            }

            const stats = statSync(filePath);
            fileSize = stats.size;
            fileChunks = Math.ceil(fileSize / CHUNK_SIZE);
            fileName = basename(filePath);
            fileData = readFileSync(filePath);

            console.log('');
            console.log(`Archivo seleccionado: ${filePath}`);
            console.log(`Nombre a enviar: ${fileName}`);
            console.log(`Tamaño: ${fileSize} bytes (${fileChunks} paquetes de hasta ${CHUNK_SIZE} bytes)`);
        }

        // 4) Preguntar si quiere adjuntar una imagen adicional
        const wantsImage = (await preguntar('¿Quieres adjuntar además una imagen? (s/N): ')).trim().toLowerCase();

        let imagePath = '';
        let imageName = '';
        let imageSize = 0;
        let imageChunks = 0;
        let imageData = Buffer.alloc(0);

        if (wantsImage === 's' || wantsImage === 'si' || wantsImage === 'sí') {
            const rutaImg = await preguntar('Ruta de la imagen a enviar: ');
            imagePath = rutaImg.trim();

            if (!imagePath) {
                console.error('No se ingresó ninguna ruta de imagen.');
                rl.close();
                client.close();
                return;
            }

            if (!existsSync(imagePath)) {
                console.error(`La imagen "${imagePath}" no existe.`);
                rl.close();
                client.close();
                return;
            }

            const statsImg = statSync(imagePath);
            imageSize = statsImg.size;
            imageChunks = Math.ceil(imageSize / CHUNK_SIZE);
            imageName = basename(imagePath);
            imageData = readFileSync(imagePath);

            console.log('');
            console.log(`Imagen seleccionada: ${imagePath}`);
            console.log(`Nombre a enviar: ${imageName}`);
            console.log(`Tamaño: ${imageSize} bytes (${imageChunks} paquetes de hasta ${CHUNK_SIZE} bytes)`);
        }

        if (!textMessage && fileChunks === 0 && imageChunks === 0) {
            console.error('Debes enviar al menos un mensaje de texto o adjuntar un archivo/imagen.');
            rl.close();
            client.close();
            return;
        }

        const hostInput = await preguntar(`Host del servidor (${DEFAULT_SERVER_HOST}): `);
        const portInput = await preguntar(`Puerto del servidor (${DEFAULT_SERVER_PORT}): `);

        const serverHost = hostInput.trim() || DEFAULT_SERVER_HOST;
        const serverPort = parseInt(portInput.trim(), 10) || DEFAULT_SERVER_PORT;

        const confirmar = (await preguntar('¿Deseas iniciar el envío? (s/N): ')).trim().toLowerCase();
        if (confirmar !== 's' && confirmar !== 'si' && confirmar !== 'sí') {
            console.log('Envío cancelado por el usuario.');
            rl.close();
            client.close();
            return;
        }

        console.log('');
        const hasFile = fileChunks > 0;
        const hasImage = imageChunks > 0;
        await sendPayload(fileData, fileChunks, imageData, imageChunks, serverPort, serverHost, {
            email,
            message: textMessage || null,
            hasFile,
            hasImage,
            filename: hasFile ? fileName : null,
            size: hasFile ? fileSize : 0,
            chunks: fileChunks,
            fileChunks,
            imageFilename: hasImage ? imageName : null,
            imageSize,
            imageChunks
        });

        rl.close();
    } catch (err) {
        console.error('Error durante el envío:', err);
        rl.close();
        client.close();
    }
})();