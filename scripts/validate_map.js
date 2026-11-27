// scripts/validate_map.js — Valide la map par défaut : dimensions, tuiles,
// paires d'escaliers, tâches sur sol praticable, spawns, zone d'évacuation,
// connectivité BFS (spawns → toutes les tâches / escaliers / évac).
import { defaultMap } from '../server/data/defaultMap.js';

const PASSABLE = new Set(['.', 'p', 'g', 'h', 'd', 'e']);
let errors = [];
let warnings = [];

const floors = defaultMap.floors.map(f => f.grid.map(r => r.split('')));

// 1. Dimensions
floors.forEach((g, i) => {
  if (g.length !== defaultMap.h) errors.push(`Étage ${i}: hauteur ${g.length} != ${defaultMap.h}`);
  g.forEach((row, y) => {
    if (row.length !== defaultMap.w) errors.push(`Étage ${i}, ligne ${y}: largeur ${row.length} != ${defaultMap.w}`);
  });
});

// 2. Tâches sur tuile praticable + poids
let weightSum = 0;
for (const t of defaultMap.tasks) {
  weightSum += t.weight;
  const ch = floors[t.floor]?.[t.y]?.[t.x];
  if (!PASSABLE.has(ch)) errors.push(`Tâche ${t.id} (${t.floor}/${t.x},${t.y}) sur tuile non praticable '${ch}'`);
  if (!(t.duration > 0)) errors.push(`Tâche ${t.id}: durée invalide`);
}
if (weightSum !== 100) warnings.push(`Somme des poids = ${weightSum} (attendu 100)`);

// 3. Escaliers : tuile praticable + paire existante + cohérence
const stairKeys = new Set(defaultMap.stairs.map(s => `${s.floor}:${s.x},${s.y}`));
for (const s of defaultMap.stairs) {
  const ch = floors[s.floor]?.[s.y]?.[s.x];
  if (!PASSABLE.has(ch)) errors.push(`Escalier ${s.id} sur tuile non praticable '${ch}'`);
  const key = `${s.to.floor}:${s.to.x},${s.to.y}`;
  if (!stairKeys.has(key)) errors.push(`Escalier ${s.id}: destination sans escalier (${key})`);
  if (s.dir === 'up' && s.to.floor !== s.floor + 1) errors.push(`Escalier ${s.id}: 'up' vers étage non adjacent`);
  if (s.dir === 'down' && s.to.floor !== s.floor - 1) errors.push(`Escalier ${s.id}: 'down' vers étage non adjacent`);
}

// 4. Spawns praticables
for (const sp of defaultMap.spawns) {
  const ch = floors[sp.floor]?.[sp.y]?.[sp.x];
  if (!PASSABLE.has(ch)) errors.push(`Spawn (${sp.floor}/${sp.x},${sp.y}) sur tuile '${ch}'`);
}

// 5. Zone d'évacuation (tuiles 'e')
let evacCount = 0;
floors.forEach((g, fi) => g.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'e') evacCount++; })));
if (evacCount === 0) errors.push('Aucune zone d’évacuation (tuile e)');
console.log(`Zone d'évacuation : ${evacCount} tuiles`);

// 6. Connectivité BFS depuis le premier spawn (multi-étages via escaliers)
const targets = new Set(defaultMap.tasks.map(t => `${t.floor}:${t.x},${t.y}`));
const seen = new Set([`0:${defaultMap.spawns[0].x},${defaultMap.spawns[0].y}`]);
const queue = [{ floor: 0, x: defaultMap.spawns[0].x, y: defaultMap.spawns[0].y }];
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const stairByFloor = {};
for (const s of defaultMap.stairs) {
  (stairByFloor[s.floor] ||= []).push(s);
}
while (queue.length) {
  const cur = queue.shift();
  const key = `${cur.floor}:${cur.x},${cur.y}`;
  for (const [dx, dy] of DIRS) {
    const nx = cur.x + dx, ny = cur.y + dy;
    const k = `${cur.floor}:${nx},${ny}`;
    if (nx < 0 || ny < 0 || nx >= defaultMap.w || ny >= defaultMap.h) continue;
    if (seen.has(k)) continue;
    const ch = floors[cur.floor]?.[ny]?.[nx];
    if (PASSABLE.has(ch)) { seen.add(k); queue.push({ floor: cur.floor, x: nx, y: ny }); }
  }
  for (const s of stairByFloor[cur.floor] || []) {
    if (s.x === cur.x && s.y === cur.y) {
      const k = `${s.to.floor}:${s.to.x},${s.to.y}`;
      if (!seen.has(k)) { seen.add(k); queue.push({ floor: s.to.floor, x: s.to.x, y: s.to.y }); }
    }
  }
}
for (const t of targets) if (!seen.has(t)) errors.push(`Tâche/zone ${t} non joignable depuis le spawn`);
const evacTiles = [];
floors.forEach((g, fi) => g.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'e') evacTiles.push(`${fi}:${x},${y}`); })));
if (!evacTiles.some(t => seen.has(t))) errors.push('Zone d’évacuation non joignable');
for (const s of defaultMap.stairs) {
  if (!seen.has(`${s.floor}:${s.x},${s.y}`)) errors.push(`Escalier ${s.id} non joignable`);
}

// Rapport
if (warnings.length) { console.log('Avertissements:'); warnings.forEach(w => console.log('  ⚠ ' + w)); }
if (errors.length) {
  console.log(`ERREURS (${errors.length}):`);
  errors.forEach(e => console.log('  ✗ ' + e));
  process.exit(1);
} else {
  console.log('✓ Map valide : dimensions, paires d’escaliers, poids (100), connectivité OK.');
}
