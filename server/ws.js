// server/ws.js — Hub WebSocket : authentification par cookie de session,
// routage des messages (file, input, chat de clan), limitation de débit, keepalive.
import { WebSocketServer } from 'ws';
import { getUserByToken } from './auth.js';
import { parseCookies } from './util.js';

const MSG_LIMITS = { input: 45, default: 8, clan_chat: 2 };

export function setupWebSocket(httpServer, gameServer, clanHub) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();

  httpServer.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    try {
      const cookies = parseCookies(req.headers.cookie);
      const user = await getUserByToken(cookies.bk_session);
      if (!user || user.banned) {
        socket.write('HTTP/1.1 4401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.user = { id: user.id, uname: user.uname, is_admin: !!user.is_admin, selected_fighter: user.selected_fighter, selected_skin: user.selected_skin, lang: user.lang };
        clients.add(ws);
        initConnection(ws, gameServer, clanHub, clients);
      });
    } catch (err) {
      console.error('[ws] upgrade error:', err.message);
      socket.destroy();
    }
  });

  // Keepalive : coupe les connexions mortes
  const pingInterval = setInterval(() => {
    for (const ws of clients) {
      if (ws.isAlive === false) { ws.terminate(); clients.delete(ws); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* noop */ }
    }
  }, 30000);
  pingInterval.unref();

  return { wss, clients };
}

function initConnection(ws, gameServer, clanHub, clients) {
  ws.isAlive = true;
  ws.rate = { count: 0, windowStart: Date.now() };
  ws.on('pong', () => { ws.isAlive = true; });

  // Reprise de partie en cours (reconnexion)
  const room = gameServer.roomOf(ws.user.id);
  if (room && room.match) {
    room.match.addSocket(ws.user.id, ws);
  } else {
    ws.send(JSON.stringify({ t: 'hello', uname: ws.user.uname }));
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    // Limite de débit globale par socket
    const nowMs = Date.now();
    if (nowMs - ws.rate.windowStart > 1000) { ws.rate.windowStart = nowMs; ws.rate.count = 0; }
    ws.rate.count++;
    if (ws.rate.count > 120) return;

    const lim = MSG_LIMITS[msg.t] ?? MSG_LIMITS.default;
    if (msg.t !== 'input') {
      ws.rate['c_' + msg.t] = (ws.rate['c_' + msg.t] || 0) + 1;
      if (nowMs - ws.rate.windowStart > 1000) ws.rate['c_' + msg.t] = 1;
      else if (ws.rate['c_' + msg.t] > lim) return;
    }

    switch (msg.t) {
      case 'ping':
        ws.send(JSON.stringify({ t: 'pong', time: Date.now() }));
        break;
      case 'queue':
        gameServer.queue(ws.user, ws, { mapId: msg.mapId, roomCode: msg.roomCode, test: !!msg.test })
          .then(res => {
            if (res.ok) ws.send(JSON.stringify({ t: 'queued', roomId: res.roomId }));
            else ws.send(JSON.stringify({ t: 'error', code: res.error }));
          })
          .catch(err => {
            console.error('[ws] queue error:', err);
            ws.send(JSON.stringify({ t: 'error', code: 'QUEUE_ERROR' }));
          });
        break;
      case 'cancel_queue':
        gameServer.cancelQueue(ws.user);
        ws.send(JSON.stringify({ t: 'queue_cancelled' }));
        break;
      case 'input': {
        const room = gameServer.roomOf(ws.user.id);
        if (room && room.match) room.match.handleInput(ws.user.id, msg);
        break;
      }
      case 'emote': {
        const room = gameServer.roomOf(ws.user.id);
        if (room && room.match) room.match.handleInput(ws.user.id, { emote: msg.text });
        break;
      }
      case 'clan_chat':
        if (clanHub) clanHub.onChat(ws.user, String(msg.text || '').slice(0, 240));
        break;
      case 'leave_match': {
        const room = gameServer.roomOf(ws.user.id);
        if (room && room.match) room.match.removeSocket(ws.user.id);
        gameServer.userRoom.delete(ws.user.id);
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    const room = gameServer.roomOf(ws.user.id);
    if (room && room.match) room.match.removeSocket(ws.user.id);
    // salle d'attente : désinscription
    if (room && room.phase === 'waiting') gameServer.cancelQueue(ws.user);
  });

  ws.on('error', () => { /* connexion morte déjà gérée */ });
}
