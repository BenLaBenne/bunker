// server/game/GameMap.js — Représentation runtime d'une map : grilles de collision,
// opacité, escaliers, tâches, spawns, zones d'évacuation et dangereuses.

export class GameMap {
  constructor(data) {
    this.raw = data;
    this.id = data.id;
    this.name = data.name;
    this.w = data.w;
    this.h = data.h;
    this.floors = data.floors.map(f => ({
      name: f.name, name_en: f.name_en,
      grid: f.grid.map(row => row.split(''))
    }));
    this.stairs = (data.stairs || []).map(s => ({ ...s }));
    this.tasks = (data.tasks || []).map(t => ({
      id: t.id, type: t.type, floor: t.floor, x: t.x, y: t.y,
      duration: t.duration || 5, weight: t.weight || 10,
      name: t.name, name_en: t.name_en
    }));
    this.spawns = (data.spawns || []).map(s => ({ ...s }));
    // Zone d'évacuation : tuiles 'e'
    this.evacTiles = [];
    this.hazardTiles = [];
    this.floors.forEach((f, fi) => {
      f.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === 'e') this.evacTiles.push({ floor: fi, x, y });
          if (row[x] === 'h') this.hazardTiles.push({ floor: fi, x, y });
        }
      });
    });
    if (Array.isArray(data.evac) && data.evac.length) this.evacTiles.push(...data.evac.map(e => ({ ...e })));
    this.stairByFloor = {};
    for (const s of this.stairs) (this.stairByFloor[s.floor] ||= []).push(s);
    this.hazardSet = new Set(this.hazardTiles.map(t => `${t.floor}:${t.x},${t.y}`));
    this.evacSet = new Set(this.evacTiles.map(t => `${t.floor}:${t.x},${t.y}`));
  }

  tile(floor, x, y) {
    const f = this.floors[floor];
    if (!f || y < 0 || y >= f.grid.length || x < 0 || x >= f.grid[y].length) return ' ';
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

  isPassable(floor, x, y) {
    return !this.isSolid(floor, x, y);
  }

  /** Collision cercle (entité) contre la grille. */
  collides(floor, x, y, r) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.isSolid(floor, tx, ty)) continue;
        const cx = Math.max(tx, Math.min(x, tx + 1));
        const cy = Math.max(ty, Math.min(y, ty + 1));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  stairAt(floor, x, y) {
    for (const s of this.stairByFloor[floor] || []) {
      if (s.x === x && s.y === y) return s;
    }
    return null;
  }

  isEvac(floor, x, y) {
    return this.evacSet.has(`${floor}:${Math.floor(x)},${Math.floor(y)}`);
  }

  isHazard(floor, x, y) {
    return this.hazardSet.has(`${floor}:${Math.floor(x)},${Math.floor(y)}`);
  }

  /** Version sérialisée envoyée au client (avec tuiles dérivées). */
  toClient() {
    return { ...this.raw, evac: this.evacTiles, hazardTiles: this.hazardTiles };
  }
}
