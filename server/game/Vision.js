// server/game/Vision.js — Vision par joueur : raycast LOS sur la grille de tuiles.
// Un joueur voit les tuiles dans son rayon, bloquées par les murs (occlusion 2D).
// Les entités cloackées sont filtrées séparément par le Match.

const DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

/** Ligne de vue entre deux cases (Bresenham — la case cible n'est pas testée). */
export function los(map, floor, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (true) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if ((x !== x1 || y !== y1) && map.isOpaque(floor, x, y)) return false;
  }
}

/**
 * Ensemble des tuiles visibles "x,y" pour une position (etage, px, py).
 * La roche (' ') n'est jamais visible ; les murs adjacents à du sol visible
 * le restent pour la lisibilité des cloisons.
 */
export function visibleTiles(map, floor, px, py, radius) {
  const visible = new Set();
  const cx = Math.floor(px), cy = Math.floor(py);
  const R = Math.ceil(radius);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const tx = cx + dx, ty = cy + dy;
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
      if (dx * dx + dy * dy > radius * radius) continue;
      const t = map.tile(floor, tx, ty);
      if (t === ' ') continue;
      if (los(map, floor, cx, cy, tx, ty)) visible.add(`${tx},${ty}`);
    }
  }
  const walls = new Set();
  for (const k of visible) {
    const [x, y] = k.split(',').map(Number);
    for (const [ddx, ddy] of DIRS) {
      const wx = x + ddx, wy = y + ddy;
      if (map.tile(floor, wx, wy) === '#') walls.add(`${wx},${wy}`);
    }
  }
  for (const w of walls) visible.add(w);
  return visible;
}

/** Un point est-il visible depuis une position (filtrage des entités) ? */
export function pointVisible(map, floor, px, py, tx, ty, radius) {
  const d = Math.hypot(tx - px, ty - py);
  if (d > radius) return false;
  if (d < 1.4) return true; // à bout portant (à travers une porte par ex.)
  return los(map, floor, Math.floor(px), Math.floor(py), Math.floor(tx), Math.floor(ty));
}
