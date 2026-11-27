// src/rendering/Renderer.js — Rendu isométrique PixiJS : tuiles, murs triés en
// profondeur (occlusion), entités interpolées, projectiles, brouillard de guerre
// (visible/exploré/inconnu), lumière du joueur, teinte d'intoxication, caméra fluide.
import { TILE_W, TILE_H, WALL_H, CHAR_W, CHAR_H } from './TextureFactory.js';

const VISION_R = 9;

export function isoX(x, y) { return (x - y) * (TILE_W / 2); }
export function isoY(x, y) { return (x + y) * (TILE_H / 2); }

export class Renderer {
  constructor() {
    this.app = null;
    this.map = null;
    this.textures = null;
    this.selfId = null;
    this.floorContainers = new Map();
    this.currentFloor = 0;
    this.entities = new Map();     // id -> {sprite, targetX, targetY, x, y, dir, sheet, hpBar, name}
    this.projectiles = new Map();  // id -> sprite
    this.effects = [];             // effets temporaires {sprite, life, update}
    this.camera = { x: 0, y: 0, zoom: 1.1, targetX: 0, targetY: 0 };
    this.fogDirty = true;
    this.radiationLevel = 0;       // 0 aucun, 1 alerte, 2 dégâts
    this.hurtFlash = 0;
    this.onFloorSwitch = null;
    this.darknessColor = 0x020403;
  }

  async init(container) {
    if (this.app) return;
    this.app = new PIXI.Application();
    await this.app.init({
      background: 0x050705,
      resizeTo: container,
      antialias: false,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true
    });
    container.innerHTML = '';
    container.appendChild(this.app.canvas);
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);
    this.fxLayer = new PIXI.Container();
    this.app.stage.addChild(this.fxLayer);
    this.radiationOverlay = new PIXI.Graphics();
    this.app.stage.addChild(this.radiationOverlay);
    this.hurtOverlay = new PIXI.Graphics();
    this.app.stage.addChild(this.hurtOverlay);
    this.fadeOverlay = new PIXI.Graphics();
    this.app.stage.addChild(this.fadeOverlay);
    this.fadeAlpha = 0;
    this.app.ticker.add(() => this.tick(this.app.ticker.deltaMS / 1000));

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (this.app) this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }

  /* ---------------- construction de la map ---------------- */

  setMap(map, textures, selfId) {
    this.map = map;
    this.textures = textures;
    this.selfId = selfId;
    this.world.removeChildren();
    this.floorContainers.clear();
    this.entities.clear();
    this.projectiles.clear();
    this.currentFloor = 0;
    this.fogDirty = true;

    map.floors.forEach((_f, fi) => {
      const root = new PIXI.Container();
      // 1) sols (statiques)
      const floorLayer = new PIXI.Container();
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const ch = map.tile(fi, x, y);
          if (ch === ' ' || ch === '#' || ch === undefined) continue;
          const tex = this.textures.floors[ch] || this.textures.floors['.'];
          const s = new PIXI.Sprite(tex);
          s.anchor.set(0.5, 0.5);
          s.x = isoX(x + 0.5, y + 0.5);
          s.y = isoY(x + 0.5, y + 0.5);
          floorLayer.addChild(s);
        }
      }
      // 2) conteneur trié : murs + machines + escaliers + entités
      const ysort = new PIXI.Container();
      ysort.sortableChildren = true;
      // murs
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const ch = map.tile(fi, x, y);
          if (ch === '#') {
            const variant = ((x * 7 + y * 13) % 3);
            const s = new PIXI.Sprite(this.textures.walls[variant]);
            s.anchor.set(0.5, 1 - (WALL_H + 16) / (WALL_H + TILE_H));
            s.x = isoX(x + 0.5, y + 0.5);
            s.y = isoY(x + 0.5, y + 0.5);
            s.zIndex = isoY(x + 0.5, y + 0.5);
            s.__tile = `${x},${y}`;
            s.__kind = 'wall';
            ysort.addChild(s);
          } else if (ch === 'u') { // escalier (jamais utilisé en char, réservé)
          }
        }
      }
      // escaliers
      for (const st of map.stairs) {
        if (st.floor !== fi) continue;
        const s = new PIXI.Sprite(st.dir === 'up' ? this.textures.stairsUp : this.textures.stairsDown);
        s.anchor.set(0.5, 1 - (WALL_H + 16) / (WALL_H + TILE_H));
        s.x = isoX(st.x + 0.5, st.y + 0.5);
        s.y = isoY(st.x + 0.5, st.y + 0.5);
        s.zIndex = isoY(st.x + 0.5, st.y + 0.5) + 0.1;
        ysort.addChild(s);
      }
      // machines des tâches
      for (const task of map.tasks) {
        if (task.floor !== fi) continue;
        const tex = this.textures.tasks[task.type] || this.textures.tasks.reactor;
        const s = new PIXI.Sprite(tex);
        s.anchor.set(0.5, (84 - 10) / 84);
        s.x = isoX(task.x + 0.5, task.y + 0.5);
        s.y = isoY(task.x + 0.5, task.y + 0.5);
        s.zIndex = isoY(task.x + 0.5, task.y + 0.5) + 0.05;
        ysort.addChild(s);
        task.__sprite = s;
      }
      // 3) brouillard de guerre
      const fog = new PIXI.Graphics();
      root.addChild(floorLayer, ysort, fog);
      root.__ysort = ysort;
      root.__fog = fog;
      root.visible = fi === 0;
      this.world.addChild(root);
      this.floorContainers.set(fi, root);
    });

    // calque lumière du joueur
    this.lightSprite = new PIXI.Sprite(this.textures.light);
    this.lightSprite.anchor.set(0.5, 0.5);
    this.lightSprite.scale.set(2.2);
    this.fxLayer.addChild(this.lightSprite);
    this.resize();
  }

  /* ---------------- entités ---------------- */

  ensureEntity(id, name, fighterId, skinId) {
    if (this.entities.has(id)) return this.entities.get(id);
    const sheet = this.textures.sheetFor(fighterId, skinId);
    const sprite = new PIXI.Sprite(this.textures.frame(sheet, 0, 0));
    sprite.anchor.set(0.5, (CHAR_H - 4) / CHAR_H);
    const ysort = this.floorContainers.get(0)?.__ysort;
    ysort.addChild(sprite);
    // barre de vie
    const hpBar = new PIXI.Graphics();
    hpBar.visible = false;
    ysort.addChild(hpBar);
    // nom
    let nameTag = null;
    if (name) {
      nameTag = new PIXI.Text({ text: name, style: new PIXI.TextStyle({
        fontFamily: 'Segoe UI, sans-serif', fontSize: 10, fontWeight: '700',
        fill: 0xd7e4d4, stroke: { color: 0x000000, width: 3 }
      }) });
      nameTag.anchor.set(0.5, 1);
      ysort.addChild(nameTag);
    }
    // emote
    const emoteTag = new PIXI.Text({ text: '', style: new PIXI.TextStyle({
      fontFamily: 'Segoe UI, sans-serif', fontSize: 12, fontWeight: '700', fill: 0xffd97a,
      stroke: { color: 0x000000, width: 3 }
    }) });
    emoteTag.anchor.set(0.5, 1);
    emoteTag.visible = false;
    ysort.addChild(emoteTag);
    // barre de réparation
    const repairBar = new PIXI.Graphics();
    repairBar.visible = false;
    ysort.addChild(repairBar);
    const ent = { sprite, hpBar, nameTag, emoteTag, repairBar, sheet, x: 0, y: 0, targetX: 0, targetY: 0, dir: 0, animT: 0, row: 0, floor: 0, name };
    this.entities.set(id, ent);
    return ent;
  }

  updateEntity(id, d, isSelf) {
    const ent = this.ensureEntity(id, d.name, d.fighter, d.skin);
    ent.targetX = d.x; ent.targetY = d.y; ent.dir = d.dir; ent.floor = d.floor;
    ent.hpRatio = d.hp !== undefined ? d.hp / 100 : ent.hpRatio;
    ent.cloak = d.cloak; ent.shield = d.shield; ent.moving = d.moving;
    ent.repairing = isSelf ? d.repairing : false;
    if (isSelf) ent.repairingFromSnap = d.repairing;
    // teleport si loin (changement d'étage / spawn)
    if (Math.hypot(ent.targetX - ent.x, ent.targetY - ent.y) > 3.5) {
      ent.x = ent.targetX; ent.y = ent.targetY;
    }
    if (ent.sprite.parent !== this.floorContainers.get(d.floor)?.__ysort) {
      const target = this.floorContainers.get(d.floor)?.__ysort;
      if (target) {
        target.addChild(ent.sprite, ent.hpBar);
        if (ent.nameTag) target.addChild(ent.nameTag);
        if (ent.emoteTag) target.addChild(ent.emoteTag);
        target.addChild(ent.repairBar);
      }
    }
    // visibilité selon le fog (les cachés cloackés sont déjà filtrés par le serveur)
    const fog = this.map.fogState(d.floor, Math.floor(d.x), Math.floor(d.y));
    ent.sprite.visible = fog === 2 || isSelf;
  }

  setSelfEntity(d) {
    this.updateEntity(this.selfId, { ...d, name: null, fighter: d.fighter, skin: d.skin }, true);
  }

  removeEntity(id) {
    const ent = this.entities.get(id);
    if (!ent) return;
    ent.sprite.destroy();
    ent.hpBar.destroy();
    ent.nameTag?.destroy();
    ent.emoteTag?.destroy();
    ent.repairBar.destroy();
    this.entities.delete(id);
  }

  showEmote(id, text) {
    const ent = this.entities.get(id);
    if (!ent) return;
    ent.emoteTag.text = text.slice(0, 24);
    ent.emoteTag.visible = true;
    ent.emoteUntil = performance.now() + 2600;
  }

  spawnKillFx(floor, x, y) {
    const s = new PIXI.Sprite(this.textures.glowRed);
    s.anchor.set(0.5, 0.5);
    s.x = isoX(x, y); s.y = isoY(x, y) - 10;
    s.scale.set(1.2);
    const container = this.floorContainers.get(floor);
    if (!container) return;
    container.__ysort.addChild(s);
    this.effects.push({ sprite: s, life: 0.7, update(dt, self) {
      self.life -= dt;
      s.alpha = Math.max(0, self.life / 0.7);
      s.scale.set(1.2 + (0.7 - self.life) * 2);
    } });
  }

  spawnHitFx(floor, x, y) {
    const s = new PIXI.Sprite(this.textures.glowAmber);
    s.anchor.set(0.5, 0.5);
    s.x = isoX(x, y); s.y = isoY(x, y) - 8;
    const container = this.floorContainers.get(floor);
    if (!container) return;
    container.__ysort.addChild(s);
    this.effects.push({ sprite: s, life: 0.25, update(dt, self) {
      self.life -= dt;
      s.alpha = Math.max(0, self.life / 0.25);
    } });
  }

  updateProjectile(id, d) {
    let s = this.projectiles.get(id);
    if (!s) {
      s = new PIXI.Sprite(this.textures.projectileGreen);
      s.anchor.set(0.5, 0.5);
      this.fxLayer.addChild(s);
      this.projectiles.set(id, s);
    }
    s.x = isoX(d.x, d.y);
    s.y = isoY(d.x, d.y) - 14;
    s.visible = d.floor === this.currentFloor;
  }

  removeProjectile(id) {
    const s = this.projectiles.get(id);
    if (s) { s.destroy(); this.projectiles.delete(id); }
  }

  /* ---------------- étages ---------------- */

  switchFloor(floor) {
    if (floor === this.currentFloor || !this.floorContainers.has(floor)) return;
    this.currentFloor = floor;
    for (const [fi, container] of this.floorContainers) {
      container.visible = fi === floor;
    }
    this.fogDirty = true;
    this.fadeAlpha = 0.85;
    this.onFloorSwitch?.(floor);
  }

  /* ---------------- brouillard ---------------- */

  redrawFog() {
    const container = this.floorContainers.get(this.currentFloor);
    if (!container) return;
    const fog = container.__fog;
    const map = this.map;
    fog.clear();
    const T = 1;
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const state = map.fogState(this.currentFloor, x, y);
        if (state === 2) continue;
        const cx = isoX(x + 0.5, y + 0.5);
        const cy = isoY(x + 0.5, y + 0.5);
        fog.moveTo(cx, cy - TILE_H / 2 * T);
        fog.lineTo(cx + TILE_W / 2 * T, cy);
        fog.lineTo(cx, cy + TILE_H / 2 * T);
        fog.lineTo(cx - TILE_W / 2 * T, cy);
        fog.closePath();
        fog.fill({ color: 0x020403, alpha: state === 1 ? 0.62 : 0.97 });
      }
    }
    this.fogDirty = false;
  }

  /* ---------------- boucle ---------------- */

  tick(dt) {
    if (!this.map) return;
    const self = this.entities.get(this.selfId);
    // caméra : suit le joueur
    if (self) {
      const tx = isoX(self.x, self.y);
      const ty = isoY(self.x, self.y) - 40;
      this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 8);
      this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 8);
    }
    const zoom = this.camera.zoom;
    this.world.scale.set(zoom);
    this.world.x = this.app.screen.width / 2 - this.camera.x * zoom;
    this.world.y = this.app.screen.height / 2 - this.camera.y * zoom;

    // interpolation des entités
    for (const [id, ent] of this.entities) {
      ent.x += (ent.targetX - ent.x) * Math.min(1, dt * 12);
      ent.y += (ent.targetY - ent.y) * Math.min(1, dt * 12);
      ent.sprite.x = isoX(ent.x, ent.y);
      ent.sprite.y = isoY(ent.x, ent.y);
      ent.sprite.zIndex = isoY(ent.x, ent.y) + 0.4;
      // animation
      ent.animT += dt;
      const speed = ent.moving ? 7 : 2.4;
      ent.row = Math.floor(ent.animT * speed) % 2;
      if (!ent.moving && ent.row === 1) ent.row = 0;
      ent.sprite.texture = this.textures.frame(ent.sheet, ent.dir, ent.row);
      // effets d'état
      if (ent.cloak && id !== this.selfId) ent.sprite.alpha = 0.25;
      else if (ent.cloak) ent.sprite.alpha = 0.55;
      else ent.sprite.alpha = 1;
      // barre de vie (au-dessus)
      ent.hpBar.visible = ent.hpRatio !== undefined && ent.hpRatio < 1 && id !== this.selfId;
      if (ent.hpBar.visible) {
        ent.hpBar.clear();
        const bx = isoX(ent.x, ent.y) - 16, by = isoY(ent.x, ent.y) - 44;
        ent.hpBar.rect(bx, by, 32, 4).fill({ color: 0x0d130f, alpha: 0.9 });
        ent.hpBar.rect(bx, by, 32 * Math.max(0, ent.hpRatio), 4).fill({ color: ent.hpRatio > 0.35 ? 0x7fbf4f : 0xff5d5d });
        ent.hpBar.zIndex = isoY(ent.x, ent.y) + 0.45;
        ent.hpBar.x = 0; ent.hpBar.y = 0;
      }
      if (ent.nameTag) {
        ent.nameTag.x = isoX(ent.x, ent.y);
        ent.nameTag.y = isoY(ent.x, ent.y) - 48;
        ent.nameTag.zIndex = isoY(ent.x, ent.y) + 0.46;
        ent.nameTag.visible = ent.sprite.visible;
      }
      if (ent.emoteTag) {
        if (ent.emoteUntil && performance.now() > ent.emoteUntil) { ent.emoteTag.visible = false; ent.emoteUntil = 0; }
        if (ent.emoteTag.visible) {
          ent.emoteTag.x = isoX(ent.x, ent.y);
          ent.emoteTag.y = isoY(ent.x, ent.y) - 62;
          ent.emoteTag.zIndex = isoY(ent.x, ent.y) + 0.47;
        }
      }
      // barre de réparation
      if (ent.repairing) {
        ent.repairBar.visible = true;
        ent.repairBar.clear();
        const bx = isoX(ent.x, ent.y), by = isoY(ent.x, ent.y) - 38;
        const w = 34, p = (Math.sin(performance.now() / 120) + 1) / 2;
        ent.repairBar.rect(bx - w / 2, by, w, 5).fill({ color: 0x0d130f, alpha: 0.9 });
        ent.repairBar.rect(bx - w / 2, by, w * p, 5).fill({ color: 0xffd97a });
        ent.repairBar.zIndex = isoY(ent.x, ent.y) + 0.45;
      } else {
        ent.repairBar.visible = false;
      }
    }

    // bouclier visuel
    for (const [id, ent] of this.entities) {
      if (ent.shield && !ent.__shieldSprite) {
        const s = new PIXI.Sprite(this.textures.glowCyan || this.textures.glowGreen);
        s.anchor.set(0.5, 0.5);
        s.alpha = 0.5;
        ent.sprite.parent?.addChild(s);
        ent.__shieldSprite = s;
      }
      if (ent.__shieldSprite) {
        if (!ent.shield) { ent.__shieldSprite.destroy(); ent.__shieldSprite = null; }
        else {
          ent.__shieldSprite.x = ent.sprite.x;
          ent.__shieldSprite.y = ent.sprite.y - 14;
          ent.__shieldSprite.zIndex = ent.sprite.zIndex + 0.02;
          ent.__shieldSprite.alpha = 0.3 + Math.sin(performance.now() / 180) * 0.12;
        }
      }
    }

    // culling des murs (hors écran → invisibles)
    const w = this.app.screen.width / zoom, h = this.app.screen.height / zoom;
    const viewL = this.camera.x - w / 2 - 80, viewR = this.camera.x + w / 2 + 80;
    const viewT = this.camera.y - h / 2 - 120, viewB = this.camera.y + h / 2 + 120;
    for (const child of this.floorContainers.get(this.currentFloor).__ysort.children) {
      if (child.__kind === 'wall') {
        child.visible = child.x > viewL && child.x < viewR && child.y > viewT && child.y < viewB;
      }
    }

    // lumière du joueur + ambiances
    if (self) {
      this.lightSprite.x = isoX(self.x, self.y);
      this.lightSprite.y = isoY(self.x, self.y) - 30;
      this.lightSprite.visible = true;
    }

    // teinte d'intoxication (vert croissant) + pulsation d'alarme
    this.radiationOverlay.clear();
    if (this.radiationLevel > 0) {
      const pulse = 0.5 + Math.sin(performance.now() / 300) * 0.5;
      const alpha = this.radiationLevel === 2 ? 0.16 + pulse * 0.06 : 0.08 + pulse * 0.03;
      this.radiationOverlay.rect(0, 0, this.app.screen.width, this.app.screen.height)
        .fill({ color: 0x1f4a12, alpha });
    }
    if (this.hurtFlash > 0) {
      this.hurtFlash -= dt;
      this.hurtOverlay.clear();
      this.hurtOverlay.rect(0, 0, this.app.screen.width, this.app.screen.height)
        .fill({ color: 0xff2020, alpha: Math.min(0.35, this.hurtFlash * 2) });
    } else if (this.hurtOverlay) this.hurtOverlay.clear();

    // fondu de changement d'étage
    if (this.fadeAlpha > 0) {
      this.fadeAlpha = Math.max(0, this.fadeAlpha - dt * 2.2);
      this.fadeOverlay.clear();
      this.fadeOverlay.rect(0, 0, this.app.screen.width, this.app.screen.height)
        .fill({ color: 0x000000, alpha: this.fadeAlpha });
    } else this.fadeOverlay.clear();

    // effets temporaires
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.update(dt, fx);
      if (fx.life <= 0) {
        fx.sprite.destroy();
        this.effects.splice(i, 1);
      }
    }

    if (this.fogDirty) this.redrawFog();
  }
}
