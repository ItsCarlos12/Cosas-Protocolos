import net from 'net';
import readline from 'readline';

const Port = 4000;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const client = net.createConnection({ port: Port, host: '127.0.0.1' }, () => {
  console.log('Conectado al servidor en el puerto', Port, '....');
});

client.setEncoding('utf8');

client.on('data', (data) => {
  process.stdout.write(data);
});

rl.on('line', (line) => {
  client.write(line + '\n');
});

client.on('end', () => {
  console.log('\nConexión cerrada por el servidor.');
  rl.close();
});

client.on('error', (err) => {
  console.error('Error en el cliente:', err.message);
});