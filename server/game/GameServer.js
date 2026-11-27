// server/game/GameServer.js — Salles de jeu, file d'attente et matchmaking.
// Complète automatiquement les parties avec des bots jusqu'à maxPlayers.
import { Match } from './Match.js';
import { GameMap } from './GameMap.js';
import { BOT_NAMES } from '../config.js';
import { shuffle } from '../util.js';

export class GameServer {
  /**
   * @param db database handle
   * @param getCfg() → config de jeu à jour (admin-modifiable)
   */
  constructor(db, getCfg) {
    this.db = db;
    this.getCfg = getCfg;
    this.rooms = new Map();        // roomId -> room
    this.userRoom = new Map();     // userId -> roomId
    this.mapCache = new Map();     // mapId -> {at, map}
    this.fightersCache = null;
    this.closedRooms = 0;
  }

  async getMap(mapId) {
    const cached = this.mapCache.get(mapId);
    if (cached && Date.now() - cached.at < 30000) return cached.map;
    const rows = await this.db.query('SELECT data FROM maps WHERE id = ? AND published = 1', [mapId]);
    if (!rows.length) return null;
    let data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    data.id = mapId;
    const map = new GameMap(data);
    this.mapCache.set(mapId, { at: Date.now(), map });
    return map;
  }

  async getFighters() {
    if (this.fightersCache && Date.now() - this.fightersCache.at < 30000) return this.fightersCache.map;
    const rows = await this.db.query('SELECT * FROM fighters WHERE published = 1 ORDER BY sort');
    const map = {};
    for (const f of rows) {
      map[f.id] = {
        id: f.id, name: f.name, name_en: f.name_en, hp: f.hp, speed: f.speed, damage: f.damage,
        attack_type: f.attack_type, attack_range: f.attack_range, attack_cooldown: f.attack_cooldown,
        special: f.special, special_cd: f.special_cd, repair_mult: f.repair_mult
      };
    }
    this.fightersCache = { at: Date.now(), map };
    return map;
  }

  listRooms() {
    return [...this.rooms.values()].map(r => ({
      id: r.id, mapId: r.mapId, phase: r.phase,
      humans: r.humans.length, players: r.match ? r.match.players.size : r.humans.length,
      testMode: !!r.testMode, startedAt: r.startedAt || null
    }));
  }

  roomOf(userId) {
    const rid = this.userRoom.get(userId);
    return rid ? this.rooms.get(rid) || null : null;
  }

  /** Rejoint la file (ou une salle précise via roomCode, ou une salle de test). */
  async queue(user, ws, { mapId, roomCode, test } = {}) {
    const cfg = this.getCfg();
    if (this.userRoom.has(user.id)) return { ok: false, error: 'ALREADY_IN_ROOM' };

    // Salle de test (éditeur de maps) : partie bot-only, résultats non persistés
    if (test) {
      const room = this.createRoom(mapId || 'bunker_a7', true);
      return this.joinRoom(room, user, ws, cfg);
    }

    // Rejoindre une salle par code (invitation d'ami)
    if (roomCode) {
      const room = this.rooms.get(roomCode);
      if (!room || room.phase !== 'waiting') return { ok: false, error: 'ROOM_NOT_JOINABLE' };
      if (room.humans.length >= cfg.maxPlayers) return { ok: false, error: 'ROOM_FULL' };
      return this.joinRoom(room, user, ws, cfg);
    }

    // Salle publique en attente pour cette map ?
    for (const room of this.rooms.values()) {
      if (room.phase === 'waiting' && room.mapId === (mapId || 'bunker_a7')
          && !room.testMode && room.humans.length < cfg.maxPlayers) {
        return this.joinRoom(room, user, ws, cfg);
      }
    }
    const room = this.createRoom(mapId || 'bunker_a7', false);
    return this.joinRoom(room, user, ws, cfg);
  }

  createRoom(mapId, testMode) {
    const id = (testMode ? 'test' : 'r') + Math.random().toString(36).slice(2, 10);
    const room = { id, mapId, phase: 'waiting', humans: [], match: null, testMode: !!testMode, startedAt: null, countdownEndsAt: null };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(room, user, ws, cfg) {
    room.humans.push({
      userId: user.id, uname: user.uname, fighter: user.selected_fighter || 'rust',
      lang: user.lang || 'fr', skin: user.selected_skin || '', ws
    });
    this.userRoom.set(user.id, room.id);
    if (room.phase === 'waiting' && !room.countdownEndsAt) {
      room.countdownEndsAt = Date.now() + (cfg.lobbyCountdownS || 12) * 1000;
    }
    // Salle pleine → démarrage immédiat
    if (room.humans.length >= cfg.maxPlayers) {
      this.startRoom(room, cfg);
    }
    return { ok: true, roomId: room.id, waiting: true };
  }

  cancelQueue(user) {
    const rid = this.userRoom.get(user.id);
    if (!rid) return;
    const room = this.rooms.get(rid);
    this.userRoom.delete(user.id);
    if (room && room.phase === 'waiting') {
      room.humans = room.humans.filter(h => h.userId !== user.id);
      if (!room.humans.length) this.rooms.delete(rid);
    }
  }

  /** Démarrage : vérifie le compte à rebours puis lance la partie avec les bots. */
  async maybeStartRooms() {
    const cfg = this.getCfg();
    for (const room of [...this.rooms.values()]) {
      if (room.phase !== 'waiting') continue;
      if (room.humans.length < (cfg.minHumansToStart || 1)) continue;
      if (room.countdownEndsAt && Date.now() >= room.countdownEndsAt) {
        await this.startRoom(room, cfg);
      }
    }
  }

  async startRoom(room, cfg = this.getCfg()) {
    if (room.phase !== 'waiting') return;
    room.phase = 'running';
    room.startedAt = Date.now();
    const map = await this.getMap(room.mapId);
    if (!map) {
      for (const h of room.humans) this.userRoom.delete(h.userId);
      this.rooms.delete(room.id);
      return;
    }
    const fighters = await this.getFighters();
    const match = new Match({
      id: room.id, map, cfg, fighters,
      humans: room.humans.map(h => ({ userId: h.userId, uname: h.uname, fighter: h.fighter, skin: h.skin })),
      difficulty: cfg.botDifficulty, testMode: room.testMode, gameServer: this,
      botNames: shuffle(BOT_NAMES)
    });
    room.match = match;
    for (const h of room.humans) {
      if (h.ws && h.ws.readyState === 1) match.addSocket(h.userId, h.ws);
    }
    console.log(`[game] partie ${room.id} lancée (${room.humans.length} humain(s), map ${room.mapId}${room.testMode ? ', TEST' : ''})`);
  }

  onMatchEnded(matchId) {
    const room = this.rooms.get(matchId);
    if (room) room.phase = 'ended';
  }

  closeMatch(matchId) {
    const room = this.rooms.get(matchId);
    if (!room) return;
    for (const h of room.humans) this.userRoom.delete(h.userId);
    if (room.match) room.match.sockets.clear();
    this.rooms.delete(matchId);
    this.closedRooms++;
  }

  /** Tick de maintenance : démarrages en attente + nettoyage des salles mortes. */
  async maintenance() {
    try {
      await this.maybeStartRooms();
      for (const room of [...this.rooms.values()]) {
        // salle d'attente vide → suppression
        if (room.phase === 'waiting') {
          const alive = room.humans.filter(h => h.ws && h.ws.readyState === 1);
          if (!alive.length) { this.rooms.delete(room.id); continue; }
          room.humans = alive;
        }
        if (room.phase === 'ended' && room.match && room.match.phase === 'ended'
            && Date.now() - room.match.endedAt > 15000) {
          this.closeMatch(room.id);
        }
      }
    } catch (err) {
      console.error('[game] maintenance error:', err);
    }
  }
}
