import { createSocket } from "dgram";
import { createTransport } from "nodemailer";
import dotenv from "dotenv";

dotenv.config({ path: "config.env" });

const server = createSocket("udp4");
const PORT = 4000;

// Buffers para reconstruir archivo(s)
let fileBuffer = Buffer.alloc(0);
let imageBuffer = Buffer.alloc(0);

// Metadatos del envío actual
let currentEmail = null;
let currentFilename = "archivo_recibido.txt";
let currentImageFilename = null;
let currentMessage = null;
let currentHasFile = false;
let currentHasImage = false;

// Control de chunks esperados/recibidos
let expectedFileChunks = 0;
let expectedImageChunks = 0;
let receivedChunks = 0;

// Configuración de Nodemailer
const transporter = createTransport({
  service: "gmail",
  auth: {
    user: process.env.user,
    pass: process.env.pass,
  },
});

server.on("error", (err) => {
  console.log(`Error en servidor:\n${err.stack}`);
  server.close();
});

server.on("message", (msg, rinfo) => {
  const texto = msg.toString();

  // Verificamos si el mensaje es la señal de fin de archivo
  if (texto === "EOF") {
    console.log(
      `Fin de transmisión desde ${rinfo.address}:${rinfo.port}. Enviando correo a ${currentEmail || "correo por defecto"}...`,
    );
    sendEmail(
      currentEmail,
      currentFilename,
      currentImageFilename,
      currentMessage,
      currentHasFile,
      currentHasImage,
    );
    return;
  }

  if (!currentEmail && fileBuffer.length === 0) {
    try {
      const meta = JSON.parse(texto);
      currentEmail = meta.email || currentEmail;
      // Compatibilidad hacia atrás: filename/fileChunks antiguos
      currentFilename = meta.fileName || meta.filename || currentFilename;
      currentImageFilename = meta.imageFilename || null;
      currentMessage = meta.message || null;
      currentHasFile = !!meta.hasFile;
      currentHasImage = !!meta.hasImage;
      expectedFileChunks = meta.fileChunks || meta.chunks || 0;
      expectedImageChunks = meta.imageChunks || 0;
      receivedChunks = 0;
      fileBuffer = Buffer.alloc(0);
      imageBuffer = Buffer.alloc(0);

      console.log(
        `Metadatos recibidos: email=${currentEmail}, filename=${currentFilename}, hasFile=${currentHasFile}, hasImage=${currentHasImage}, message=${currentMessage ? "sí" : "no"}`,
      );
      return;
    } catch (e) {
      console.warn(
        "No se pudieron parsear los metadatos. Tratando como chunk de archivo...",
      );
    }
  }

  // Si no es EOF ni metadatos (o falló el parseo), lo tratamos como chunk de archivo/imagen
  if (currentHasFile || currentHasImage) {
    receivedChunks++;

    // Primero se rellenan los chunks de archivo
    if (currentHasFile && receivedChunks <= expectedFileChunks) {
      fileBuffer = Buffer.concat([fileBuffer, msg]);
      console.log(
        `Recibido chunk de archivo de ${msg.length} bytes (${receivedChunks}/${expectedFileChunks})`,
      );
    }
    // Luego, si hay imagen, se rellenan sus chunks
    else if (
      currentHasImage &&
      receivedChunks <= expectedFileChunks + expectedImageChunks
    ) {
      const imageIndex = receivedChunks - expectedFileChunks;
      imageBuffer = Buffer.concat([imageBuffer, msg]);
      console.log(
        `Recibido chunk de imagen de ${msg.length} bytes (${imageIndex}/${expectedImageChunks})`,
      );
    } else {
      console.log(`Chunk extra recibido de ${msg.length} bytes (no asignado)`);
    }
  } else {
    // Compatibilidad con clientes antiguos que sólo envían un archivo
    fileBuffer = Buffer.concat([fileBuffer, msg]);
    console.log(`Recibido chunk de ${msg.length} bytes`);
  }
});

server.on("listening", () => {
  const address = server.address();
  console.log(`Servidor UDP escuchando en ${address.address}:${address.port}`);
});

async function sendEmail(
  toEmail,
  filename,
  imageFilename,
  textMessage,
  hasFile,
  hasImage,
) {
  try {
    // Construimos un cuerpo de correo claro según lo que venga del CLI
    let subject = "Mensaje/archivo recibido vía UDP";
    let bodyText = "";

    const hasRealFile = hasFile && fileBuffer.length > 0;
    const hasRealImage = hasImage && imageBuffer.length > 0;

    if (textMessage && hasRealFile && hasRealImage) {
      // Mensaje + archivo + imagen
      bodyText = `Has recibido un mensaje, un archivo y una imagen enviados vía UDP.\n\nMensaje:\n${textMessage}\n\nSe adjuntan el archivo: ${filename || "archivo_recibido.txt"} y la imagen: ${imageFilename || "imagen_recibida"}.`;
    } else if (textMessage && (hasRealFile || hasRealImage)) {
      // Mensaje + (archivo o imagen)
      bodyText = `Has recibido un mensaje con adjunto(s) enviados vía UDP.\n\nMensaje:\n${textMessage}`;
    } else if (textMessage && !hasRealFile && !hasRealImage) {
      // Solo mensaje
      bodyText = `Has recibido un mensaje enviado vía UDP:\n\n${textMessage}`;
    } else if (!textMessage && (hasRealFile || hasRealImage)) {
      // Solo adjuntos (archivo y/o imagen)
      bodyText =
        "Adjunto encontrarás el/los archivo(s) recibido(s) por el servidor UDP.";
    } else {
      // Caso raro: sin mensaje y sin adjuntos
      bodyText =
        "Se ha recibido una transmisión vía UDP sin contenido reconocible.";
    }

    const mailOptions = {
      from: '"Servidor UDP" <ejsll0303@gmail.com>',
      to: toEmail,
      subject,
      text: bodyText,
    };

    // Adjuntos: archivo y/o imagen, sólo si realmente llegaron
    const attachments = [];

    if (hasRealFile) {
      attachments.push({
        filename: filename,
        content: fileBuffer,
      });
    }

    if (hasRealImage) {
      attachments.push({
        filename: imageFilename,
        content: imageBuffer,
      });
    }

    if (attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    const info = await transporter.sendMail(mailOptions);
    console.log("Correo enviado con éxito: %s", info.messageId);

    // Limpiamos los buffers y los metadatos para recibir el siguiente envío
    fileBuffer = Buffer.alloc(0);
    imageBuffer = Buffer.alloc(0);
    currentEmail = null;
    currentFilename = null;
    currentImageFilename = null;
    currentMessage = null;
    currentHasFile = false;
    currentHasImage = false;
    expectedFileChunks = 0;
    expectedImageChunks = 0;
    receivedChunks = 0;
  } catch (error) {
    console.error("Error enviando correo: ", error);
    // En caso de error también limpiamos para no mezclar con el siguiente envío
    fileBuffer = Buffer.alloc(0);
    imageBuffer = Buffer.alloc(0);
    currentEmail = null;
    currentFilename = null;
    currentImageFilename = null;
    currentMessage = null;
    currentHasFile = false;
    currentHasImage = false;
    expectedFileChunks = 0;
    expectedImageChunks = 0;
    receivedChunks = 0;
  }
}

server.bind(PORT);
