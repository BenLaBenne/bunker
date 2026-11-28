// src/ui/HUD.js — Interface de jeu : vie, armure, temps, progression, intox,
// vivants, mini-carte, kill feed. 100% DOM (lisibilité mobile).
import { h, clear } from './dom.js';
import { t } from './i18n.js';

export class HUD {
  constructor(root, callbacks) {
    this.root = h('div', { class: 'hud hidden' });
    root.append(this.root);
    this.cb = callbacks;
    this.build();
    this.minimapCtx = null;
    this.lastHurt = 0;
  }

  build() {
    const self = this;
    // ---- gauche : vie / armure / statuts
    this.hudLeft = h('div', { class: 'hud-left' },
      h('div', { class: 'hud-bars' },
        h('div', { class: 'bar hp' }, h('div', { class: 'fill', id: 'hp-fill' }), h('div', { class: 'bar-label' }, 'HP')),
        h('div', { class: 'bar armor' }, h('div', { class: 'fill', id: 'armor-fill' }), h('div', { class: 'bar-label' }, '☢ ARMURE'))
      ),
      this.status = h('div', { class: 'hud-status', id: 'hud-status' }, '')
    );
    // ---- haut : timer + progression + vivants
    this.hudTop = h('div', { class: 'hud-top' },
      this.timer = h('div', { class: 'timer', id: 'hud-timer' }, '--:--'),
      h('div', { class: 'col' },
        h('div', { class: 'hud-progress-label' }, 'BUNKER'),
        h('div', { class: 'progressbar' }, this.progressFill = h('div'))
      ),
      h('div', { class: 'alive-chip' }, '👤 ', this.alive = h('span'), ` ${t('alive')}`)
    );
    // ---- droite : mini-carte
    this.minimapWrap = h('div', { class: 'hud-minimap' });
    this.minimapCanvas = h('canvas', { width: 140, height: 100 });
    this.minimapWrap.append(this.minimapCanvas);
    this.minimapWrap.addEventListener('click', () => self.cb.onMinimapClick?.());
    // ---- kill feed
    this.killfeed = h('div', { class: 'killfeed' });
    // ---- overlay mort
    this.deadOverlay = h('div', { class: 'center-overlay hidden' },
      h('div', { class: 'overlay-card', style: { textAlign: 'center' } },
        h('h2', { style: { color: '#ff5d5d' } }, t('you_died')),
        h('div', { class: 'muted' }, t('spectate'))
      )
    );
    this.root.append(this.hudLeft, this.hudTop, this.minimapWrap, this.killfeed, this.deadOverlay);
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  updateSelf(me) {
    document.getElementById('hp-fill').style.width = `${Math.max(0, me.hp / me.maxHp * 100)}%`;
    document.getElementById('armor-fill').style.width = `${Math.max(0, me.armor)}%`;
    if (!me.alive) {
      this.deadOverlay.classList.remove('hidden');
    } else {
      this.deadOverlay.classList.add('hidden');
    }
    if (me.extracted) {
      this.status.textContent = '✓ ' + t('extracted');
      this.status.className = 'hud-status evac';
    } else if (me.extracting > 0) {
      this.status.textContent = `⏫ ${t('extracting')} ${me.extracting.toFixed(1)}s`;
      this.status.className = 'hud-status evac';
    } else {
      this.status.textContent = '';
    }
  }

  updateSnap(snap, cfg, lang) {
    const me = snap.me;
    this.updateSelf(me);
    this.alive.textContent = snap.alive;
    this.progressFill.style.width = `${snap.progress}%`;
    // timer selon la phase
    const timer = this.timer;
    timer.classList.remove('danger');
    if (snap.evac) {
      const remain = Math.max(0, snap.evac.remain);
      timer.textContent = `⏫ ${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
      timer.classList.add('danger');
    } else if (snap.rad > 0) {
      timer.textContent = '☢☢☢';
      timer.classList.add('danger');
    } else {
      const left = Math.max(0, Math.floor(cfg.repairTimeS - snap.clock));
      timer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      if (left <= 30) timer.classList.add('danger');
    }
    // statut d'intoxication
    if (snap.rad === 2) {
      this.status.textContent = '☢ ' + t('radiation_active');
      this.status.className = 'hud-status rad-danger';
    } else if (snap.rad === 1) {
      this.status.textContent = '⚠ ' + t('radiation_active');
      this.status.className = 'hud-status rad-warn';
    } else if (snap.evac) {
      this.status.textContent = '🚪 ' + t('evac_open');
      this.status.className = 'hud-status evac';
    }
  }

  pushKill(text) {
    const el = h('div', { class: 'kf' }, text);
    this.killfeed.append(el);
    setTimeout(() => el.remove(), 5200);
    while (this.killfeed.children.length > 5) this.killfeed.firstChild.remove();
  }

  /** Mini-carte : tuiles explorées de l'étage courant. */
  drawMinimap(map, floor, selfPos, tasks, snap) {
    const ctx = this.minimapCtx || (this.minimapCtx = this.minimapCanvas.getContext('2d'));
    const w = this.minimapCanvas.width, hgt = this.minimapCanvas.height;
    const sx = w / map.w, sy = hgt / map.h;
    ctx.fillStyle = '#140e0a';
    ctx.fillRect(0, 0, w, hgt);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const state = map.fogState(floor, x, y);
        if (state === 0) continue;
        const ch = map.tile(floor, x, y);
        let color = '#a87848';
        if (ch === '#') color = '#8a3f2b';
        else if (ch === 'h') color = '#5a5030';
        else if (ch === 'e') color = '#2c6a36';
        else if (ch === 'g') color = '#b98f3c';
        else if (ch === 'p') color = '#8a6a4a';
        else if (ch === 'd') color = '#5a666e';
        if (state === 1) color = shadeHex(color, -38);
        ctx.fillStyle = color;
        ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    // tâches connues et non terminées
    for (const task of tasks) {
      if (task.floor !== floor || task.done) continue;
      ctx.fillStyle = snap?.progress != null && task.progress > 0 ? '#ffd97a' : '#ff5d5d';
      ctx.fillRect(task.x * sx - 1, task.y * sy - 1, 4, 4);
    }
    // joueur
    if (selfPos) {
      ctx.fillStyle = '#7fff6a';
      ctx.fillRect(selfPos.x * sx - 2, selfPos.y * sy - 2, 5, 5);
    }
  }
}

function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
