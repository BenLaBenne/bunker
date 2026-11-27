// server/game/Match.js — Partie autoritaire : simulation à 20 Hz côté serveur.
// Gère déplacements, collisions, escaliers, combat, projectiles, tâches partagées,
// armure anti-nucléaire, intoxication progressive, zone d'évacuation et victoires.
import { SERVER, TILE, BOT_DIFFICULTY } from '../config.js';
import { visibleTiles, pointVisible, los } from './Vision.js';
import { astarFloor, stairToward } from './Pathfinding.js';
import { updateBots } from './Bots.js';
import { clamp } from '../util.js';

let MATCH_SEQ = 1;

const DIR_FROM_VEC = (vx, vy) => (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 2 : 1) : (vy > 0 ? 0 : 3));

export class Match {
  /**
   * @param opts { id, map(GameMap), cfg(game config), humans:[{userId,uname,fighter,skin}], fighters:[stats],
   *               difficulty, testMode, gameServer }
   */
  constructor(opts) {
    this.id = opts.id || ('m' + (MATCH_SEQ++));
    this.map = opts.map;
    this.cfg = opts.cfg;
    this.fighters = opts.fighters;       // stats par fighter id
    this.testMode = !!opts.testMode;
    this.gameServer = opts.gameServer;
    this.diff = BOT_DIFFICULTY[opts.difficulty] || BOT_DIFFICULTY.normal;
    this.radiationCfg = { ...this.cfg, ...(opts.map.radiation || {}) };
    Object.assign(this.radiationCfg, {
      repairTimeS: (opts.map.radiation?.repairTimeS ?? this.cfg.repairTimeS),
      graceS: (opts.map.radiation?.graceS ?? this.cfg.radiationGraceS),
      armorDrain: (opts.map.radiation?.armorDrain ?? this.cfg.radiationArmorDrain),
      damage: (opts.map.radiation?.damage ?? this.cfg.radiationDamage),
      maxSurviveS: (opts.map.radiation?.maxSurviveS ?? 240)
    });

    this.players = new Map();     // entityId -> player
    this.sockets = new Map();     // userId -> ws
    this.projectiles = [];
    this.tasks = new Map();       // taskId -> state
    for (const t of this.map.tasks) {
      this.tasks.set(t.id, { id: t.id, progress: 0, done: false, workers: new Set() });
    }
    this.bunkerProgress = 0;
    this.clock = 0;
    this.phase = 'playing';       // playing | radiation | evac | ended
    this.radiationActive = false;
    this.damagePhase = false;
    this.evacOpen = false;
    this.evacRemain = 0;
    this.winnerType = null;
    this.winners = [];
    this.events = [];
    this.visionCache = new Map(); // entityId -> Set("x,y")
    this.visionTick = 0;
    this.snapAccum = 0;
    this.botSeq = 0;
    this.endedAt = 0;
    this.startedAt = Date.now();
    this.persisted = false;

    // Création des entités humaines puis remplissage par des bots
    let spawnIdx = 0;
    const spawns = this.map.spawns;
    const nextSpawn = () => spawns[spawnIdx++ % spawns.length];
    for (const h of opts.humans) {
      const sp = nextSpawn();
      this.players.set('h' + h.userId, this.makePlayer('h' + h.userId, 'human', h.userId, h.uname, h.fighter, sp, h.skin));
    }
    if (this.cfg.fillBots) {
      const botNames = opts.botNames || [];
      const fighterIds = Object.keys(this.fighters);
      while (this.players.size < this.cfg.maxPlayers) {
        const fid = fighterIds[Math.floor(Math.random() * fighterIds.length)];
        const sp = nextSpawn();
        const id = 'b' + (++this.botSeq);
        const name = botNames[(this.botSeq - 1) % botNames.length] + (this.botSeq > botNames.length ? '-' + this.botSeq : '');
        this.players.set(id, this.makePlayer(id, 'bot', null, name, fid, sp, ''));
      }
    }
    this.aliveCount = this.players.size;
    this.interval = setInterval(() => this.safeTick(), SERVER.TICK_MS);
  }

  makePlayer(id, kind, userId, uname, fighterId, spawn, skin) {
    const f = this.fighters[fighterId] || Object.values(this.fighters)[0];
    return {
      id, kind, userId, uname, fighter: fighterId,
      x: spawn.x + 0.5, y: spawn.y + 0.5, floor: spawn.floor || 0,
      dir: 0, moving: false,
      hp: f.hp, maxHp: f.hp, armor: this.cfg.startArmor,
      alive: true, extracted: false, extracting: 0,
      kills: 0, deaths: 0, tasksDone: 0, damage: 0,
      input: { mx: 0, my: 0, attack: false, interact: false, aimX: 0, aimY: 1 },
      prevInteract: false,
      attackCd: 0, specialCd: 0,
      shieldHp: 0, shieldUntil: 0,
      cloakUntil: 0, dashUntil: 0, stimUntil: 0,
      connected: kind === 'human', disconnectAt: 0, botControlled: kind === 'bot',
      exposure: 0,
      repairTarget: null,
      // État bot
      bot: { path: null, pathIdx: 0, goal: null, repathAt: 0, reactAt: 0, targetId: null, wanderUntil: 0 },
      taskContrib: {},   // taskId -> progression personnelle accumulée
      coinsPending: 0,
      xpPending: 0,
      survivedS: 0,
      skin: skin || '',
      // Stats du fighter figées pour le combat
      stats: f
    };
  }

  /* ---------------- réseau ---------------- */

  addSocket(userId, ws) {
    this.sockets.set(userId, ws);
    const p = this.players.get('h' + userId);
    if (p) {
      if (!p.connected) { this.pushEvent({ type: 'reconnect', id: p.id, name: p.uname }); }
      p.connected = true; p.botControlled = false; p.disconnectAt = 0;
      this.sendTo(ws, { t: 'init', self: p.id, map: this.map.toClient(), cfg: this.clientCfg(), fighters: this.fighters, roster: this.roster() });
    }
  }

  removeSocket(userId) {
    this.sockets.delete(userId);
    const p = this.players.get('h' + userId);
    if (p && p.alive && !p.extracted) {
      p.connected = false;
      p.disconnectAt = this.clock;
      // après le délai de grâce, un bot prend le contrôle
      if (!this.testMode) { /* géré dans le tick */ }
    }
  }

  roster() {
    const out = [];
    for (const p of this.players.values()) {
      out.push({ id: p.id, name: p.uname, kind: p.kind, fighter: p.fighter, skin: p.skin });
    }
    return out;
  }

  clientCfg() {
    return {
      maxPlayers: this.cfg.maxPlayers,
      repairTimeS: this.radiationCfg.repairTimeS,
      graceS: this.radiationCfg.graceS,
      armorMax: this.cfg.armorMax,
      evacTimeS: this.cfg.evacTimeS,
      visionRadius: SERVER.VISION_RADIUS,
      extractTimeS: SERVER.EXTRACT_TIME_S
    };
  }

  sendTo(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket fermée */ }
  }

  broadcast(msg, exceptUserId = null) {
    for (const [uid, ws] of this.sockets) {
      if (uid !== exceptUserId) this.sendTo(ws, msg);
    }
  }

  pushEvent(e) {
    if (this.events.length < 200) this.events.push(e);
  }

  /* ---------------- entrées client ---------------- */

  handleInput(userId, m) {
    const p = this.players.get('h' + userId);
    if (!p || !p.alive || p.extracted) return;
    if (typeof m.mx === 'number' && typeof m.my === 'number') {
      const len = Math.hypot(m.mx, m.my);
      p.input.mx = len > 1 ? m.mx / len : (len > 0.01 ? m.mx : 0);
      p.input.my = len > 1 ? m.my / len : (len > 0.01 ? m.my : 0);
    }
    if (typeof m.attack === 'boolean') p.input.attack = m.attack;
    if (typeof m.interact === 'boolean') p.input.interact = m.interact;
    if (typeof m.aimX === 'number' && typeof m.aimY === 'number') {
      const l = Math.hypot(m.aimX, m.aimY) || 1;
      p.input.aimX = m.aimX / l; p.input.aimY = m.aimY / l;
    }
    if (m.special === true) this.useSpecial(p);
    if (m.emote) {
      const emote = String(m.emote).slice(0, 24);
      p.emoteUntil = this.clock + 3;
      p.emoteText = emote;
      this.pushEvent({ type: 'emote', id: p.id, text: emote });
    }
  }

  /* ---------------- simulation ---------------- */

  safeTick() {
    try { this.tick(); } catch (err) {
      console.error(`[match ${this.id}] tick error:`, err);
    }
  }

  tick() {
    if (this.phase === 'ended') {
      // maintenance après la fin (garder les sockets quelques secondes)
      if (Date.now() - this.endedAt > 12000) this.gameServer.closeMatch(this.id);
      return;
    }
    const dt = SERVER.TICK_MS / 1000;
    this.clock += dt;

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.kind === 'bot' || p.botControlled) { /* géré par updateBots */ }
      else if (p.connected) this.updatePlayer(p, dt);
      else if (this.clock - p.disconnectAt > SERVER.DISCONNECT_GRACE_S) {
        p.botControlled = true;
      }
      p.survivedS += dt;
    }
    updateBots(this, dt);
    this.updateProjectiles(dt);
    this.updateRadiation(dt);
    this.updateEvac(dt);
    this.updateVision();
    this.checkWinConditions();
    this.snapAccum += dt;
    if (this.snapAccum >= 1 / SERVER.SNAPSHOT_HZ) {
      this.snapAccum = 0;
      this.sendSnapshots();
    }
  }

  moveEntity(p, mx, my, speed, dt) {
    // oriente l'entité
    if (mx || my) {
      p.dir = DIR_FROM_VEC(mx, my);
      p.moving = true;
    } else p.moving = false;
    const step = speed * dt;
    // axe X puis axe Y (glissement le long des murs)
    if (mx) {
      const nx = p.x + mx * step;
      if (!this.map.collides(p.floor, nx, p.y, SERVER.PLAYER_RADIUS)) p.x = nx;
    }
    if (my) {
      const ny = p.y + my * step;
      if (!this.map.collides(p.floor, p.x, ny, SERVER.PLAYER_RADIUS)) p.y = ny;
    }
    p.x = clamp(p.x, 0.4, this.map.w - 0.4);
    p.y = clamp(p.y, 0.4, this.map.h - 0.4);
  }

  speedOf(p) {
    let s = p.stats.speed;
    if (this.clock < p.dashUntil) s *= 2.5;
    if (this.clock < p.stimUntil) s *= 1.2;
    return s;
  }

  updatePlayer(p, dt) {
    this.moveEntity(p, p.input.mx, p.input.my, this.speedOf(p), dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.specialCd = Math.max(0, p.specialCd - dt);
    if (p.shieldUntil && this.clock > p.shieldUntil) { p.shieldHp = 0; p.shieldUntil = 0; }
    if (p.input.attack) this.tryAttack(p, p.input.aimX, p.input.aimY);
    // interaction : maintenir pour réparer / appuyer près d'un escalier pour changer d'étage
    const pressed = p.input.interact && !p.prevInteract;
    const task = this.taskInRange(p);
    if (p.input.interact && task) {
      this.repairTick(p, task, dt);
    } else {
      if (p.repairTarget) { p.repairTarget.workers.delete(p.id); p.repairTarget = null; }
      if (pressed) {
        const st = this.stairInRange(p);
        if (st) this.useStairs(p, st);
      }
    }
    p.prevInteract = p.input.interact;
  }

  taskInRange(p) {
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    let best = null, bestD = 1e9;
    for (const t of this.map.tasks) {
      if (t.floor !== p.floor) continue;
      const st = this.tasks.get(t.id);
      if (!st || st.done) continue;
      const d = Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - p.y);
      if (d < SERVER.INTERACT_RANGE && d < bestD) { best = st; bestD = d; }
    }
    return best;
  }

  stairInRange(p) {
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const s = this.map.stairAt(p.floor, cx + dx, cy + dy);
      if (s) return s;
    }
    return null;
  }

  useStairs(p, s) {
    if (!p.alive || p.extracted) return;
    // La destination doit être praticable et dégagée
    if (!this.map.isPassable(s.to.floor, s.to.x, s.to.y)) return;
    p.floor = s.to.floor;
    p.x = s.to.x + 0.5; p.y = s.to.y + 0.5;
    if (p.repairTarget) { p.repairTarget.workers.delete(p.id); p.repairTarget = null; }
    this.pushEvent({ type: 'stairs', id: p.id, floor: p.floor });
  }

  repairTick(p, st, dt) {
    const task = this.map.tasks.find(t => t.id === st.id);
    if (p.repairTarget !== st) {
      p.repairTarget = st;
      st.workers.add(p.id);
    }
    const rate = (p.stats.repair_mult || 1) * (this.clock < p.stimUntil ? 1.5 : 1);
    const dp = dt / task.duration * rate;
    st.progress = Math.min(1, st.progress + dp);
    p.taskContrib[st.id] = (p.taskContrib[st.id] || 0) + dp;
    if (st.progress >= 1 && !st.done) {
      st.done = true;
      this.bunkerProgress = Math.min(100, this.bunkerProgress + task.weight);
      for (const wId of st.workers) {
        const w = this.players.get(wId);
        if (!w) continue;
        w.tasksDone += 1;
        w.armor = Math.min(this.cfg.armorMax, w.armor + this.cfg.taskArmorBonus);
        w.coinsPending += this.cfg.taskCoins;
        w.xpPending += this.cfg.xpTask;
      }
      this.pushEvent({ type: 'task_done', id: st.id, name: task.name || st.id, progress: this.bunkerProgress, by: [...st.workers] });
      st.workers.clear();
      for (const q of this.players.values()) if (q.repairTarget === st) q.repairTarget = null;
      // Bunker entièrement réparé → évacuation
      if (this.bunkerProgress >= 100) this.openEvac();
    }
  }

  tryAttack(p, aimX, aimY) {
    if (p.attackCd > 0) return;
    const st = p.stats;
    p.attackCd = st.attack_cooldown;
    const ax = aimX || (p.input.mx || 0), ay = aimY || (p.input.my || 0.0001);
    const len = Math.hypot(ax, ay) || 1;
    const dx = ax / len, dy = ay / len;
    p.dir = DIR_FROM_VEC(dx, dy);
    if (st.attack_type === 'melee') {
      let hitSomething = false;
      for (const q of this.players.values()) {
        if (q === p || !q.alive || q.extracted || q.floor !== p.floor) continue;
        if (q.id === p.id) continue;
        if (this.clock < q.cloakUntil) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d > st.attack_range + 0.35) continue;
        const dot = ((q.x - p.x) * dx + (q.y - p.y) * dy) / (d || 1);
        if (dot < 0.2) continue;
        if (!los(this.map, p.floor, Math.floor(p.x), Math.floor(p.y), Math.floor(q.x), Math.floor(q.y))) continue;
        this.applyDamage(q, st.damage, p);
        hitSomething = true;
      }
      this.pushEvent({ type: 'attack', id: p.id, kind: 'melee', x: p.x + dx * 0.8, y: p.y + dy * 0.8, floor: p.floor, hit: hitSomething });
    } else {
      const pierce = p.overchargeUntil && this.clock < p.overchargeUntil;
      const dmg = st.damage * (pierce ? 2 : 1);
      this.projectiles.push({
        id: 'pj' + Math.random().toString(36).slice(2, 8),
        floor: p.floor, x: p.x + dx * 0.45, y: p.y + dy * 0.45,
        vx: dx * 9, vy: dy * 9, owner: p.id, dmg,
        ttl: st.attack_range / 9, pierce: !!pierce, hitIds: new Set()
      });
      if (pierce) p.overchargeUntil = 0;
      this.pushEvent({ type: 'attack', id: p.id, kind: 'ranged', x: p.x, y: p.y, floor: p.floor });
    }
  }

  useSpecial(p) {
    if (p.specialCd > 0 || !p.alive || p.extracted) return;
    const sp = p.stats.special;
    if (!sp) return;
    p.specialCd = p.stats.special_cd;
    switch (sp) {
      case 'dash': p.dashUntil = this.clock + 1.2; break;
      case 'shield': p.shieldHp = 25; p.shieldUntil = this.clock + 5; break;
      case 'overcharge': p.overchargeUntil = this.clock + 4; break;
      case 'medkit': p.hp = Math.min(p.maxHp, p.hp + 30); this.pushEvent({ type: 'heal', id: p.id }); break;
      case 'cloak': p.cloakUntil = this.clock + 3; break;
    }
    this.pushEvent({ type: 'special', id: p.id, sp });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pj = this.projectiles[i];
      pj.ttl -= dt;
      const steps = 2; // sous-pas pour ne pas traverser les murs
      let dead = pj.ttl <= 0;
      for (let s = 0; s < steps && !dead; s++) {
        pj.x += (pj.vx * dt) / steps;
        pj.y += (pj.vy * dt) / steps;
        const tx = Math.floor(pj.x), ty = Math.floor(pj.y);
        if (this.map.isSolid(pj.floor, tx, ty)) { dead = true; break; }
        for (const q of this.players.values()) {
          if (q.id === pj.owner || !q.alive || q.extracted || q.floor !== pj.floor) continue;
          if (this.clock < q.cloakUntil) continue;
          if (pj.hitIds.has(q.id)) continue;
          if (Math.hypot(q.x - pj.x, q.y - pj.y) < 0.42) {
            this.applyDamage(q, pj.dmg, this.players.get(pj.owner));
            pj.hitIds.add(q.id);
            if (!pj.pierce) { dead = true; break; }
          }
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
  }

  applyDamage(victim, dmg, attacker) {
    if (!victim.alive || victim.extracted) return;
    let d = dmg;
    if (victim.shieldHp > 0) {
      const absorbed = Math.min(victim.shieldHp, d);
      victim.shieldHp -= absorbed;
      d -= absorbed;
      if (victim.shieldHp <= 0) victim.shieldUntil = 0;
    }
    if (d <= 0) return;
    victim.hp -= d;
    if (attacker) {
      attacker.damage += Math.round(Math.min(dmg, dmg));
      victim.lastHitBy = attacker.id;
    }
    if (victim.hp <= 0) this.killPlayer(victim, attacker);
  }

  killPlayer(victim, attacker) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    if (victim.repairTarget) { victim.repairTarget.workers.delete(victim.id); victim.repairTarget = null; }
    let killer = null;
    if (attacker && attacker.alive && attacker.id !== victim.id) {
      killer = attacker;
      attacker.kills += 1;
      attacker.armor = Math.min(this.cfg.armorMax, attacker.armor + this.cfg.killArmorBonus);
      attacker.coinsPending += this.cfg.killCoins;
      attacker.xpPending += this.cfg.xpKill;
    }
    this.pushEvent({
      type: 'kill', victim: victim.id, victimName: victim.uname,
      killer: killer ? killer.id : null, killerName: killer ? killer.uname : null,
      floor: victim.floor, x: victim.x, y: victim.y
    });
    this.aliveCount = [...this.players.values()].filter(q => q.alive && !q.extracted).length;
  }

  /* ---------------- intox nucléaire ---------------- */

  updateRadiation(dt) {
    if (this.evacOpen) return;
    const rc = this.radiationCfg;
    if (!this.radiationActive) {
      if (this.clock >= rc.repairTimeS - this.cfg.radiationAlertS && this.bunkerProgress < 100) {
        this.pushEvent({ type: 'radiation_warning', inS: this.cfg.radiationAlertS });
      }
      if (this.clock >= rc.repairTimeS && this.bunkerProgress < 100) {
        this.radiationActive = true;
        this.phase = 'radiation';
        this.pushEvent({ type: 'radiation_start', graceS: rc.graceS });
      }
      return;
    }
    // Phase d'alerte puis de dégâts
    const radElapsed = this.clock - rc.repairTimeS;
    if (!this.damagePhase && radElapsed >= rc.graceS) {
      this.damagePhase = true;
      this.pushEvent({ type: 'radiation_damage', damage: rc.damage });
    }
    for (const p of this.players.values()) {
      if (!p.alive || p.extracted) continue;
      // zones dangereuses : dégâts pendant l'intoxication
      if (this.map.isHazard(p.floor, Math.floor(p.x), Math.floor(p.y))) {
        this.applyDamage(p, SERVER.ATTACK_HAZARD_DPS * dt, null);
        if (!p.alive) continue;
      }
      if (this.radiationActive) {
        // l'armure encaisse d'abord
        if (p.armor > 0) {
          p.armor = Math.max(0, p.armor - rc.armorDrain * dt);
        } else if (this.damagePhase) {
          p.hp -= rc.damage * dt;
          p.exposure += dt;
          if (p.hp <= 0 || p.exposure >= rc.maxSurviveS - rc.graceS) {
            this.killPlayer(p, null);
          }
        }
      }
    }
  }

  /* ---------------- évacuation & victoire ---------------- */

  openEvac() {
    if (this.evacOpen) return;
    this.radiationActive = false;
    this.damagePhase = false;
    this.phase = 'evac';
    this.evacOpen = true;
    this.evacRemain = this.cfg.evacTimeS;
    this.pushEvent({ type: 'evac_open', timeS: this.cfg.evacTimeS });
  }

  updateEvac(dt) {
    if (!this.evacOpen || this.phase === 'ended') return;
    this.evacRemain -= dt;
    for (const p of this.players.values()) {
      if (!p.alive || p.extracted) continue;
      if (this.map.isEvac(p.floor, Math.floor(p.x), Math.floor(p.y))) {
        p.extracting += dt;
        if (p.extracting >= SERVER.EXTRACT_TIME_S) {
          p.extracted = true;
          p.extracting = 0;
          this.pushEvent({ type: 'extract', id: p.id, name: p.uname });
        }
      } else {
        p.extracting = Math.max(0, p.extracting - dt * 2);
      }
    }
    if (this.evacRemain <= 0) this.endMatch();
  }

  checkWinConditions() {
    if (this.phase === 'ended') return;
    const inPlay = [...this.players.values()].filter(p => p.alive && !p.extracted);
    if (!this.evacOpen) {
      if (inPlay.length === 1 && this.players.size > 1) {
        this.endMatch('survival', [inPlay[0]]);
      } else if (inPlay.length === 0) {
        this.endMatch('no_survivor', []);
      }
    } else {
      if (inPlay.length === 0) this.endMatch(); // tous extraits ou morts
    }
    if (this.clock > SERVER.MAX_MATCH_S) this.endMatch('timeout', this.winners);
  }

  endMatch(winnerType = null, winnerPlayers = []) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.endedAt = Date.now();
    clearInterval(this.interval);
    if (!winnerType) {
      const extracted = [...this.players.values()].filter(p => p.extracted);
      const inPlay = [...this.players.values()].filter(p => p.alive && !p.extracted);
      if (inPlay.length === 1) { winnerType = 'survival'; winnerPlayers = [inPlay[0]]; }
      else if (extracted.length > 0) { winnerType = 'bunker'; winnerPlayers = extracted; }
      else { winnerType = 'no_survivor'; winnerPlayers = []; }
    }
    this.winnerType = winnerType;
    this.winners = winnerPlayers.map(p => p.id);
    const results = this.buildResults();
    this.pushEvent({ type: 'match_over', winnerType, winners: this.winners });
    for (const [, ws] of this.sockets) {
      this.sendTo(ws, { t: 'match_end', winnerType, winners: this.winners, results });
    }
    if (!this.testMode) {
      import('./results.js').then(({ persistResults }) => persistResults(this, results)).catch(err => {
        console.error('[match] persist error:', err);
      });
    }
    if (this.gameServer) this.gameServer.onMatchEnded(this.id);
  }

  buildResults() {
    const players = [...this.players.values()].map(p => ({
      id: p.id, userId: p.userId, uname: p.uname, kind: p.kind, fighter: p.fighter,
      kills: p.kills, deaths: p.deaths, tasksDone: p.tasksDone, damage: Math.round(p.damage),
      survivedS: Math.round(p.survivedS), won: this.winners.includes(p.id),
      xp: Math.round(p.xpPending + (this.winners.includes(p.id) ? this.cfg.xpWin : 0) + this.cfg.xpBase),
      coins: Math.round(p.coinsPending + (this.winners.includes(p.id) ? this.cfg.winCoins : this.cfg.loseCoins)),
      trophies: this.winners.includes(p.id) ? this.cfg.trophiesWin
        : (this.winnerType === 'survival' ? -this.cfg.trophiesLose : 0),
      taskContrib: p.taskContrib
    }));
    return { matchId: this.id, mapId: this.map.id, winnerType: this.winnerType, winners: this.winners, players };
  }

  /* ---------------- vision ---------------- */

  updateVision() {
    this.visionTick++;
    if (this.visionTick % 5 !== 0) return; // 4 Hz
    for (const p of this.players.values()) {
      if (p.kind !== 'human') continue;
      this.visionCache.set(p.id, visibleTiles(this.map, p.floor, p.x, p.y, SERVER.VISION_RADIUS));
    }
  }

  entityVisibleTo(viewer, target) {
    if (target.floor !== viewer.floor) return false;
    if (!target.alive || target.extracted) return false;
    if (this.clock < target.cloakUntil && target.id !== viewer.id) return false;
    if (target.id === viewer.id) return true;
    return pointVisible(this.map, viewer.floor, viewer.x, viewer.y, target.x, target.y, SERVER.VISION_RADIUS);
  }

  /* ---------------- snapshots ---------------- */

  sendSnapshots() {
    const events = this.events;
    this.events = [];
    for (const [userId, ws] of this.sockets) {
      const viewer = this.players.get('h' + userId);
      if (!viewer) continue;
      this.sendTo(ws, this.snapshotFor(viewer, events));
    }
  }

  snapshotFor(viewer, events) {
    const players = [];
    for (const p of this.players.values()) {
      if (p.id === viewer.id) continue;
      if (!this.entityVisibleTo(viewer, p)) continue;
      players.push({
        id: p.id, name: p.uname, fighter: p.fighter, skin: p.skin,
        x: +p.x.toFixed(2), y: +p.y.toFixed(2), floor: p.floor, dir: p.dir,
        hp: Math.round(p.hp / p.maxHp * 100), cloak: this.clock < p.cloakUntil,
        shield: p.shieldHp > 0, moving: p.moving
      });
    }
    const projectiles = this.projectiles
      .filter(pj => pj.floor === viewer.floor)
      .map(pj => ({ id: pj.id, x: +pj.x.toFixed(2), y: +pj.y.toFixed(2), vx: +pj.vx.toFixed(1), vy: +pj.vy.toFixed(1), owner: pj.owner }));
    return {
      t: 'snap',
      clock: Math.round(this.clock * 10) / 10,
      phase: this.phase,
      progress: Math.round(this.bunkerProgress),
      alive: this.aliveCount,
      rad: this.radiationActive ? (this.damagePhase ? 2 : 1) : 0,
      evac: this.evacOpen ? { remain: Math.max(0, Math.round(this.evacRemain)) } : null,
      me: {
        id: viewer.id, x: +viewer.x.toFixed(2), y: +viewer.y.toFixed(2), floor: viewer.floor,
        dir: viewer.dir, hp: Math.max(0, Math.round(viewer.hp)), maxHp: viewer.maxHp,
        armor: Math.round(viewer.armor), alive: viewer.alive, extracted: viewer.extracted,
        extracting: +viewer.extracting.toFixed(1),
        attackCd: +viewer.attackCd.toFixed(2), specialCd: +viewer.specialCd.toFixed(2),
        cloak: this.clock < viewer.cloakUntil, shield: viewer.shieldHp > 0,
        repairing: !!viewer.repairTarget
      },
      players, projectiles, tasks: this.tasksForClient(), events
    };
  }

  tasksForClient() {
    const out = [];
    for (const st of this.tasks.values()) {
      out.push({ id: st.id, progress: +st.progress.toFixed(2), done: st.done, workers: st.workers.size });
    }
    return out;
  }
}
