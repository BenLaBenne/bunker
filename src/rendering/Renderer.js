// src/rendering/Renderer.js — Rendu TOP-DOWN carré (vue de dessus, style Brawl
// Stars) : tuiles carrées, rochers plats, entités circulaires avec anneau
// d'équipe, nom + barre de vie au-dessus, projectiles, brouillard de guerre
// (visible/exploré/inconnu), teinte d'intoxication, caméra fluide.
// Cycle de vie robuste : resize gardé, destroy() propre, perte de contexte
// WebGL gérée (preventDefault → restauration sans crash).
import { TILE, CHAR_W, CHAR_H } from './TextureFactory.js';
import { state } from '../ui/state.js';

/** Coordonnée monde (unités tuiles, flottant) → pixel monde. */
export function topX(x) { return x * TILE; }
export function tileCx(x) { return x * TILE + TILE / 2; }

const ENT_SCALE = 1.5; // sprite 32px → ~48px, proche de la taille d'une tuile

export class Renderer {
  constructor() {
    this.app = null;
    this.map = null;
    this.textures = null;
    this.selfId = null;
    this.floorContainers = new Map();
    this.currentFloor = 0;
    this.entities = new Map();     // id -> {ring, shadow, sprite, hpBar, hpText, ...}
    this.projectiles = new Map();  // id -> sprite
    this.effects = [];             // effets temporaires {sprite, life, update}
    this.camera = { x: 0, y: 0, zoom: 1.25 };
    this.fogDirty = true;
    this.radiationLevel = 0;       // 0 aucun, 1 alerte, 2 dégâts
    this.hurtFlash = 0;
    this.onFloorSwitch = null;
    this.ctxLost = false;
    this.__onResize = null;
  }

  async init(container) {
    if (this.app) return;
    this.app = new PIXI.Application();
    await this.app.init({
      background: 0x140e0a,
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

    // resize : listener nommé (retiré dans destroy) + garde-fou anti-null
    this.__onResize = () => this.resize();
    window.addEventListener('resize', this.__onResize);

    // perte de contexte WebGL : preventDefault = le navigateur peut restaurer
    // le contexte au lieu de tuer le canvas (crash "app.renderer is null").
    this.app.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ctxLost = true;
    }, false);
    this.app.canvas.addEventListener('webglcontextrestored', () => {
      this.ctxLost = false;
    }, false);
  }

  resize() {
    if (this.app && this.app.renderer) this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }

  /** Détruit proprement le canvas et tous les listeners (appelé en sortie de partie). */
  destroy() {
    if (this.__onResize) {
      window.removeEventListener('resize', this.__onResize);
      this.__onResize = null;
    }
    if (this.app) {
      try { this.app.destroy(true, { children: true }); } catch { /* déjà détruit */ }
      this.app = null;
    }
    this.entities.clear();
    this.projectiles.clear();
    this.effects.length = 0;
    this.floorContainers.clear();
    this.map = null;
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
      // 1) sols (statiques, tuiles carrées)
      const floorLayer = new PIXI.Container();
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const ch = map.tile(fi, x, y);
          if (ch === ' ' || ch === '#' || ch === undefined) continue;
          const tex = this.textures.floors[ch] || this.textures.floors['.'];
          const s = new PIXI.Sprite(tex);
          s.x = x * TILE; s.y = y * TILE;
          floorLayer.addChild(s);
        }
      }
      // 2) props : escaliers + machines (sous les entités)
      const props = new PIXI.Container();
      for (const st of map.stairs) {
        if (st.floor !== fi) continue;
        const s = new PIXI.Sprite(st.dir === 'up' ? this.textures.stairsUp : this.textures.stairsDown);
        s.x = st.x * TILE; s.y = st.y * TILE;
        props.addChild(s);
      }
      for (const task of map.tasks) {
        if (task.floor !== fi) continue;
        const tex = this.textures.tasks[task.type] || this.textures.tasks.reactor;
        const s = new PIXI.Sprite(tex);
        s.x = task.x * TILE; s.y = task.y * TILE;
        props.addChild(s);
        task.__sprite = s;
      }
      // 3) rochers (murs) : blocs plats top-down
      const wallLayer = new PIXI.Container();
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const ch = map.tile(fi, x, y);
          if (ch !== '#') continue;
          const variant = ((x * 7 + y * 13) % 3);
          const s = new PIXI.Sprite(this.textures.walls[variant]);
          s.x = x * TILE; s.y = y * TILE;
          s.__tile = `${x},${y}`;
          s.__kind = 'wall';
          wallLayer.addChild(s);
        }
      }
      // 4) entités (triées en profondeur par y pour un recouvrement naturel)
      const entLayer = new PIXI.Container();
      entLayer.sortableChildren = true;
      // 5) brouillard de guerre
      const fog = new PIXI.Graphics();
      root.addChild(floorLayer, props, wallLayer, entLayer, fog);
      root.__entLayer = entLayer;
      root.__wallLayer = wallLayer;
      root.__fog = fog;
      root.visible = fi === 0;
      this.world.addChild(root);
      this.floorContainers.set(fi, root);
    });

    // halo lumineux du joueur (sobre, ambiance bunker)
    this.lightSprite = new PIXI.Sprite(this.textures.light);
    this.lightSprite.anchor.set(0.5, 0.5);
    this.lightSprite.scale.set(2.4);
    this.lightSprite.blendMode = 'add';
    this.fxLayer.addChild(this.lightSprite);
    this.resize();
  }

  /* ---------------- entités ---------------- */

  ensureEntity(id, name, fighterId, skinId) {
    if (this.entities.has(id)) return this.entities.get(id);
    const sheet = this.textures.sheetFor(fighterId, skinId);
    const entLayer = this.floorContainers.get(0)?.__entLayer;
    const isSelf = id === this.selfId;
    // anneau d'équipe sous le personnage (vert = soi, rouge = adversaire)
    const ring = new PIXI.Sprite(isSelf ? this.textures.ringGreen : this.textures.ringRed);
    ring.anchor.set(0.5, 0.5);
    ring.scale.set(0.78);
    ring.zIndex = 1;
    // ombre douce
    const shadow = new PIXI.Sprite(this.textures.shadow);
    shadow.anchor.set(0.5, 0.5);
    shadow.scale.set(0.8);
    shadow.zIndex = 2;
    // corps
    const sprite = new PIXI.Sprite(this.textures.frame(sheet, 0, 0));
    sprite.anchor.set(0.5, 0.54);
    sprite.scale.set(ENT_SCALE);
    sprite.zIndex = 3;
    // barre de vie + nom (toujours visibles, style Brawl Stars)
    const hpBar = new PIXI.Graphics();
    hpBar.zIndex = 90001;
    const hpText = new PIXI.Text({
      text: '',
      style: new PIXI.TextStyle({
        fontFamily: 'Segoe UI, sans-serif', fontSize: 9, fontWeight: '800',
        fill: 0xffffff, stroke: { color: 0x000000, width: 2.5 }
      })
    });
    hpText.anchor.set(0.5, 0.5);
    hpText.zIndex = 90002;
    let nameTag = null;
    if (name) {
      nameTag = new PIXI.Text({ text: name, style: new PIXI.TextStyle({
        fontFamily: 'Segoe UI, sans-serif', fontSize: 12, fontWeight: '800',
        fill: isSelf ? 0xc9ffcf : 0xffffff, stroke: { color: 0x000000, width: 3 }
      }) });
      nameTag.anchor.set(0.5, 1);
      nameTag.zIndex = 90003;
      entLayer.addChild(nameTag);
    }
    // emote
    const emoteTag = new PIXI.Text({ text: '', style: new PIXI.TextStyle({
      fontFamily: 'Segoe UI, sans-serif', fontSize: 13, fontWeight: '700', fill: 0xffd97a,
      stroke: { color: 0x000000, width: 3 }
    }) });
    emoteTag.anchor.set(0.5, 1);
    emoteTag.visible = false;
    emoteTag.zIndex = 90004;
    // barre de réparation
    const repairBar = new PIXI.Graphics();
    repairBar.visible = false;
    repairBar.zIndex = 90005;
    entLayer.addChild(ring, shadow, sprite, hpBar, hpText, emoteTag, repairBar);
    const ent = { ring, shadow, sprite, hpBar, hpText, nameTag, emoteTag, repairBar, sheet,
      fighterId, x: 0, y: 0, targetX: 0, targetY: 0, dir: 0, animT: 0, row: 0, floor: 0, name };
    this.entities.set(id, ent);
    return ent;
  }

  updateEntity(id, d, isSelf) {
    const ent = this.ensureEntity(id, d.name, d.fighter, d.skin);
    ent.targetX = d.x; ent.targetY = d.y; ent.dir = d.dir; ent.floor = d.floor;
    if (d.fighter) ent.fighterId = d.fighter;
    // HP : snapshot "me" en absolu, autres joueurs en pourcentage → converti avec les stats du fighter
    if (isSelf && d.hp !== undefined) {
      ent.hpAbs = d.hp;
      ent.hpMax = d.maxHp || ent.hpMax || 100;
    } else if (d.hp !== undefined) {
      const maxHp = this.textures.fighterHp?.[ent.fighterId] || 100;
      ent.hpAbs = Math.round(d.hp / 100 * maxHp);
      ent.hpMax = maxHp;
    }
    ent.cloak = d.cloak; ent.shield = d.shield; ent.moving = d.moving;
    ent.repairing = isSelf ? d.repairing : false;
    // teleport si loin (changement d'étage / spawn)
    if (Math.hypot(ent.targetX - ent.x, ent.targetY - ent.y) > 3.5) {
      ent.x = ent.targetX; ent.y = ent.targetY;
    }
    // déplacement entre étages
    const targetLayer = this.floorContainers.get(d.floor)?.__entLayer;
    if (targetLayer && ent.ring.parent !== targetLayer) {
      const kids = [ent.ring, ent.shadow, ent.sprite, ent.hpBar, ent.hpText, ent.repairBar];
      if (ent.nameTag) kids.push(ent.nameTag);
      kids.push(ent.emoteTag);
      targetLayer.addChild(...kids);
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
    ent.ring.destroy();
    ent.shadow.destroy();
    ent.sprite.destroy();
    ent.hpBar.destroy();
    ent.hpText.destroy();
    ent.nameTag?.destroy();
    ent.emoteTag?.destroy();
    ent.repairBar.destroy();
    ent.__shieldSprite?.destroy();
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
    s.x = topX(x); s.y = topX(y);
    s.scale.set(1.4);
    s.blendMode = 'add';
    const container = this.floorContainers.get(floor);
    if (!container) return;
    container.__entLayer.addChild(s);
    this.effects.push({ sprite: s, life: 0.7, update(dt, self) {
      self.life -= dt;
      s.alpha = Math.max(0, self.life / 0.7);
      s.scale.set(1.4 + (0.7 - self.life) * 2.4);
    } });
  }

  spawnHitFx(floor, x, y) {
    const s = new PIXI.Sprite(this.textures.glowAmber);
    s.anchor.set(0.5, 0.5);
    s.x = topX(x); s.y = topX(y);
    s.blendMode = 'add';
    const container = this.floorContainers.get(floor);
    if (!container) return;
    container.__entLayer.addChild(s);
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
      s.scale.set(1.4);
      s.blendMode = 'add';
      this.fxLayer.addChild(s);
      this.projectiles.set(id, s);
    }
    s.x = topX(d.x);
    s.y = topX(d.y);
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
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const st = map.fogState(this.currentFloor, x, y);
        if (st === 2) continue;
        fog.rect(x * TILE, y * TILE, TILE, TILE)
          .fill({ color: 0x050708, alpha: st === 1 ? 0.55 : 0.97 });
      }
    }
    this.fogDirty = false;
  }

  /* ---------------- boucle ---------------- */

  tick(dt) {
    if (!this.map || !this.app) return;
    const self = this.entities.get(this.selfId);
    // zoom caméra : réglage utilisateur en direct
    const zoom = Math.max(0.7, Math.min(1.8, state.settings.zoom || 1.25));
    this.camera.zoom = zoom;
    // caméra : suit le joueur
    if (self) {
      const tx = topX(self.x);
      const ty = topX(self.y) - 10;
      this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 8);
      this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 8);
    }
    this.world.scale.set(zoom);
    this.world.x = this.app.screen.width / 2 - this.camera.x * zoom;
    this.world.y = this.app.screen.height / 2 - this.camera.y * zoom;

    // interpolation des entités
    for (const [id, ent] of this.entities) {
      ent.x += (ent.targetX - ent.x) * Math.min(1, dt * 12);
      ent.y += (ent.targetY - ent.y) * Math.min(1, dt * 12);
      const wx = topX(ent.x), wy = topX(ent.y);
      ent.sprite.x = wx;
      ent.sprite.y = wy + 3;
      ent.ring.x = wx; ent.ring.y = wy + 6;
      ent.ring.visible = ent.sprite.visible;
      ent.shadow.x = wx; ent.shadow.y = wy + 7;
      ent.shadow.visible = ent.sprite.visible;
      ent.sprite.zIndex = wy + 3;
      ent.ring.zIndex = wy - 0.2;
      ent.shadow.zIndex = wy - 0.1;
      // animation
      ent.animT += dt;
      const speed = ent.moving ? 7 : 2.4;
      ent.row = Math.floor(ent.animT * speed) % 2;
      if (!ent.moving && ent.row === 1) ent.row = 0;
      ent.sprite.texture = this.textures.frame(ent.sheet, ent.dir, ent.row);
      // rotation légère du corps vers l'axe de visée ? non : 4 directions gérées par la feuille
      // effets d'état
      if (ent.cloak && id !== this.selfId) ent.sprite.alpha = 0.25;
      else if (ent.cloak) ent.sprite.alpha = 0.55;
      else ent.sprite.alpha = 1;
      // barre de vie + valeur (toujours visible)
      if (ent.hpMax !== undefined && ent.sprite.visible) {
        const ratio = Math.max(0, Math.min(1, (ent.hpAbs ?? 1) / ent.hpMax));
        const bw = 46, bh = 7, bx = wx - bw / 2, by = wy - 34;
        ent.hpBar.visible = true;
        ent.hpBar.clear();
        ent.hpBar.rect(bx - 1, by - 1, bw + 2, bh + 2).fill({ color: 0x000000, alpha: 0.85 });
        ent.hpBar.rect(bx, by, bw, bh).fill({ color: 0x241a14, alpha: 0.95 });
        ent.hpBar.rect(bx, by, bw * ratio, bh).fill({ color: ratio > 0.35 ? 0x58d95b : 0xff5d5d });
        ent.hpText.visible = true;
        ent.hpText.text = `${ent.hpAbs ?? 0}/${ent.hpMax}`;
        ent.hpText.x = wx; ent.hpText.y = by + bh / 2 + 0.5;
      } else {
        ent.hpBar.visible = false;
        ent.hpText.visible = false;
      }
      if (ent.nameTag) {
        ent.nameTag.x = wx;
        ent.nameTag.y = wy - 40;
        ent.nameTag.visible = ent.sprite.visible;
      }
      if (ent.emoteTag) {
        if (ent.emoteUntil && performance.now() > ent.emoteUntil) { ent.emoteTag.visible = false; ent.emoteUntil = 0; }
        if (ent.emoteTag.visible) {
          ent.emoteTag.x = wx;
          ent.emoteTag.y = wy - 52;
        }
      }
      // barre de réparation
      if (ent.repairing) {
        ent.repairBar.visible = true;
        ent.repairBar.clear();
        const by = wy - 24;
        const w = 34, p = (Math.sin(performance.now() / 120) + 1) / 2;
        ent.repairBar.rect(wx - w / 2, by, w, 5).fill({ color: 0x000000, alpha: 0.8 });
        ent.repairBar.rect(wx - w / 2, by, w * p, 5).fill({ color: 0xffd97a });
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
        s.blendMode = 'add';
        ent.ring.parent?.addChild(s);
        ent.__shieldSprite = s;
      }
      if (ent.__shieldSprite) {
        if (!ent.shield) { ent.__shieldSprite.destroy(); ent.__shieldSprite = null; }
        else {
          ent.__shieldSprite.x = topX(ent.x);
          ent.__shieldSprite.y = topX(ent.y) - 8;
          ent.__shieldSprite.zIndex = wyOf(ent) + 4;
          ent.__shieldSprite.alpha = 0.3 + Math.sin(performance.now() / 180) * 0.12;
        }
      }
    }

    // culling des rochers (hors écran → invisibles)
    const w = this.app.screen.width / zoom, h = this.app.screen.height / zoom;
    const viewL = this.camera.x - w / 2 - TILE * 2, viewR = this.camera.x + w / 2 + TILE * 2;
    const viewT = this.camera.y - h / 2 - TILE * 2, viewB = this.camera.y + h / 2 + TILE * 2;
    const wallLayer = this.floorContainers.get(this.currentFloor)?.__wallLayer;
    if (wallLayer) {
      for (const child of wallLayer.children) {
        child.visible = child.x > viewL && child.x < viewR && child.y > viewT && child.y < viewB;
      }
    }

    // halo du joueur
    if (self) {
      this.lightSprite.x = topX(self.x);
      this.lightSprite.y = topX(self.y);
      this.lightSprite.visible = true;
    }

    // teinte d'intoxication (vert croissant)
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

function wyOf(ent) { return topX(ent.y); }
