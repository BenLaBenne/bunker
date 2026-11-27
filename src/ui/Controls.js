// src/ui/Controls.js — Commandes : joystick tactile (mobile paysage) + clavier
// configurable (desktop). Boutons d'action contextuels.
import { h } from './dom.js';
import { t } from './i18n.js';
import { state, isBound } from './state.js';

export class Controls {
  constructor(root, net) {
    this.net = net;
    this.root = h('div', { class: 'controls-layer' });
    root.append(this.root);
    this.move = { mx: 0, my: 0 };
    this.attackHeld = false;
    this.interactHeld = false;
    this.aim = { x: 0, y: 1 };
    this.joystickId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.build();
    this.bindKeyboard();
  }

  build() {
    // Joystick : zone invisible à gauche
    this.joyZone = h('div', { class: 'joystick-zone' });
    this.joyBase = h('div', { class: 'joystick-base' });
    this.joyKnob = h('div', { class: 'joystick-knob' });
    this.joyZone.append(this.joyBase, this.joyKnob);

    const startJoy = (e) => {
      const touch = e.changedTouches ? e.changedTouches[0] : e;
      this.joystickId = touch.identifier ?? 'mouse';
      this.joyOrigin = { x: touch.clientX, y: touch.clientY };
      this.joyZone.classList.add('active');
      this.positionJoy(this.joyBase, this.joyOrigin.x - 55, this.joyOrigin.y - 55);
      this.positionJoy(this.joyKnob, this.joyOrigin.x - 26, this.joyOrigin.y - 26);
      e.preventDefault();
    };
    const moveJoy = (e) => {
      if (this.joystickId === null) return;
      for (const touch of (e.changedTouches || [e])) {
        if ((touch.identifier ?? 'mouse') !== this.joystickId) continue;
        const dx = touch.clientX - this.joyOrigin.x;
        const dy = touch.clientY - this.joyOrigin.y;
        const d = Math.hypot(dx, dy);
        const max = 52;
        const nx = d > max ? dx / d * max : dx;
        const ny = d > max ? dy / d * max : dy;
        this.positionJoy(this.joyKnob, this.joyOrigin.x + nx - 26, this.joyOrigin.y + ny - 26);
        const len = Math.hypot(nx, ny);
        if (len > 8) {
          this.move.mx = nx / max;
          this.move.my = ny / max;
          this.aim.x = nx / (len || 1); this.aim.y = ny / (len || 1);
        } else {
          this.move.mx = 0; this.move.my = 0;
        }
        this.push();
        e.preventDefault();
      }
    };
    const endJoy = (e) => {
      if (this.joystickId === null) return;
      this.joystickId = null;
      this.joyZone.classList.remove('active');
      this.move.mx = 0; this.move.my = 0;
      this.push();
    };
    this.joyZone.addEventListener('touchstart', startJoy, { passive: false });
    this.joyZone.addEventListener('touchmove', moveJoy, { passive: false });
    this.joyZone.addEventListener('touchend', endJoy);
    this.joyZone.addEventListener('touchcancel', endJoy);
    this.joyZone.addEventListener('mousedown', startJoy);
    window.addEventListener('mousemove', moveJoy);
    window.addEventListener('mouseup', endJoy);

    // Boutons d'action à droite
    this.pad = h('div', { class: 'action-pad' });
    const mkBtn = (label, cls, onPress, onRelease) => {
      const btn = h('button', { class: `abtn ${cls}` }, label);
      const down = (e) => { btn.classList.add('pressed'); onPress?.(); e.preventDefault(); };
      const up = () => { btn.classList.remove('pressed'); onRelease?.(); };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up);
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
      return btn;
    };
    this.specialBtn = mkBtn('⚡', '', () => this.net.special());
    this.interactBtn = mkBtn('🔧', '', () => {
      this.interactHeld = true; this.push();
    }, () => {
      this.interactHeld = false; this.push();
    });
    this.attackBtn = mkBtn('⚔', 'big', () => {
      this.attackHeld = true; this.push();
    }, () => {
      this.attackHeld = false; this.push();
    });
    this.mapBtn = mkBtn('🗺', '', () => this.onMapToggle?.());
    // grille : special | interact / map | attack
    this.pad.append(this.specialBtn, this.interactBtn, this.mapBtn, this.attackBtn);

    // Astuce desktop
    this.hint = h('div', { class: 'desktop-hint' },
      'ZQSD/WASD déplacer · Espace attaquer · E interagir · F compétence · M carte'
    );

    this.root.append(this.joyZone, this.pad, this.hint);
  }

  positionJoy(el, x, y) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  push() {
    this.net.setInput({
      mx: this.move.mx, my: this.move.my,
      attack: this.attackHeld,
      interact: this.interactHeld,
      aimX: this.aim.x, aimY: this.aim.y
    });
  }

  bindKeyboard() {
    this.keysDown = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      this.keysDown.add(code);
      if (isBound('attack', code)) { this.attackHeld = true; this.push(); e.preventDefault(); }
      if (isBound('interact', code)) { this.interactHeld = true; this.push(); }
      if (isBound('special', code)) this.net.special();
      if (isBound('map', code)) { e.preventDefault(); this.onMapToggle?.(); }
      if (isBound('emote', code)) this.onEmote?.();
      this.applyKeys();
    });
    window.addEventListener('keyup', (e) => {
      const code = e.code;
      this.keysDown.delete(code);
      if (isBound('attack', code)) { this.attackHeld = false; this.push(); }
      if (isBound('interact', code)) { this.interactHeld = false; this.push(); }
      this.applyKeys();
    });
    // Visée souris (desktop) : la direction du curseur définit l'axe de tir
    window.addEventListener('mousemove', (e) => {
      if (this.joystickId !== null) return;
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      if (len > 24) {
        this.aim.x = dx / len; this.aim.y = dy / len;
        if (!this.move.mx && !this.move.my) this.push();
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input, select, textarea, .sidenav, .content, .modal')) return;
      this.attackHeld = true; this.push();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.target.closest('button, input, select, textarea, .sidenav, .content, .modal')) return;
      this.attackHeld = false; this.push();
    });
  }

  applyKeys() {
    let mx = 0, my = 0;
    if (this.keysDownIntersection(['KeyW', 'KeyZ', 'ArrowUp']) || this.keysDownHas('up')) my -= 1;
    if (this.keysDownIntersection(['KeyS', 'ArrowDown']) || this.keysDownHas('down')) my += 1;
    if (this.keysDownIntersection(['KeyA', 'KeyQ', 'ArrowLeft']) || this.keysDownHas('left')) mx -= 1;
    if (this.keysDownIntersection(['KeyD', 'ArrowRight']) || this.keysDownHas('right')) mx += 1;
    const len = Math.hypot(mx, my) || 1;
    this.move.mx = mx / len; this.move.my = my / len;
    this.push();
  }

  keysDownHas(action) {
    return (state.keybinds[action] || []).some(code => this.keysDown.has(code));
  }
  keysDownIntersection(codes) {
    return codes.some(code => this.keysDown.has(code));
  }

  setSpecialCooldown(remain) {
    let overlay = this.specialBtn.querySelector('.cd-overlay');
    if (remain > 0) {
      if (!overlay) {
        overlay = h('div', { class: 'cd-overlay' });
        this.specialBtn.append(overlay);
      }
      overlay.textContent = Math.ceil(remain);
    } else if (overlay) overlay.remove();
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  destroy() {
    this.root.remove();
  }
}
