// src/rendering/TextureFactory.js — Génération procédurale de toutes les textures
// TOP-DOWN carrées (vue de dessus style Brawl Stars) : sols de sable, rochers
// orange-rouge, touffes d'herbe dorée, machines vues de dessus, personnages
// circulaires avec anneau d'équipe. Aucun asset externe : rendu déterministe
// sur canvas → PIXI.Texture.

export const TILE = 56;       // tuile carrée top-down
export const TILE_W = TILE;   // compat anciens imports
export const TILE_H = TILE;
export const WALL_H = TILE;   // compat : les murs sont des blocs plats
export const CHAR_W = 32;
export const CHAR_H = 32;
export const SHEET_COLS = 4;  // down, left, right, up
export const SHEET_ROWS = 2;  // idle, walk

// RNG déterministe (même texture à chaque lancement)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function makeTexture(c) {
  const tex = PIXI.Texture.from(c);
  if (tex.source) tex.source.scaleMode = 'nearest'; // pixel-art net au zoom
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- Sols carrés top-down ---------------- */

function floorSquare(base, variant, seed, painter) {
  const T = TILE;
  const { c, ctx } = canvas(T, T);
  const rnd = mulberry32(seed);
  // fond + dégradé doux (lumière haut-gauche)
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, T, T);
  const grad = ctx.createLinearGradient(0, 0, T, T);
  grad.addColorStop(0, shade(base, 12));
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, shade(base, -16));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, T, T);
  painter?.(ctx, rnd, T);
  // liseré sombre discret (bord de tuile)
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, T - 2, T - 2);
  return makeTexture(c);
}

const FLOOR_PAINTERS = {
  '.': (ctx, rnd, T) => { // sable : mottes, cailloux, fissures
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,235,200,0.14)' : 'rgba(90,50,25,0.12)';
      ctx.beginPath();
      ctx.ellipse(rnd() * T, rnd() * T, 6 + rnd() * 10, 4 + rnd() * 7, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,240,210,0.20)' : 'rgba(70,40,20,0.22)';
      ctx.fillRect((rnd() * T) | 0, (rnd() * T) | 0, 2, 1);
    }
    for (let i = 0; i < 3; i++) { // petits cailloux
      const x = 6 + rnd() * (T - 12), y = 6 + rnd() * (T - 12);
      ctx.fillStyle = '#8a6a4a';
      ctx.beginPath(); ctx.ellipse(x, y, 2.4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,200,0.5)';
      ctx.fillRect(x - 1, y - 1, 1.6, 1);
    }
  },
  'p': (ctx, rnd, T) => { // plaque de métal rouillée : rivets + rayures
    px(ctx, 3, 3, T - 6, T - 6, 'rgba(0,0,0,0.18)');
    ctx.strokeStyle = 'rgba(60,30,15,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(3.5, 3.5, T - 7, T - 7);
    ctx.strokeStyle = 'rgba(255,210,170,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(5.5, 5.5, T - 11, T - 11);
    for (const [x, y] of [[8, 8], [T - 12, 8], [8, T - 12], [T - 12, T - 12]]) {
      ctx.fillStyle = '#6e4530';
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,190,0.55)';
      ctx.fillRect(x - 1.4, y - 1.4, 1.8, 1.8);
    }
    ctx.strokeStyle = 'rgba(60,30,15,0.35)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(10 + rnd() * (T - 24), 10 + rnd() * (T - 24));
      ctx.lineTo(18 + rnd() * (T - 30), 18 + rnd() * (T - 30));
      ctx.stroke();
    }
  },
  'g': (ctx, rnd, T) => { // herbe dorée style Brawl Stars : touffes épaisses
    for (let i = 0; i < 16; i++) {
      const bx = 4 + rnd() * (T - 8), by = 8 + rnd() * (T - 10);
      const h = 7 + rnd() * 8;
      ctx.strokeStyle = rnd() > 0.5 ? '#e0b04a' : '#c9963a';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + (rnd() - 0.5) * 6, by - h * 0.6, bx + (rnd() - 0.5) * 8, by - h);
      ctx.stroke();
      // reflet
      ctx.strokeStyle = 'rgba(255,225,140,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + 1, by - 2);
      ctx.lineTo(bx + 1, by - h * 0.55);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,225,150,0.18)';
    ctx.beginPath(); ctx.ellipse(T / 2, T / 2, T * 0.36, T * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  },
  'h': (ctx, rnd, T) => { // zone dangereuse : rayures jaune/noir usées
    px(ctx, 0, 0, T, T, '#26221c');
    ctx.save();
    ctx.translate(-T / 2, 0);
    ctx.rotate(Math.PI / 4);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 ? '#d9b23f' : '#1c1914';
      ctx.fillRect(i * 14, -20, 7, T * 2);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 10; i++) ctx.fillRect((rnd() * T) | 0, (rnd() * T) | 0, 4, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, T - 3, T - 3);
  },
  'e': (ctx, rnd, T) => { // pad d'évacuation : vert lumineux + chevrons
    px(ctx, 0, 0, T, T, '#1d5a2c');
    ctx.strokeStyle = '#7fff6a';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, T - 8, T - 8);
    ctx.fillStyle = 'rgba(127,255,106,0.14)';
    ctx.fillRect(6, 6, T - 12, T - 12);
    ctx.strokeStyle = '#c9ffcf';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const y = 22 + i * 14;
      ctx.beginPath();
      ctx.moveTo(T / 2 - 9, y + 7); ctx.lineTo(T / 2, y - 2); ctx.lineTo(T / 2 + 9, y + 7);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(127,255,106,0.35)';
    for (let i = 0; i < 8; i++) ctx.fillRect((rnd() * T) | 0, (rnd() * T) | 0, 2, 2);
  },
  'd': (ctx, rnd, T) => { // porte au sol : cadre métallique + bande centrale
    px(ctx, 0, 0, T, T, '#5a666e');
    px(ctx, 6, 6, T - 12, T - 12, '#2e363b');
    ctx.strokeStyle = '#7e8c96';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, T - 12, T - 12);
    ctx.strokeStyle = 'rgba(220,235,245,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(T / 2, 10); ctx.lineTo(T / 2, T - 10); ctx.stroke();
    for (const [x, y] of [[9, 9], [T - 13, 9], [9, T - 13], [T - 13, T - 13]]) {
      ctx.fillStyle = '#7e8c96';
      ctx.fillRect(x, y, 4, 4);
    }
  }
};

/* ---------------- Rochers (murs) top-down ---------------- */

function wallRock(variant, seed) {
  const T = TILE;
  const { c, ctx } = canvas(T, T);
  const rnd = mulberry32(seed);
  const base = '#c05a3a', light = '#d87248', dark = '#97432c', outline = '#63281b';

  // ombre portée au sol
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(T / 2 + 3, T / 2 + 5, T * 0.42, T * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  // bloc rocheux arrondi
  const m = 3;
  roundRect(ctx, m, m, T - m * 2, T - m * 2, 12);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.stroke();

  // face éclairée (haut-gauche)
  ctx.save();
  roundRect(ctx, m, m, T - m * 2, T - m * 2, 12);
  ctx.clip();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(T * 0.36, T * 0.32, T * 0.34, T * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(T * 0.72, T * 0.78, T * 0.36, T * 0.3, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // fissures
  ctx.strokeStyle = 'rgba(70,25,15,0.65)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    let x = 8 + rnd() * (T - 16), y = 8 + rnd() * (T - 16);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      x += (rnd() - 0.5) * 16; y += (rnd() - 0.5) * 16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // petits cailloux incrustés
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#d88a5e' : '#a44f30';
    ctx.beginPath();
    ctx.ellipse(10 + rnd() * (T - 20), 10 + rnd() * (T - 20), 2.6, 2, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // os décoratifs (variante 2) : ambiance désert
  if (variant === 2) {
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(14, T - 16); ctx.lineTo(T - 18, 20); ctx.stroke();
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath(); ctx.arc(T - 18, 20, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.arc(T - 19.5, 18.5, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(T - 15.5, 19, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // contour lumineux haut
  roundRect(ctx, m + 1.5, m + 1.5, T - m * 2 - 3, T * 0.42, 10);
  ctx.strokeStyle = 'rgba(255,205,170,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  return makeTexture(c);
}

/* ---------------- Escaliers (top-down) ---------------- */

function stairsTexture(dirUp) {
  const T = TILE;
  const { c, ctx } = canvas(T, T);
  const rnd = mulberry32(99);
  const base = dirUp ? '#a8743f' : '#8a5a34';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, T, T);
  const grad = ctx.createLinearGradient(0, 0, T, T);
  grad.addColorStop(0, shade(base, 14));
  grad.addColorStop(1, shade(base, -18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, T, T);
  // marches concentriques
  for (let i = 0; i < 4; i++) {
    const inset = 6 + i * 6;
    ctx.fillStyle = shade(base, dirUp ? 18 - i * 6 : 4 + i * 6);
    roundRect(ctx, inset, inset, T - inset * 2, T - inset * 2, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // flèche direction
  ctx.fillStyle = dirUp ? '#7fff6a' : '#ffb347';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  const cy = T / 2, ax = T / 2;
  ctx.beginPath();
  if (dirUp) {
    ctx.moveTo(ax, cy - 12); ctx.lineTo(ax + 11, cy + 4); ctx.lineTo(ax - 11, cy + 4);
  } else {
    ctx.moveTo(ax, cy + 12); ctx.lineTo(ax + 11, cy - 4); ctx.lineTo(ax - 11, cy - 4);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  return makeTexture(c);
}

/* ---------------- Machines (tâches) vues de dessus ---------------- */

function machineTexture(type) {
  const T = TILE;
  const { c, ctx } = canvas(T, T);
  const rnd = mulberry32(41);
  const metal = '#3d474e', metal2 = '#4c5a63';

  // ombre
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(T / 2 + 2, T / 2 + 4, T * 0.4, T * 0.36, 0, 0, Math.PI * 2); ctx.fill();

  const cabinet = (pad, color) => {
    roundRect(ctx, pad, pad, T - pad * 2, T - pad * 2, 9);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#151b1f';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // vis coins
    for (const [x, y] of [[pad + 7, pad + 7], [T - pad - 7, pad + 7], [pad + 7, T - pad - 7], [T - pad - 7, T - pad - 7]]) {
      ctx.fillStyle = '#6a7a85';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  };
  const circleGlow = (cx, cy, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  };

  switch (type) {
    case 'reactor': {
      cabinet(3, metal);
      ctx.strokeStyle = '#5a6a74';
      ctx.lineWidth = 2;
      // 4 tuyaux d'angle
      for (const [x, y] of [[12, 12], [T - 12, 12], [12, T - 12], [T - 12, T - 12]]) {
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      }
      circleGlow(T / 2, T / 2, 15, '#12301c');
      circleGlow(T / 2, T / 2, 10, '#59d977');
      circleGlow(T / 2 - 3, T / 2 - 3, 3, '#c9ffcf');
      break;
    }
    case 'cooling': {
      cabinet(3, metal2);
      circleGlow(T / 2, T / 2, 16, '#16222b');
      ctx.strokeStyle = '#7fc6e8';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.moveTo(T / 2, T / 2);
        ctx.lineTo(T / 2 + Math.cos(a) * 13, T / 2 + Math.sin(a) * 13);
        ctx.stroke();
      }
      circleGlow(T / 2, T / 2, 3.5, '#bfe9ff');
      break;
    }
    case 'generator': {
      cabinet(3, '#4c523a');
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 1 ? '#8a9455' : '#6a7244';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(T / 2, T / 2, 5 + i * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      circleGlow(T / 2, T / 2, 6, '#ffd97a');
      circleGlow(T / 2, T / 2, 2.5, '#fff3b0');
      break;
    }
    case 'filter': {
      cabinet(3, metal);
      // fentes de ventilation
      ctx.fillStyle = '#10160f';
      for (let i = 0; i < 4; i++) px(ctx, 12, 10 + i * 9, T - 24, 5, '#10160f');
      circleGlow(T / 2, T - 14, 7, '#2f5a38');
      circleGlow(T / 2, T - 14, 4, '#7fff6a');
      break;
    }
    case 'security': {
      cabinet(3, metal2);
      px(ctx, 9, 12, 17, 13, '#0c110d');
      px(ctx, T - 26, 12, 17, 13, '#0c110d');
      px(ctx, 11, 14, 13, 9, '#e8b04a');
      px(ctx, T - 24, 14, 13, 9, '#e8b04a');
      px(ctx, 12, 15, 5, 3, '#ffe9b0');
      px(ctx, T - 23, 15, 5, 3, '#ffe9b0');
      px(ctx, 9, 32, T - 18, 10, '#12181a');
      px(ctx, 12, 35, T - 26, 2, 'rgba(232,176,74,0.7)');
      px(ctx, 12, 38, T - 34, 2, 'rgba(232,176,74,0.4)');
      break;
    }
    case 'containment': {
      cabinet(3, '#4a3a3e');
      circleGlow(T / 2, T / 2, 17, '#241f22');
      ctx.strokeStyle = '#5a4a4a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(T / 2, T / 2, 15, 0, Math.PI * 2); ctx.stroke();
      // rayures hazard autour du hatch
      ctx.save();
      ctx.beginPath(); ctx.arc(T / 2, T / 2, 15, 0, Math.PI * 2); ctx.clip();
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#c9a23d' : '#20241f';
        ctx.save();
        ctx.translate(T / 2, T / 2);
        ctx.rotate(i * Math.PI / 4);
        ctx.fillRect(-16, -3, 32, 3);
        ctx.restore();
      }
      ctx.restore();
      circleGlow(T / 2, T / 2, 5, '#ff5d5d');
      circleGlow(T / 2, T / 2, 2, '#ffc0c0');
      break;
    }
    case 'lights': {
      cabinet(3, metal2);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        circleGlow(17 + i * 22, 17 + j * 22, 8, i || j ? '#e8d04a' : '#fff3b0');
        circleGlow(17 + i * 22, 17 + j * 22, 4, '#fffbe0');
      }
      break;
    }
    case 'ventilation': {
      cabinet(3, metal);
      circleGlow(T / 2, T / 2, 17, '#10160f');
      ctx.strokeStyle = '#5aa0c8';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.6;
        ctx.beginPath();
        ctx.moveTo(T / 2, T / 2);
        ctx.lineTo(T / 2 + Math.cos(a) * 14, T / 2 + Math.sin(a) * 14);
        ctx.stroke();
      }
      circleGlow(T / 2, T / 2, 4, '#7fc6e8');
      break;
    }
    case 'beacon': {
      // balise : socle + dôme lumineux + ondes
      cabinet(6, '#37424a');
      ctx.strokeStyle = 'rgba(127,255,106,0.5)';
      ctx.lineWidth = 2;
      for (const r of [12, 18]) {
        ctx.beginPath(); ctx.arc(T / 2, T / 2, r, 0, Math.PI * 2); ctx.stroke();
      }
      circleGlow(T / 2, T / 2, 8, '#7fff6a');
      circleGlow(T / 2, T / 2, 4, '#e2ffe0');
      break;
    }
    default: {
      cabinet(3, metal);
      circleGlow(T / 2, T / 2, 10, '#59d977');
    }
  }
  return makeTexture(c);
}

/* ---------------- Personnages top-down (feuilles 128x64) ---------------- */

function charSheet(palette, seed = 1) {
  const { c, ctx } = canvas(CHAR_W * SHEET_COLS, CHAR_H * SHEET_ROWS);
  const body = palette.body || '#4a5a50';
  const dark = shade(body, -34);
  const light = shade(body, 20);
  const accent = palette.accent || '#7fff6a';
  const visor = palette.visor || '#c9ffcf';
  const outline = shade(body, -52);

  function draw(frameCol, frameRow, dir) {
    const ox = frameCol * CHAR_W, oy = frameRow * CHAR_H;
    const cx = ox + 16, cy = oy + 16;
    const walk = frameRow === 1;
    const bob = walk ? 1 : 0;
    // Décalages selon direction (0=down, 1=left, 2=right, 3=up)
    const ddx = dir === 1 ? -3 : dir === 2 ? 3 : 0;
    const ddy = dir === 0 ? 3 : dir === 3 ? -3 : 0;

    // arme : canon sorti vers la direction
    ctx.fillStyle = '#23282a';
    if (dir === 0) px(ctx, cx - 1.5, cy + 7, 3, 9, '#23282a');
    else if (dir === 3) px(ctx, cx - 1.5, cy - 16, 3, 9, '#23282a');
    else if (dir === 1) px(ctx, cx - 15, cy - 1.5, 9, 3, '#23282a');
    else px(ctx, cx + 7, cy - 1.5, 9, 3, '#23282a');
    ctx.fillStyle = '#454e52'; // embout
    if (dir === 0) px(ctx, cx - 1.5, cy + 14, 3, 2, '#454e52');
    else if (dir === 3) px(ctx, cx - 1.5, cy - 16, 3, 2, '#454e52');
    else if (dir === 1) px(ctx, cx - 15, cy - 1.5, 2, 3, '#454e52');
    else px(ctx, cx + 14, cy - 1.5, 2, 3, '#454e52');

    // pieds (animés)
    const fOff = walk ? (seed % 2 ? 1.5 : -1.5) : 0;
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(cx - 5, cy + 8 + (dir === 0 ? fOff : 0), 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, cy + 8 - (dir === 0 ? fOff : 0), 2.4, 0, Math.PI * 2); ctx.fill();

    // sac de dos (visible vers le bas quand on regarde en haut)
    if (dir === 3) {
      px(ctx, cx - 4, cy + 4 + bob, 8, 6, dark);
      px(ctx, cx - 3, cy + 5 + bob, 6, 2, shade(body, -20));
    }

    // corps circulaire
    ctx.beginPath();
    ctx.arc(cx, cy + bob * 0.4, 9.5, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // reflet haut-gauche
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 3 + bob * 0.4, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    // bande accent (épaulière)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy + bob * 0.4, 9.5, 0, Math.PI * 2); ctx.clip();
    px(ctx, cx - 10, cy + 1 + bob * 0.4, 20, 2.6, accent);
    ctx.restore();

    // tête (casque) décalée vers la direction
    const hx = cx + ddx, hy = cy + ddy + bob * 0.4;
    ctx.beginPath();
    ctx.arc(hx, hy, 5.6, 0, Math.PI * 2);
    ctx.fillStyle = light;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // visière lumineuse
    ctx.fillStyle = visor;
    if (dir === 0) px(ctx, hx - 3, hy + 2.5, 6, 2.2, visor);
    else if (dir === 1) px(ctx, hx - 4.5, hy - 2, 2.4, 4.4, visor);
    else if (dir === 2) px(ctx, hx + 2, hy - 2, 2.4, 4.4, visor);
    // up : nuque sombre (pas de visière)
    else px(ctx, hx - 3, hy + 1, 6, 3, dark);
  }

  for (let dir = 0; dir < SHEET_COLS; dir++) {
    draw(dir, 0, dir);
    draw(dir, 1, dir);
  }
  return makeTexture(c);
}

/** Feuille de skin personnalisé : pixels épars { "x,y": "#hex" } sur 128x64. */
function skinSheet(skinData) {
  const { c, ctx } = canvas(CHAR_W * SHEET_COLS, CHAR_H * SHEET_ROWS);
  const pixels = skinData?.pixels || {};
  for (const [key, color] of Object.entries(pixels)) {
    const [x, y] = key.split(',').map(Number);
    px(ctx, x, y, 1, 1, color);
  }
  return makeTexture(c);
}

/* ---------------- Effets & décor auxiliaires ---------------- */

function lightTexture() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,230,180,0.30)');
  g.addColorStop(0.5, 'rgba(255,215,150,0.12)');
  g.addColorStop(1, 'rgba(255,210,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return makeTexture(c);
}

function glowTexture(color) {
  const S = 64;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return makeTexture(c);
}

/** Anneau coloré sous le personnage (style Brawl Stars). */
function ringTexture(color) {
  const S = 64;
  const { c, ctx } = canvas(S, S);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, 24, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, 26.5, 0, Math.PI * 2); ctx.stroke();
  return makeTexture(c);
}

/** Ombre douce sous les entités. */
function shadowTexture() {
  const W = 64, H = 44;
  const { c, ctx } = canvas(W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / W);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, W / 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return makeTexture(c);
}

function projectileTexture(color) {
  const { c, ctx } = canvas(14, 14);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(7, 7, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(6, 6, 2, 0, Math.PI * 2); ctx.fill();
  return makeTexture(c);
}

/* ---------------- Fabrique ---------------- */

export class TextureFactory {
  constructor(fighters, skinsById = {}) {
    const FLOOR_BASE = {
      '.': '#c98e57', // sable
      'p': '#9c6b4f', // métal rouillé
      'g': '#b98f3c', // herbe dorée
      'h': '#3a332a', // zone dangereuse
      'e': '#1d5a2c', // évacuation
      'd': '#5a666e'  // porte
    };
    this.floors = {};
    let seed = 7;
    for (const [ch, color] of Object.entries(FLOOR_BASE)) {
      this.floors[ch] = floorSquare(color, ch, seed++, FLOOR_PAINTERS[ch]);
    }
    this.walls = [wallRock(1, 101), wallRock(2, 202), wallRock(3, 303)];
    this.stairsUp = stairsTexture(true);
    this.stairsDown = stairsTexture(false);
    this.tasks = {};
    for (const type of ['reactor', 'cooling', 'generator', 'filter', 'security', 'containment', 'lights', 'ventilation', 'beacon']) {
      this.tasks[type] = machineTexture(type);
    }
    this.light = lightTexture();
    this.ringGreen = ringTexture('rgba(110,240,120,0.95)');
    this.ringRed = ringTexture('rgba(255,90,80,0.95)');
    this.ringBlue = ringTexture('rgba(90,170,255,0.95)');
    this.shadow = shadowTexture();
    this.glowGreen = glowTexture('rgba(127,255,106,0.5)');
    this.glowAmber = glowTexture('rgba(255,179,71,0.5)');
    this.glowRed = glowTexture('rgba(255,93,93,0.5)');
    this.glowCyan = glowTexture('rgba(127,198,232,0.5)');
    this.projectileGreen = projectileTexture('#aaff9d');
    this.projectileAmber = projectileTexture('#ffd97a');
    this.projectileCyan = projectileTexture('#8fd6ff');
    // pv max par fighter (pour l'affichage "87/130" des autres joueurs)
    this.fighterHp = {};
    for (const f of fighters || []) this.fighterHp[f.id] = f.hp || 100;
    // feuilles de personnages
    this.charSheets = {};
    this.charCanvases = {};
    const palettes = {
      rust: { body: '#8a5f33', accent: '#ffd97a', visor: '#fff3b0' },
      brick: { body: '#7a4a3a', accent: '#ffb347', visor: '#ffd9c0' },
      volt: { body: '#3d5a74', accent: '#7fc6e8', visor: '#bfe9ff' },
      mole: { body: '#8a6a4a', accent: '#ff9b3d', visor: '#ffd9a0' },
      wraith: { body: '#4a4258', accent: '#b28cff', visor: '#e2d5ff' }
    };
    for (const f of fighters || []) {
      const built = charSheet(palettes[f.id] || palettes.rust, f.id.length + 3);
      this.charSheets[f.id] = built;
      this.charCanvases[f.id] = built.source?.resource || built.source;
    }
    // skins admin (pixels) — prioritaire sur la palette
    this.skinSheets = {};
    for (const [id, data] of Object.entries(skinsById)) {
      if (data?.pixels && Object.keys(data.pixels).length) this.skinSheets[id] = skinSheet(data);
    }
  }

  sheetFor(fighterId, skinId) {
    if (skinId && this.skinSheets[skinId]) return this.skinSheets[skinId];
    return this.charSheets[fighterId] || this.charSheets.rust;
  }

  frame(sheet, dir, row) {
    // cache des frames découpées
    sheet.__frames = sheet.__frames || {};
    const key = `${dir}_${row}`;
    if (!sheet.__frames[key]) {
      sheet.__frames[key] = new PIXI.Texture({
        source: sheet.source,
        frame: new PIXI.Rectangle(dir * CHAR_W, row * CHAR_H, CHAR_W, CHAR_H)
      });
    }
    return sheet.__frames[key];
  }
}
