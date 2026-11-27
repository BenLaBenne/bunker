// server/data/defaultMap.js — Map par défaut "Bunker A-7" : 3 étages, 9 tâches,
// 4 paires d'escaliers, zone d'évacuation. Construite programmatiquement puis
// validée par scripts/validate_map.js (connectivité, paires d'escaliers, poids).

// Légende tuiles : '#'=mur, ' '=vide (roche), '.'=sol béton, 'p'=plaques métal,
// 'g'=caillebotis, 'h'=zone dangereuse, 'd'=porte, 'e'=zone d'évacuation
const W = 28, H = 20;

function makeGrid() {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ' '));
}
function carve(grid, x1, y1, x2, y2, t) {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
    if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = t;
  }
}
function set(grid, x, y, t) {
  if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = t;
}

function buildFloor0() {
  const g = makeGrid();
  carve(g, 1, 1, 7, 7, 'p');                       // Salle réacteur
  for (const [x, y] of [[3,3],[4,3],[5,3],[3,4],[5,4],[3,5],[4,5],[5,5]]) set(g, x, y, 'h');
  carve(g, 10, 1, 16, 6, 'p');                     // Refroidissement
  carve(g, 19, 1, 26, 8, 'p');                     // Générateur
  carve(g, 1, 9, 26, 10, 'g');                     // Couloir principal
  carve(g, 1, 12, 6, 18, '.');                     // Filtration d'air
  carve(g, 9, 12, 18, 18, '.');                    // Hall des spawns
  carve(g, 21, 12, 26, 18, '.');                   // Sécurité
  set(g, 4, 8, 'd'); set(g, 13, 7, 'd'); set(g, 13, 8, 'd'); set(g, 23, 9, 'd');
  set(g, 4, 11, 'd'); set(g, 13, 11, 'd'); set(g, 24, 11, 'd');
  return g;
}

function buildFloor1() {
  const g = makeGrid();
  carve(g, 1, 1, 8, 7, '.');                       // Dortoir
  carve(g, 10, 1, 16, 6, '.');                     // Réfectoire
  carve(g, 19, 1, 26, 8, 'p');                     // Portes de confinement
  carve(g, 1, 9, 26, 10, 'g');                     // Couloir
  carve(g, 1, 12, 6, 18, '.');                     // Éclairage
  carve(g, 9, 12, 18, 18, '.');                    // Réserve
  carve(g, 21, 12, 26, 18, '.');                   // Ventilation
  set(g, 4, 8, 'd'); set(g, 13, 7, 'd'); set(g, 13, 8, 'd'); set(g, 23, 9, 'd');
  set(g, 4, 11, 'd'); set(g, 13, 11, 'd'); set(g, 24, 11, 'd');
  return g;
}

function buildFloor2() {
  const g = makeGrid();
  carve(g, 2, 2, 8, 7, 'p');                       // Annexe ventilation
  carve(g, 11, 1, 17, 6, 'p');                     // Poste de contrôle
  carve(g, 1, 9, 26, 10, 'g');                     // Couloir de surface
  carve(g, 12, 12, 18, 16, 'e');                   // Zone d'évacuation
  for (const [x, y] of [[10,13],[20,13],[12,17],[18,17]]) set(g, x, y, 'h');
  set(g, 5, 8, 'd'); set(g, 14, 7, 'd'); set(g, 14, 8, 'd');
  set(g, 8, 11, 'd'); set(g, 24, 11, 'd'); set(g, 15, 11, 'd');
  return g;
}

const defaultMap = {
  id: 'bunker_a7',
  name: 'Bunker A-7',
  name_en: 'Bunker A-7',
  description: 'Bunker nucléaire sur 3 niveaux : réacteur, habitation et surface.',
  description_en: 'A 3-level nuclear bunker: reactor, living quarters and surface.',
  theme: 'bunker',
  w: W, h: H,
  // Paramètres d'intoxication propres à la map (surchargent la config globale)
  radiation: {
    repairTimeS: 360,
    graceS: 90,
    armorDrain: 3.5,
    damage: 5,
    maxSurviveS: 240
  },
  floors: [
    { name: 'Réacteur', name_en: 'Reactor', grid: buildFloor0().map(r => r.join('')) },
    { name: 'Habitation', name_en: 'Living quarters', grid: buildFloor1().map(r => r.join('')) },
    { name: 'Surface', name_en: 'Surface', grid: buildFloor2().map(r => r.join('')) }
  ],
  stairs: [
    { id: 's1', floor: 0, x: 2, y: 10, dir: 'up', to: { floor: 1, x: 2, y: 10 } },
    { id: 's1d', floor: 1, x: 2, y: 10, dir: 'down', to: { floor: 0, x: 2, y: 10 } },
    { id: 's2', floor: 0, x: 17, y: 10, dir: 'up', to: { floor: 1, x: 17, y: 10 } },
    { id: 's2d', floor: 1, x: 17, y: 10, dir: 'down', to: { floor: 0, x: 17, y: 10 } },
    { id: 's3', floor: 1, x: 8, y: 10, dir: 'up', to: { floor: 2, x: 8, y: 10 } },
    { id: 's3d', floor: 2, x: 8, y: 10, dir: 'down', to: { floor: 1, x: 8, y: 10 } },
    { id: 's4', floor: 1, x: 24, y: 10, dir: 'up', to: { floor: 2, x: 24, y: 10 } },
    { id: 's4d', floor: 2, x: 24, y: 10, dir: 'down', to: { floor: 1, x: 24, y: 10 } }
  ],
  tasks: [
    { id: 't_reactor',    type: 'reactor',    floor: 0, x: 4,  y: 4,  duration: 8, weight: 15, name: 'Réacteur nucléaire',      name_en: 'Nuclear reactor' },
    { id: 't_cooling',    type: 'cooling',    floor: 0, x: 13, y: 3,  duration: 5, weight: 10, name: 'Refroidissement',         name_en: 'Cooling system' },
    { id: 't_generator',  type: 'generator',  floor: 0, x: 23, y: 4,  duration: 6, weight: 10, name: 'Générateur électrique',   name_en: 'Electric generator' },
    { id: 't_filter',     type: 'filter',     floor: 0, x: 3,  y: 15, duration: 5, weight: 10, name: 'Filtration de l’air',     name_en: 'Air filtration' },
    { id: 't_security',   type: 'security',   floor: 0, x: 24, y: 15, duration: 5, weight: 10, name: 'Système de sécurité',     name_en: 'Security system' },
    { id: 't_containment',type: 'containment',floor: 1, x: 23, y: 3,  duration: 6, weight: 12, name: 'Portes de confinement',   name_en: 'Containment doors' },
    { id: 't_lights',     type: 'lights',     floor: 1, x: 3,  y: 14, duration: 4, weight: 8,  name: 'Éclairage',               name_en: 'Lighting' },
    { id: 't_ventilation',type: 'ventilation',floor: 1, x: 24, y: 15, duration: 5, weight: 10, name: 'Ventilation',             name_en: 'Ventilation' },
    { id: 't_beacon',     type: 'beacon',     floor: 2, x: 15, y: 14, duration: 5, weight: 15, name: 'Balisage d’évacuation',   name_en: 'Evac beacon' }
  ],
  spawns: [
    { floor: 0, x: 11, y: 14 }, { floor: 0, x: 13, y: 14 }, { floor: 0, x: 15, y: 14 },
    { floor: 0, x: 11, y: 16 }, { floor: 0, x: 13, y: 16 }, { floor: 0, x: 15, y: 16 },
    { floor: 0, x: 12, y: 15 }, { floor: 0, x: 14, y: 15 }, { floor: 0, x: 16, y: 15 },
    { floor: 0, x: 12, y: 13 }
  ],
  evac: [], // dérivé des tuiles 'e' du sol de la map (zone d'évacuation)
  hazardTiles: [] // dérivé des tuiles 'h'
};

export { defaultMap };
