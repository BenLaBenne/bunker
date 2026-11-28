// src/gameplay/GameScene.js — Scène de jeu : connecte le réseau, le rendu PixiJS,
// le HUD, les contrôles et la carte des tâches ; applique les snapshots autoritaires.
import { Renderer } from '../rendering/Renderer.js';
import { TextureFactory } from '../rendering/TextureFactory.js';
import { GameMap } from '../world/GameMap.js';
import { HUD } from '../ui/HUD.js';
import { Controls } from '../ui/Controls.js';
import { TaskMap } from '../ui/TaskMap.js';
import { h, clear, toast } from '../ui/dom.js';
import { t } from '../ui/i18n.js';
import { audio } from '../audio/AudioManager.js';
import { state, refreshUser } from '../ui/state.js';

export class GameScene {
  constructor(root, net, { mapId, roomCode, testMap, onExit }) {
    this.root = h('div', { class: 'scene', id: 'game-scene' });
    root.append(this.root);
    this.net = net;
    this.onExit = onExit;
    this.mapId = mapId;
    this.roomCode = roomCode;
    this.testMap = testMap;
    this.snap = null;
    this.cfg = null;
    this.roster = [];
    this.ended = false;
    this.fogTimer = 0;
    this.minimapTimer = 0;
    this.lastHp = null;
    this.lastRad = 0;
    this.emoteSeq = 0;
    this.ownedEmotes = [];
    this.build();
  }

  build() {
    this.pixiHolder = h('div', { id: 'pixi-holder' });
    this.root.append(this.pixiHolder);
    // écran de chargement
    this.loading = h('div', { class: 'center-overlay' },
      h('div', { class: 'overlay-card', style: { textAlign: 'center', width: '300px' } },
        h('div', { style: { fontSize: '34px', marginBottom: '8px' } }, '☣'),
        h('div', {}, t('loading_map'))
      )
    );
    this.root.append(this.loading);
  }

  async start() {
    this.renderer = new Renderer();
    await this.renderer.init(this.pixiHolder);
    this.renderer.onFloorSwitch = (f) => toast(`⬆ ${t('floor')} ${f + 1}`);
    this.hud = new HUD(this.root, { onMinimapClick: () => this.taskMap.show() });
    this.controls = new Controls(this.root, this.net);
    this.controls.onMapToggle = () => {
      if (!this.ended) this.taskMap.isOpen ? this.taskMap.hide() : this.taskMap.show();
    };
    this.controls.onEmote = () => this.cycleEmote();
    this.taskMap = new TaskMap(this.root, {
      onClose: () => {},
      onTaskClick: (task) => {
        // ferme la carte : la flèche vers l'objectif est gérée par le HUD minicarte
        this.taskMap.hide();
        this.targetTask = task;
        toast(`🎯 ${(state.user?.lang === 'en' ? task.name_en : task.name) || task.id}`);
      }
    });

    // Réseau
    this.net.on('message', (msg) => this.handleMessage(msg));
    if (!this.net.connected) this.net.connect();
    // file d'attente
    if (this.testMap) {
      // mode test éditeur : la map est chargée localement, partie bot-only via le serveur
      this.net.send({ t: 'queue', mapId: this.testMap.id, test: true });
    } else {
      this.net.queue(this.mapId, this.roomCode);
    }
  }

  handleMessage(msg) {
    switch (msg.t) {
      case 'init': this.onInit(msg); break;
      case 'snap': this.onSnap(msg); break;
      case 'match_end': this.onMatchEnd(msg); break;
      case 'error': toast(msg.code || t('server_error'), 'error'); this.exit(); break;
      case 'hello': break;
      default: break;
    }
  }

  async onInit(msg) {
    this.selfId = msg.self;
    this.cfg = msg.cfg;
    this.roster = msg.roster || [];
    const map = new GameMap(msg.map);
    this.map = map;
    this.renderer.setMap(map, this.textures || (this.textures = new TextureFactory(state.meta?.fighters || [], {})), this.selfId);
    this.taskMap.setMap(map);
    this.taskMap.lang = state.user?.lang || 'fr';
    this.hud.show();
    this.controls.show();
    this.loading.remove();
    this.lastHp = null;
    audio.resume();
    audio.startAmbience();
    toast(`☣ ${t('play_solo')} — ${msg.map.name}`);
  }

  onSnap(snap) {
    this.snap = snap;
    //self
    const meRoster = this.roster.find(r => r.id === this.selfId);
    const selfData = { ...snap.me, fighter: meRoster?.fighter || 'rust', skin: meRoster?.skin || '', name: null };
    this.renderer.setSelfEntity(selfData);
    this.renderer.switchFloor(snap.me.floor);
    // entités
    const seen = new Set([this.selfId]);
    for (const p of snap.players) {
      seen.add(p.id);
      this.renderer.updateEntity(p.id, p, false);
    }
    for (const id of this.renderer.entities.keys()) {
      if (!seen.has(id)) this.renderer.removeEntity(id);
    }
    // projectiles
    const seenPj = new Set();
    for (const pj of snap.projectiles) { seenPj.add(pj.id); this.renderer.updateProjectile(pj.id, pj); }
    for (const id of [...this.renderer.projectiles.keys()]) {
      if (!seenPj.has(id)) this.renderer.removeProjectile(id);
    }
    // état
    this.renderer.radiationLevel = snap.rad;
    this.hud.updateSnap(snap, this.cfg, state.user?.lang || 'fr');
    this.controls.setSpecialCooldown(snap.me.specialCd);
    // dégâts subis → flash + son
    if (this.lastHp !== null && snap.me.hp < this.lastHp && snap.me.alive) {
      this.renderer.hurtFlash = 0.4;
      audio.play('hit');
    }
    this.lastHp = snap.me.hp;
    if (snap.rad !== this.lastRad) {
      if (snap.rad === 1) audio.play('alarm');
      if (snap.rad === 2) audio.play('alarm');
      if (snap.rad === 0 && this.lastRad > 0) audio.play('reward');
      this.lastRad = snap.rad;
    }
    // événements
    for (const ev of snap.events || []) this.onEvent(ev);
    // fog local
    this.fogTimer -= 1;
    if (this.fogTimer <= 0) {
      this.fogTimer = 12;
      const changed = this.map.updateFog(snap.me.floor, snap.me.x, snap.me.y, this.cfg.visionRadius || 9);
      if (changed) this.renderer.fogDirty = true;
    }
    // minimap
    this.minimapTimer -= 1;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 20;
      this.hud.drawMinimap(this.map, snap.me.floor, { x: snap.me.x, y: snap.me.y }, this.map.tasks, snap);
      this.taskMap.updateSnap(this.map, snap, { x: snap.me.x, y: snap.me.y, floor: snap.me.floor }, state.user?.lang || 'fr');
    }
    // envoi de l'input
    this.net.flushInput(performance.now());
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'kill': {
        this.renderer.spawnKillFx(ev.floor, ev.x, ev.y);
        const text = ev.killerName
          ? `${ev.killerName} ⚔ ${ev.victimName}`
          : `${ev.victimName} ☠`;
        this.hud.pushKill(text);
        audio.play('kill');
        break;
      }
      case 'attack': {
        this.renderer.spawnHitFx(ev.floor, ev.x, ev.y);
        audio.play('attack');
        break;
      }
      case 'task_done': {
        toast(`🔧 ${ev.name} — ${ev.progress}%`);
        audio.play('repair');
        break;
      }
      case 'radiation_warning':
        toast('⚠⚠ ' + t('radiation_in') + ` ${ev.inS}s`, 'error');
        audio.play('alarm');
        break;
      case 'radiation_start':
        toast('☢ ' + t('radiation_active'), 'error');
        break;
      case 'radiation_damage':
        toast('☢☢ ' + t('radiation_active'), 'error');
        break;
      case 'evac_open':
        toast('🚪 ' + t('evac_open'), 'rew');
        audio.play('alarm');
        break;
      case 'extract':
        if (ev.id === this.selfId) audio.play('victory');
        this.hud.pushKill(`🚪 ${ev.name} ✓`);
        break;
      case 'stairs':
        if (ev.id === this.selfId) audio.play('click');
        break;
      case 'reconnect':
        this.hud.pushKill(`🔌 ${ev.name} ${t('reconnected')}`);
        break;
      case 'emote':
        this.renderer.showEmote(ev.id, ev.text);
        break;
      case 'heal':
        audio.play('reward');
        break;
      default: break;
    }
  }

  cycleEmote() {
    // émotes possédées depuis l'inventaire
    if (!this.ownedEmotes.length) {
      this.ownedEmotes = (state.inventory?.items || []).filter(i => i.type === 'emote').map(i => i.id);
    }
    if (!this.ownedEmotes.length) { toast('💬 ' + t('none')); return; }
    const ids = this.ownedEmotes;
    const item = ids[this.emoteSeq % ids.length];
    this.emoteSeq++;
    const shopItem = state.meta?.shop?.find(s => s.id === item);
    const text = shopItem?.payload?.text || 'GG !';
    this.net.emote(text);
    audio.play('click');
  }

  onMatchEnd(msg) {
    if (this.ended) return;
    this.ended = true;
    audio.stopAmbience();
    const isWinner = msg.winners.includes(this.selfId);
    if (msg.winnerType === 'survival' || msg.winnerType === 'bunker') {
      audio.play(isWinner ? 'victory' : 'defeat');
    } else {
      audio.play('defeat');
    }
    const my = msg.results?.players?.find(p => p.id === this.selfId);
    const titleKey = msg.winnerType === 'survival' ? 'victory_survival'
      : msg.winnerType === 'bunker' ? 'victory_bunker' : 'draw_no_survivor';
    const overlay = h('div', { class: 'center-overlay' },
      h('div', { class: 'overlay-card' },
        h('h2', { style: { color: isWinner ? '#7fff6a' : '#ff5d5d' } }, t(titleKey)),
        h('div', { style: { fontSize: '15px', marginBottom: '10px' } },
          isWinner ? '🏆 ' + t('you_win') : (msg.winnerType === 'no_survivor' ? '' : t('you_lose'))),
        my ? h('div', { class: 'rewards-row' },
          h('div', { class: 'reward-chip' }, `+${my.xp} ${t('rew_xp')}`),
          h('div', { class: 'reward-chip' }, `+${my.coins} 🔩`),
          h('div', { class: 'reward-chip' }, `${my.trophies >= 0 ? '+' : ''}${my.trophies} 🏆`)
        ) : null,
        this.buildResultsTable(msg.results),
        h('div', { class: 'row', style: { marginTop: '14px', justifyContent: 'center' } },
          h('button', { class: 'btn primary large', onclick: () => this.exit() }, t('back_lobby'))
        )
      )
    );
    this.root.append(overlay);
    refreshUser();
  }

  buildResultsTable(results) {
    if (!results?.players) return h('div');
    const rows = results.players
      .slice()
      .sort((a, b) => (b.won - a.won) || (b.kills - a.kills) || (b.tasksDone - a.tasksDone));
    const tbl = h('table', { class: 'results-table tbl' },
      h('thead', {}, h('tr', {},
        h('th', {}, '#'), h('th', {}, t('player_profile')), h('th', {}, t('kills')),
        h('th', {}, t('tasks_label')), h('th', {}, 'DPS'), h('th', {}, t('rew_xp'))
      )),
      h('tbody', {}, rows.map((p, i) => h('tr', {},
        h('td', { class: p.won ? 'lb-top3' : '' }, p.won ? '🏆' : i + 1),
        h('td', {}, p.uname + (p.kind === 'bot' ? ' 🤖' : '')),
        h('td', {}, String(p.kills)),
        h('td', {}, String(p.tasksDone)),
        h('td', {}, String(p.damage)),
        h('td', {}, String(p.xp))
      )))
    );
    return h('div', { class: 'tbl-wrap' }, tbl);
  }

  /** Détruit la scène : réseau, audio, canvas Pixi (contexte WebGL libéré). */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ended = true;
    this.net.leaveMatch();
    this.net.off('message');
    audio.stopAmbience();
    this.controls?.destroy?.();
    this.renderer?.destroy(); // retire aussi le listener resize (évite "renderer is null")
    this.renderer = null;
    this.root.remove();
  }

  exit() {
    this.destroy();
    this.onExit?.();
  }
}
