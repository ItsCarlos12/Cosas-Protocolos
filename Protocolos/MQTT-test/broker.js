import { Aedes } from 'aedes';
import net from 'net';
import { writeFile, appendFile, access } from 'fs/promises';

// Mapa: clientId -> Set de topics suscritos
const clientSubscriptions = new Map();

// Ruta del CSV de suscripciones (junto a este archivo)
const csvUrl = new URL('./subscriptions.csv', import.meta.url);

// Ruta del CSV de publicaciones (junto a este archivo)
const messagesCsvUrl = new URL('./messages.csv', import.meta.url);
let messagesFileInitialized = false;

async function saveSubscriptionsCsv() {
  try {
    let csv = 'clientId,topic\n';
    for (const [clientId, topics] of clientSubscriptions.entries()) {
      for (const topic of topics) {
        // Escapar comas si hiciera falta (básico)
        const safeClientId = String(clientId).replaceAll('"', '""');
        const safeTopic = String(topic).replaceAll('"', '""');
        csv += `"${safeClientId}","${safeTopic}"\n`;
      }
    }
    await writeFile(csvUrl, csv, 'utf8');
  } catch (err) {
    console.error('Error al guardar subscriptions.csv:', err);
  }
}

async function ensureMessagesCsvHeader() {
  if (messagesFileInitialized) return;
  try {
    // Si el archivo no existe, lo creamos con la cabecera
    await access(messagesCsvUrl);
  } catch {
    const header = 'timestamp,clientId,topic,payload\n';
    await writeFile(messagesCsvUrl, header, 'utf8');
  }
  messagesFileInitialized = true;
}

async function appendMessageToCsv({ timestamp, clientId, topic, payload }) {
  try {
    await ensureMessagesCsvHeader();
    const safeClientId = String(clientId ?? '').replaceAll('"', '""');
    const safeTopic = String(topic ?? '').replaceAll('"', '""');
    const safePayload = String(payload ?? '').replaceAll('"', '""');
    const row = `${timestamp.toISOString()},"${safeClientId}","${safeTopic}","${safePayload}"\n`;
    await appendFile(messagesCsvUrl, row, 'utf8');
  } catch (err) {
    console.error('Error al guardar messages.csv:', err);
  }
}

const aedes = await Aedes.createBroker();
const port = 1883;
const server = net.createServer(aedes.handle);

// Eventos para mantener el mapa de suscripciones
aedes.on('client', (client) => {
  if (!client || !client.id) return;
  if (!clientSubscriptions.has(client.id)) {
    clientSubscriptions.set(client.id, new Set());
  }
});

aedes.on('clientDisconnect', (client) => {
  if (!client || !client.id) return;
  clientSubscriptions.delete(client.id);
  void saveSubscriptionsCsv();
});

aedes.on('subscribe', (subscriptions, client) => {
  if (!client || !client.id) return;
  let topics = clientSubscriptions.get(client.id);
  if (!topics) {
    topics = new Set();
    clientSubscriptions.set(client.id, topics);
  }
  for (const sub of subscriptions) {
    if (sub && sub.topic) {
      topics.add(sub.topic);
    }
  }
  void saveSubscriptionsCsv();
});

aedes.on('unsubscribe', (subscriptions, client) => {
  if (!client || !client.id) return;
  const topics = clientSubscriptions.get(client.id);
  if (!topics) return;
  for (const topic of subscriptions) {
    if (topic) {
      topics.delete(topic);
    }
  }
  if (topics.size === 0) {
    clientSubscriptions.delete(client.id);
  }
  void saveSubscriptionsCsv();
});

// Registrar publicaciones de usuario en CSV y usar $SYS para actualizar suscripciones
aedes.on('publish', (packet, client) => {
  const topic = packet.topic;
  const payload = packet.payload?.toString?.() ?? '';
  const clientId = client?.id ?? '';
  const timestamp = new Date();

  // 1) Usar mensajes $SYS para mantener subscriptions.csv
  if (topic && topic.includes('/new/subscribes')) {
    try {
      const data = JSON.parse(payload);
      const sysClientId = data.clientId;
      const subs = data.subs || [];
      if (!sysClientId) return;

      let topics = clientSubscriptions.get(sysClientId);
      if (!topics) {
        topics = new Set();
        clientSubscriptions.set(sysClientId, topics);
      }
      for (const sub of subs) {
        if (sub && sub.topic) {
          topics.add(sub.topic);
        }
      }
      void saveSubscriptionsCsv();
    } catch (err) {
      console.error('Error al procesar $SYS new/subscribes:', err);
    }
  } else if (topic && topic.includes('/new/unsubscribes')) {
    try {
      const data = JSON.parse(payload);
      const sysClientId = data.clientId;
      const subs = data.subs || [];
      if (!sysClientId) return;

      const topics = clientSubscriptions.get(sysClientId);
      if (!topics) return;

      for (const subTopic of subs) {
        if (subTopic) {
          topics.delete(subTopic);
        }
      }
      if (topics.size === 0) {
        clientSubscriptions.delete(sysClientId);
      }
      void saveSubscriptionsCsv();
    } catch (err) {
      console.error('Error al procesar $SYS new/unsubscribes:', err);
    }
    return; // No guardamos estos mensajes $SYS en messages.csv
  }

  // 2) Ignorar todos los topics internos $SYS en el CSV de mensajes
  if (topic && topic.startsWith('$SYS/')) {
    return;
  }

  // 3) Guardar solo mensajes de usuario en messages.csv
  void appendMessageToCsv({
    timestamp,
    clientId,
    topic,
    payload
  });
});

server.listen(port, () => {
  console.log('Broker MQTT corriendo en puerto:', port);
  console.log('Las suscripciones se guardan en subscriptions.csv');
});
