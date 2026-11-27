// server/game/Pathfinding.js — A* sur grille par étage + liens par escaliers.
// Utilisé par les bots pour se déplacer et traverser les étages.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * A* sur un étage. Retourne une liste de {x, y} ou null.
 * @param {import('./GameMap.js').GameMap} map
 */
export function astarFloor(map, floor, sx, sy, tx, ty, maxNodes = 4000) {
  if (!map.isPassable(floor, tx, ty)) return null;
  const key = (x, y) => y * map.w + x;
  const open = [{ x: sx, y: sy, g: 0, f: Math.abs(tx - sx) + Math.abs(ty - sy), parent: null }];
  const best = new Map([[key(sx, sy), 0]]);
  let nodes = 0;
  while (open.length) {
    // extraction du min (petites grilles → scan simple)
    let mi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[mi].f) mi = i;
    const cur = open.splice(mi, 1)[0];
    if (cur.x === tx && cur.y === ty) {
      const path = [];
      let n = cur;
      while (n) { path.push({ x: n.x, y: n.y }); n = n.parent; }
      path.reverse();
      return path;
    }
    if (++nodes > maxNodes) return null;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!map.isPassable(floor, nx, ny)) continue;
      const g = cur.g + 1;
      const k = key(nx, ny);
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      open.push({ x: nx, y: ny, g, f: g + Math.abs(tx - nx) + Math.abs(ty - ny), parent: cur });
    }
  }
  return null;
}

/**
 * Trouve le prochain escalier utile pour aller de `fromFloor` vers `toFloor`
 * en traversant les étages adjacents. Retourne {x, y} de l'escalier sur fromFloor.
 */
export function stairToward(map, fromFloor, toFloor, sx, sy) {
  if (toFloor === fromFloor) return null;
  const step = toFloor > fromFloor ? 1 : -1;
  const nextFloor = fromFloor + step;
  const stairs = map.stairs.filter(s => s.floor === fromFloor && s.to.floor === nextFloor);
  if (!stairs.length) return null;
  // escalier le plus proche
  stairs.sort((a, b) => (Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy)));
  return { x: stairs[0].x, y: stairs[0].y };
}
