import mqtt from 'mqtt';
import readline from 'readline';
import { readFile } from 'fs/promises';

// Comandos dentro de la consola interactiva:
//   sub <topic>                -> suscribirse a un topic (ej: sub casa/#)
//   unsub <topic>              -> desuscribirse de un topic
//   pub <topic> <mensaje...>   -> publicar un mensaje
//   list                       -> ver los topics suscritos
//   topics                     -> ver los tópicos disponibles (según messages.csv)
//   help                       -> mostrar ayuda
//   exit / quit                -> salir

const [, , brokerUrl = 'mqtt://localhost:1883'] = process.argv;

const client = mqtt.connect(brokerUrl);
const subscriptions = new Set();
// Cache en memoria del último mensaje por topic
const lastMessages = new Map();

// Ruta al CSV de mensajes generado por el broker (messages.csv)
const messagesCsvUrl = new URL('./messages.csv', import.meta.url);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'mqtt> '
});

function printHelp() {
  console.log('Comandos disponibles:');
  console.log('  sub <topic>              - Suscribirse a un topic');
  console.log('  unsub <topic>            - Desuscribirse de un topic');
  console.log('  show <topic>             - Mostrar el último mensaje recibido en un topic');
  console.log('  pub <topic> <mensaje...> - Publicar un mensaje');
  console.log('  list                     - Listar topics suscritos');
   console.log('  topics                   - Listar tópicos detectados (según messages.csv)');
  console.log('  help                     - Mostrar esta ayuda');
  console.log('  exit / quit              - Salir');
}

async function listTopicsFromCsv() {
  try {
    const data = await readFile(messagesCsvUrl, 'utf8');
    const lines = data.trim().split('\n');
    if (lines.length <= 1) {
      console.log('No hay publicaciones registradas todavía.');
      return;
    }

    const topics = new Set();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length < 3) continue;
      let topic = parts[2].trim();
      if (topic.startsWith('"') && topic.endsWith('"')) {
        topic = topic.slice(1, -1).replace(/""/g, '"');
      }
      // Ignorar topics internos del broker ($SYS/...)
      if (topic && !topic.startsWith('$SYS/')) {
        topics.add(topic);
      }
    }

    if (topics.size === 0) {
      console.log('No hay tópicos registrados todavía.');
    } else {
      console.log('Tópicos disponibles (según publicaciones registradas):');
      for (const t of topics) {
        console.log(`  - ${t}`);
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('Aún no existe messages.csv. Publica algo primero desde cualquier cliente.');
    } else {
      console.error('Error al leer messages.csv:', err);
    }
  }
}

client.on('connect', () => {
  console.log(`Conectado al broker MQTT: ${brokerUrl}`);
  printHelp();
  rl.prompt();
});

client.on('message', (topic, message) => {
  const msgString = message.toString();
  // Guardar en cache el último mensaje de este topic
  lastMessages.set(topic, {
    message: msgString,
    timestamp: new Date()
  });

  console.log(`\n[Mensaje] ${topic}: ${msgString}`);
  rl.prompt();
});

client.on('error', (err) => {
  console.error('Error en el cliente MQTT:', err);
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }

  const [command, ...args] = trimmed.split(' ');

  switch (command.toLowerCase()) {
    case 'sub': {
      const topic = args[0];
      if (!topic) {
        console.log('Uso: sub <topic>');
        break;
      }
      client.subscribe(topic, (err) => {
        if (err) {
          console.error('Error al suscribirse:', err);
        } else {
          subscriptions.add(topic);
          console.log(`Suscrito a ${topic}`);
        }
      });
      break;
    }
    case 'unsub': {
      const topic = args[0];
      if (!topic) {
        console.log('Uso: unsub <topic>');
        break;
      }
      client.unsubscribe(topic, (err) => {
        if (err) {
          console.error('Error al desuscribirse:', err);
        } else {
          subscriptions.delete(topic);
          console.log(`Desuscrito de ${topic}`);
        }
      });
      break;
    }
    case 'show': {
      const topic = args[0];
      if (!topic) {
        console.log('Uso: show <topic>');
        break;
      }
      const cached = lastMessages.get(topic);
      if (!cached) {
        console.log(`No hay mensajes en cache para el topic "${topic}".`);
      } else {
        console.log(`Último mensaje en ${topic}: ${cached.message}`);
        // console.log(`Fecha/hora: ${cached.timestamp.toISOString()}`);
      }

      break;
    }
    case 'pub': {
      const [topic, ...msgParts] = args;
      if (!topic || msgParts.length === 0) {
        console.log('Uso: pub <topic> <mensaje...>');
        break;
      }
      const message = msgParts.join(' ');
      // Publicamos como mensaje RETENIDO para que nuevos
      // suscriptores reciban el último valor del tópico.
      client.publish(topic, message, { retain: true }, (err) => {
        if (err) {
          console.error('Error al publicar:', err);
        } else {
          // Guardar en cache también lo que publicamos nosotros
          lastMessages.set(topic, {
            message,
            timestamp: new Date()
          });
          console.log(`Publicado en ${topic}: ${message}`);
        }
      });
      break;
    }
    case 'list': {
      if (subscriptions.size === 0) {
        console.log('No hay suscripciones activas.');
      } else {
        console.log('Suscripciones activas:');
        for (const topic of subscriptions) {
          console.log(`  - ${topic}`);
        }
      }
      break;
    }
    case 'topics': {
      await listTopicsFromCsv();
      break;
    }
    case 'help': {
      printHelp();
      break;
    }
    case 'exit':
    case 'quit': {
      console.log('Cerrando conexión y saliendo...');
      rl.close();
      client.end();
      return;
    }
    default: {
      console.log(`Comando no reconocido: ${command}`);
      printHelp();
      break;
    }
  }

  rl.prompt();
});

rl.on('close', () => {
  // Si el usuario cierra la interfaz con Ctrl+C o Ctrl+D
  client.end();
  process.exit(0);
});
