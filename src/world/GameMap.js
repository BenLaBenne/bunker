// src/world/GameMap.js — Miroir client de la map : grilles, collisions locales,
// LOS pour le fog of war (même algorithme que le serveur, calculé localement).

const DIRS8 = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

export class GameMap {
  constructor(data) {
    this.raw = data;
    this.id = data.id;
    this.w = data.w;
    this.h = data.h;
    this.floors = data.floors.map(f => ({
      name: f.name, name_en: f.name_en,
      grid: f.grid.map(r => r.split(''))
    }));
    this.stairs = data.stairs || [];
    this.tasks = data.tasks || [];
    this.spawns = data.spawns || [];
    this.evacTiles = data.evac || [];
    this.hazardTiles = data.hazardTiles || [];
    this.stairByTile = new Map();
    for (const s of this.stairs) {
      this.stairByTile.set(`${s.floor}:${s.x},${s.y}`, s);
    }
    // Mémoire de brouillard : 0 = inconnu, 1 = exploré, 2 = visible
    this.fog = this.floors.map(() => Array.from({ length: this.h }, () => new Uint8Array(this.w)));
    this.floorCount = this.floors.length;
  }

  tile(floor, x, y) {
    const f = this.floors[floor];
    if (!f || y < 0 || y >= this.h || x < 0 || x >= this.w) return ' ';
    return f.grid[y][x];
  }

  isSolid(floor, x, y) {
    const t = this.tile(floor, x, y);
    return t === '#' || t === ' ' || t === undefined;
  }

  isOpaque(floor, x, y) {
    const t = this.tile(floor, x, y);
    return t === '#' || t === ' ' || t === undefined;
  }

  stairAt(floor, x, y) {
    return this.stairByTile.get(`${floor}:${x},${y}`) || null;
  }

  isEvacTile(floor, x, y) {
    return this.tile(floor, x, y) === 'e';
  }

  los(x0, y0, x1, y1, floor) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    while (true) {
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if ((x !== x1 || y !== y1) && this.isOpaque(floor, x, y)) return false;
    }
  }

  /** Met à jour le fog autour d'une position. Retourne true si le fog a changé. */
  updateFog(floor, px, py, radius) {
    const grid = this.fog[floor];
    const cx = Math.floor(px), cy = Math.floor(py);
    let changed = false;
    const R = Math.ceil(radius);
    const visible = new Set();
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        if (dx * dx + dy * dy > radius * radius) continue;
        const t = this.tile(floor, tx, ty);
        if (t === ' ') continue;
        if (this.los(cx, cy, tx, ty, floor)) visible.add(ty * this.w + tx);
      }
    }
    // murs adjacents au sol visible
    const wallAdd = [];
    for (const idx of visible) {
      const x = idx % this.w, y = (idx / this.w) | 0;
      for (const [ddx, ddy] of DIRS8) {
        const wx = x + ddx, wy = y + ddy;
        if (this.tile(floor, wx, wy) === '#') wallAdd.push(wy * this.w + wx);
      }
    }
    for (const w of wallAdd) visible.add(w);
    for (const idx of visible) {
      const x = idx % this.w, y = (idx / this.w) | 0;
      if (grid[y][x] !== 2) { grid[y][x] = 2; changed = true; }
    }
    // les tuiles visibles au tick précédent deviennent "explorées"
    if (this.prevVisible && this.prevVisibleFloor === floor) {
      for (const idx of this.prevVisible) {
        const x = idx % this.w, y = (idx / this.w) | 0;
        if (grid[y][x] === 2 && !visible.has(idx)) { grid[y][x] = 1; changed = true; }
      }
    }
    this.prevVisible = visible;
    this.prevVisibleFloor = floor;
    return changed;
  }

  fogState(floor, x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.fog[floor]?.[y]?.[x] ?? 0;
  }
}
