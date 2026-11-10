// Relais WebSocket de test : renvoie chaque message aux autres clients du même salon. node test/relay.cjs [port]
const { WebSocketServer } = require('ws');
const port = +(process.argv[2] || 8125); const rooms = new Map();
new WebSocketServer({ port }).on('connection', (ws, req) => {
  const room = req.url; if (!rooms.has(room)) rooms.set(room, new Set()); const R = rooms.get(room); R.add(ws);
  ws.on('message', (d) => { for (const o of R) if (o !== ws && o.readyState === 1) o.send(d.toString()); });
  ws.on('close', () => R.delete(ws));
});
console.log('relais sur', port);
