// server/clans.js — Hub de chat de clan : connections WS par utilisateur,
// diffusion aux membres en ligne, persistance des messages.
import { db } from './db/index.js';
import { now } from './util.js';

export function createClanHub() {
  const online = new Map(); // userId -> ws

  return {
    register(userId, ws) { online.set(userId, ws); },
    unregister(userId) { online.delete(userId); },
    isOnline(userId) { return online.has(userId); },

    async onChat(user, text) {
      const message = String(text || '').trim().slice(0, 240);
      if (!message) return;
      const mine = await db.query('SELECT clan_id FROM clan_members WHERE user_id = ?', [user.id]);
      if (!mine.length) return;
      const clanId = mine[0].clan_id;
      await db.query('INSERT INTO clan_messages (clan_id, user_id, uname, message, created_at) VALUES (?,?,?,?,?)',
        [clanId, user.id, user.uname, message, now()]);
      const members = await db.query('SELECT user_id FROM clan_members WHERE clan_id = ?', [clanId]);
      const payload = JSON.stringify({ t: 'clan_chat', clanId, uname: user.uname, text: message, time: now() });
      for (const m of members) {
        const ws = online.get(m.user_id);
        if (ws && ws.readyState === 1) {
          try { ws.send(payload); } catch { /* noop */ }
        }
      }
    },

    /** Notifie un utilisateur connecté (invitations, cadeaux, etc.). */
    pushTo(userId, payload) {
      const ws = online.get(userId);
      if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ t: 'notify', ...payload })); return true; } catch { return false; }
      }
      return false;
    }
  };
}
