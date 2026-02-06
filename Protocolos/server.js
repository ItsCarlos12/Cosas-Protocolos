import net from 'net';
import path from 'path';
import fs from 'fs';


//? Funciones
function menuPrincipal() {
  return [
    '===== MENÚ =====\n',
    '1. Crear archivo',
    '2. Abrir archivo',
    '3. Borrar archivo',
    '4. Salir',
    '',
    'Elige una opción (1-4): '
  ].join('\n');
}

function submenu(fileName){
    return [
        `====== Archivo abierto: ${fileName} ======\n`,
        '1. Leer archivo',
        '2. Escribir archivo',
        '3. Sobreescribir archivo',
        '4. Borrar contenido del archivo',
        '5. Cerrar archivo'
    ].join('\n')
}

const server = net.createServer((socket) => {
  socket.setEncoding('utf8');

  const sendMenu = () => {
    socket.write(menuPrincipal());
  };

  const sendSubmenu = () => {
    if (socket.context && socket.context.file) {
      socket.write('\n');
      socket.write(submenu(socket.context.file.name));
      socket.write('\n');
      socket.write('Elige una opción (1-5): ');
    }
  };


  socket.write('Conexión establecida con el servidor.\n');
  sendMenu();

  socket.on('data', (data) => {
    const input = String(data).trim();

    if (!socket.context) socket.context = { pendingAction: null, file: null };

    if (socket.context.file && socket.context.file.pendingAction) {
      const text = input;
      const filePath = socket.context.file.path;
      try {
        if (socket.context.file.pendingAction === 'append') {
          fs.appendFileSync(filePath, text + (text.endsWith('\n') ? '' : '\n'), { encoding: 'utf8' });
          socket.write('Texto añadido correctamente.\n');
        } else if (socket.context.file.pendingAction === 'overwrite') {
          fs.writeFileSync(filePath, text + (text.endsWith('\n') ? '' : '\n'), { encoding: 'utf8' });
          socket.write('Archivo sobrescrito correctamente.\n');
        }
      } catch (err) {
        socket.write(`Error al escribir en el archivo: ${err.message}\n`);
      }
      socket.context.file.pendingAction = null;
      sendSubmenu();
      return;
    }

    if (socket.context.pendingAction) {
      const rawName = input;
      if (!rawName) {
        socket.write('Nombre vacío. Intenta nuevamente: ');
        return;
      }

      const safeName = path.basename(rawName);
      const filePath = path.join(process.cwd(), safeName);

      try {
        switch (socket.context.pendingAction) {
          case 'create': {
            fs.writeFileSync(filePath, '', { encoding: 'utf8' });
            socket.write(`Archivo creado: ${safeName}\n`);
            socket.context.pendingAction = null;
            socket.write('\n');
            sendMenu();
            return;
          }
          case 'open': {
            if (!fs.existsSync(filePath)) {
              socket.write(`El archivo ${safeName} no existe.\n`);
              socket.context.pendingAction = null;
              socket.write('\n');
              sendMenu();
              return;
            }
            socket.context.file = { name: safeName, path: filePath, pendingAction: null };
            socket.context.pendingAction = null;
            sendSubmenu();
            return;
          }
          case 'delete': {
            if (!fs.existsSync(filePath)) {
              socket.write(`El archivo ${safeName} no existe.\n`);
            } else {
              fs.unlinkSync(filePath);
              socket.write(`Archivo eliminado: ${safeName}\n`);
            }
            socket.context.pendingAction = null;
            socket.write('\n');
            sendMenu();
            return;
          }
        }
      } catch (err) {
        const action = socket.context.pendingAction;
        const actionMsg = action === 'create' ? 'crear' : action === 'open' ? 'abrir' : 'borrar';
        socket.write(`Error al ${actionMsg} archivo: ${err.message}\n`);
        socket.context.pendingAction = null;
        socket.write('\n');
        sendMenu();
        return;
      }
      return;
    }

    // Si hay archivo abierto, manejar el submenú
    if (socket.context.file) {
      switch (input) {
        case '1': { // Leer
          try {
            const content = fs.readFileSync(socket.context.file.path, 'utf8');
            socket.write(`\nContenido de ${socket.context.file.name}:\n`);
            socket.write(content + (content.endsWith('\n') ? '' : '\n'));
          } catch (err) {
            socket.write(`Error al leer archivo: ${err.message}\n`);
          }
          sendSubmenu();
          return;
        }
        case '2': { // Escribir (append)
          socket.context.file.pendingAction = 'append';
          socket.write('Escribe el texto a añadir: ');
          return;
        }
        case '3': { // Sobreescribir
          socket.context.file.pendingAction = 'overwrite';
          socket.write('Escribe el nuevo contenido: ');
          return;
        }
        case '4': { // Borrar contenido
          try {
            fs.truncateSync(socket.context.file.path, 0);
            socket.write('Contenido borrado.\n');
          } catch (err) {
            socket.write(`Error al borrar contenido: ${err.message}\n`);
          }
          sendSubmenu();
          return;
        }
        case '5': { // Cerrar archivo
          socket.write(`Cerrando ${socket.context.file.name}...\n\n`);
          socket.context.file = null;
          sendMenu();
          return;
        }
        default:
          socket.write('Opción inválida en submenú. Intenta nuevamente.\n');
          sendSubmenu();
          return;
      }
    }

    // Modo menú: decidir acción y solicitar nombre de archivo
    switch (input) {
      case '1':
        socket.context.pendingAction = 'create';
        socket.write('Nombre del archivo a crear: ');
        return;
      case '2':
        socket.context.pendingAction = 'open';
        socket.write('Nombre del archivo a abrir: ');
        return;
      case '3':
        socket.context.pendingAction = 'delete';
        socket.write('Nombre del archivo a borrar: ');
        return;
      case '4':
        socket.write('Saliendo...\n');
        socket.end();
        return;
      default:
        socket.write('Opción inválida. Intenta nuevamente.\n\n');
        sendMenu();
        return;
    }
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err.message);
  });
});

server.listen(4000, '127.0.0.1', () => {
  console.log('Servidor escuchando en el puerto 4000');
});