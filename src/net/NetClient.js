// src/net/NetClient.js — Client WebSocket : reconnexion automatique, envoi d'input,
// réception des snapshots avec interpolation.

export class NetClient {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
    this.inputRate = 1 / 20;      // 20 Hz
    this.lastInputSent = 0;
    this.reconnectTimer = null;
    this.reconnectDelay = 800;
    this.desiredInput = { mx: 0, my: 0, attack: false, interact: false, aimX: 0, aimY: 1 };
    this.closedByUser = false;
    this.pending = [];            // messages envoyés pendant CONNECTING, flush au open
  }

  connect() {
    this.closedByUser = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this._scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 800;
      // Rejoue les messages mis en file pendant CONNECTING (ex: queue), dans l'ordre.
      const pending = this.pending.splice(0);
      for (const m of pending) this.send(m);
      this.handlers.get('open')?.();
    };
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.handlers.get('message')?.(msg);
      this.handlers.get(msg.t)?.(msg);
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.handlers.get('close')?.();
      if (!this.closedByUser) this._scheduleReconnect();
    };
    this.ws.onerror = () => { /* géré par onclose */ };
  }

  _scheduleReconnect() {
    if (this.reconnectTimer || this.closedByUser) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(5000, this.reconnectDelay * 1.6);
      this.connect();
    }, this.reconnectDelay);
  }

  on(event, fn) { this.handlers.set(event, fn); }
  off(event) { this.handlers.delete(event); }

  /**
   * Envoie un message. Si opts.queue && socket en CONNECTING, le message est
   * mis en attente et rejoué à l'ouverture (input périodique : jamais mis en file).
   */
  send(msg, opts = {}) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(msg)); } catch { /* noop */ }
    } else if (opts.queue && this.ws && this.ws.readyState === 0) {
      if (this.pending.length < 32) this.pending.push(msg);
    }
  }

  queue(mapId, roomCode) { this.send({ t: 'queue', mapId, roomCode }, { queue: true }); }
  cancelQueue() { this.send({ t: 'cancel_queue' }, { queue: true }); }
  leaveMatch() { this.closedByUser = true; this.send({ t: 'leave_match' }, { queue: true }); }
  emote(text) { this.send({ t: 'emote', text }); }
  clanChat(text) { this.send({ t: 'clan_chat', text }); }

  /** Met à jour l'input désiré (appelé par les contrôles). */
  setInput(patch) {
    Object.assign(this.desiredInput, patch);
  }

  /** Envoi périodique de l'input (appelé chaque frame par la scène). */
  flushInput(nowMs) {
    if (nowMs - this.lastInputSent < this.inputRate * 1000) return;
    this.lastInputSent = nowMs;
    this.send({ t: 'input', ...this.desiredInput });
  }

  special() { this.send({ t: 'input', special: true }); }

  close() {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) try { this.ws.close(); } catch { /* noop */ }
    this.ws = null;
    this.connected = false;
    this.pending = [];
  }
}
