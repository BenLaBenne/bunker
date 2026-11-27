// src/rendering/TextureFactory.js — Génération procédurale de toutes les textures
// pixel-art (tuiles isométriques, murs, machines, personnages, effets).
// Aucun asset externe : rendu déterministe sur canvas → PIXI.Texture.

export const TILE_W = 64;
export const TILE_H = 32;
export const WALL_H = 40;
export const CHAR_W = 32;
export const CHAR_H = 32;
export const SHEET_COLS = 4;   // down, left, right, up
export const SHEET_ROWS = 2;   // idle, walk

// RNG déterministe (même texture à chaque lancement)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
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

function diamondPath(ctx, cx, cy, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function makeTexture(c) {
  return PIXI.Texture.from(c);
}

/* ---------------- Sols isométriques ---------------- */

function floorDiamond(base, variant, seed, painter) {
  const { c, ctx } = canvas(TILE_W, TILE_H);
  const cx = TILE_W / 2, cy = TILE_H / 2;
  const rnd = mulberry32(seed);
  // face principale
  diamondPath(ctx, cx, cy, TILE_W, TILE_H);
  ctx.fillStyle = base;
  ctx.fill();
  // arêtes : haut plus clair, bas plus sombre (relief)
  ctx.save();
  diamondPath(ctx, cx, cy, TILE_W, TILE_H);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 0, TILE_W, TILE_H);
  grad.addColorStop(0, shade(base, 14));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, shade(base, -22));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TILE_W, TILE_H);
  painter?.(ctx, rnd, cx, cy);
  ctx.restore();
  // contour discret
  diamondPath(ctx, cx, cy, TILE_W, TILE_H);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // bord supérieur lumineux
  ctx.beginPath();
  ctx.moveTo(cx - TILE_W / 2, cy);
  ctx.lineTo(cx, cy - TILE_H / 2);
  ctx.lineTo(cx + TILE_W / 2, cy);
  ctx.strokeStyle = shade(base, 30);
  ctx.lineWidth = 1;
  ctx.stroke();
  return makeTexture(c);
}

const FLOOR_PAINTERS = {
  '.': (ctx, rnd) => { // béton : taches + fissures
    for (let i = 0; i < 26; i++) {
      const x = rnd() * TILE_W, y = rnd() * TILE_H;
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)';
      ctx.fillRect(x | 0, y | 0, 2, 1);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(10 + rnd() * 10, 18);
    ctx.lineTo(22 + rnd() * 10, 22);
    ctx.stroke();
  },
  'p': (ctx, rnd) => { // plaques métal : rivets
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(8, 6, 48, 20);
    for (const [x, y] of [[10, 8], [54, 8], [10, 24], [54, 24], [32, 16]]) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x - 1, y - 1, 3, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - 1, y, 3, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(9, 7, 46, 2);
  },
  'g': (ctx, rnd) => { // caillebotis
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    for (let i = -2; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * 12, TILE_H); ctx.lineTo(i * 12 + TILE_H, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 12 + TILE_W / 2, TILE_H); ctx.lineTo(i * 12 + TILE_W / 2 + TILE_H, 0); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 8; i++) ctx.fillRect(rnd() * TILE_W, rnd() * TILE_H, 3, 1);
  },
  'h': (ctx, rnd) => { // zone dangereuse : rayures jaune/noir usées
    for (let i = 0; i < 14; i++) {
      ctx.save();
      diamondPath(ctx, TILE_W / 2, TILE_H / 2, TILE_W, TILE_H);
      ctx.clip();
      ctx.fillStyle = i % 2 ? '#c9a23d' : '#20241f';
      ctx.save();
      ctx.translate(i * 10 - 20, 0);
      ctx.rotate(-0.35);
      ctx.fillRect(0, -10, 6, 52);
      ctx.restore();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(60,50,20,0.5)';
    for (let i = 0; i < 10; i++) ctx.fillRect(rnd() * TILE_W, rnd() * TILE_H, 3, 2);
  },
  'e': (ctx, rnd) => { // pad d'évacuation : vert lumineux + chevrons
    diamondPath(ctx, TILE_W / 2, TILE_H / 2, TILE_W - 6, TILE_H - 4);
    ctx.fillStyle = '#16351d';
    ctx.fill();
    ctx.strokeStyle = '#7fff6a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(127,255,106,0.8)';
    for (let i = 0; i < 3; i++) {
      const x = 20 + i * 10, y = 14 - i * 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 4); ctx.lineTo(x + 4, y); ctx.lineTo(x + 8, y + 4);
      ctx.strokeStyle = 'rgba(127,255,106,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(127,255,106,0.12)';
    ctx.fillRect(0, 0, TILE_W, TILE_H);
  },
  'd': (ctx) => { // porte au sol : cadre
    diamondPath(ctx, TILE_W / 2, TILE_H / 2, TILE_W - 10, TILE_H - 8);
    ctx.fillStyle = '#2a2f33';
    ctx.fill();
    ctx.strokeStyle = '#4c555c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(TILE_W / 2, 4); ctx.lineTo(TILE_W / 2, TILE_H - 4);
    ctx.stroke();
  }
};

/* ---------------- Murs ---------------- */

function wallTexture(variant, seed) {
  const H = WALL_H + TILE_H;
  const { c, ctx } = canvas(TILE_W, H);
  const rnd = mulberry32(seed);
  const base = variant === 1 ? '#39423f' : variant === 2 ? '#333c39' : '#2f3835';
  const topY = 0, faceTop = TILE_H / 2; // le sommet du mur est le haut du canvas

  // Faces latérales
  ctx.beginPath();
  ctx.moveTo(0, faceTop + WALL_H / 2 - 16); ctx.lineTo(TILE_W / 2, faceTop + WALL_H / 2 + 16 - 16); ctx.lineTo(TILE_W / 2, H - 16 + 16); ctx.lineTo(0, H - 16 - 16 + 16);
  ctx.closePath();
  ctx.fillStyle = shade(base, -26);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(TILE_W / 2, faceTop + WALL_H / 2 + 16 - 16); ctx.lineTo(TILE_W, faceTop + WALL_H / 2 - 16); ctx.lineTo(TILE_W, H - 16 - 16 + 16); ctx.lineTo(TILE_W / 2, H - 16 + 16);
  ctx.closePath();
  ctx.fillStyle = shade(base, -8);
  ctx.fill();

  // Face supérieure (diamant décalé vers le haut)
  diamondPath(ctx, TILE_W / 2, TILE_H / 2, TILE_W, TILE_H);
  ctx.fillStyle = shade(base, 34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Détails faces : panneaux verticaux + rivets
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, faceTop + WALL_H / 2 - 16); ctx.lineTo(TILE_W / 2, faceTop + WALL_H / 2 + 16 - 16); ctx.lineTo(TILE_W / 2, H); ctx.lineTo(0, H);
  ctx.closePath(); ctx.clip();
  for (let x = 6; x < TILE_W / 2; x += 14) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, TILE_H / 2 + 6, 2, WALL_H);
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(TILE_W / 2, faceTop + WALL_H / 2 + 16 - 16); ctx.lineTo(TILE_W, faceTop + WALL_H / 2 - 16); ctx.lineTo(TILE_W, H); ctx.lineTo(TILE_W / 2, H);
  ctx.closePath(); ctx.clip();
  for (let x = TILE_W / 2 + 8; x < TILE_W; x += 14) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, TILE_H / 2 + 6, 2, WALL_H);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x + 2, TILE_H / 2 + 6, 1, WALL_H);
  }
  ctx.restore();

  // Variantes : tuyaux / rayures d'alerte
  if (variant === 2) {
    ctx.fillStyle = '#5c4632';
    ctx.fillRect(TILE_W / 2 + 6, TILE_H / 2 + 10, 5, WALL_H - 6);
    ctx.fillStyle = '#77604a';
    ctx.fillRect(TILE_W / 2 + 6, TILE_H / 2 + 10, 2, WALL_H - 6);
    ctx.fillStyle = '#3d2f22';
    ctx.fillRect(TILE_W / 2 + 4, TILE_H / 2 + 22, 9, 4);
  } else if (variant === 3) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, faceTop + WALL_H / 2 - 16); ctx.lineTo(TILE_W / 2, faceTop + WALL_H / 2 + 16 - 16); ctx.lineTo(TILE_W / 2, H); ctx.lineTo(0, H);
    ctx.closePath(); ctx.clip();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#c9a23d' : '#1f2320';
      ctx.fillRect(i * 9 - 4, H - 18, 7, 12);
    }
    ctx.restore();
  }

  // saleté
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 8; i++) ctx.fillRect(rnd() * TILE_W, TILE_H / 2 + rnd() * WALL_H, 3, 4);
  return makeTexture(c);
}

/* ---------------- Escaliers ---------------- */

function stairsTexture(dirUp) {
  const H = WALL_H + TILE_H;
  const { c, ctx } = canvas(TILE_W, H);
  const base = dirUp ? '#3d5148' : '#4a3d34';
  // marches (dégradé de losanges)
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const y = TILE_H / 2 + 8 - (dirUp ? t * 10 : -t * 6);
    const w = TILE_W * (0.9 - t * 0.12), h = TILE_H * (0.9 - t * 0.12);
    diamondPath(ctx, TILE_W / 2, y, w, h);
    ctx.fillStyle = shade(base, 10 + t * 30);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // flèche direction
  ctx.fillStyle = dirUp ? 'rgba(127,255,106,0.95)' : 'rgba(255,179,71,0.95)';
  ctx.beginPath();
  const ax = TILE_W / 2, ay = dirUp ? 12 : H - 20;
  if (dirUp) {
    ctx.moveTo(ax, ay); ctx.lineTo(ax + 10, ay + 12); ctx.lineTo(ax - 10, ay + 12);
  } else {
    ctx.moveTo(ax, ay + 12); ctx.lineTo(ax + 10, ay); ctx.lineTo(ax - 10, ay);
  }
  ctx.closePath();
  ctx.fill();
  return makeTexture(c);
}

/* ---------------- Machines (tâches) ---------------- */

function machineTexture(type) {
  const W = 64, H = 84;
  const { c, ctx } = canvas(W, H);
  const body = '#2e3833', body2 = '#38453e';
  // ombre au sol
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 8, 22, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // socle
  px(ctx, 8, H - 22, 48, 16, '#1c2420');
  px(ctx, 10, H - 20, 44, 4, '#141a17');

  const drawCabinet = (x, y, w, h, color) => {
    px(ctx, x, y, w, h, color);
    px(ctx, x + 2, y + 2, w - 4, 3, shade(color, 30));
    px(ctx, x, y + h - 3, w, 3, shade(color, -30));
    ctx.strokeStyle = '#121815';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };
  const glow = (x, y, w, h, color) => {
    px(ctx, x, y, w, h, color);
    px(ctx, x, y + h, w, 2, 'rgba(255,255,255,0.25)');
  };

  switch (type) {
    case 'reactor': {
      drawCabinet(14, 18, 36, 44, body);
      // cœur réacteur lumineux
      ctx.fillStyle = '#0f1a12';
      ctx.fillRect(18, 26, 28, 28);
      glow(22, 32, 20, 16, '#59d977');
      px(ctx, 26, 36, 4, 4, '#c9ffcf');
      px(ctx, 34, 34, 3, 3, '#c9ffcf');
      // tuyaux
      px(ctx, 6, 30, 10, 6, '#4d5a52'); px(ctx, 48, 44, 10, 6, '#4d5a52');
      px(ctx, 50, 22, 6, 20, '#3c4a42');
      px(ctx, 6, 52, 8, 8, '#4d5a52');
      break;
    }
    case 'cooling': {
      drawCabinet(10, 20, 44, 40, body2);
      // ventilateur
      ctx.fillStyle = '#121a16';
      ctx.beginPath(); ctx.arc(32, 40, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7fc6e8';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.moveTo(32, 40);
        ctx.lineTo(32 + Math.cos(a) * 10, 40 + Math.sin(a) * 10);
        ctx.stroke();
      }
      glow(28, 58, 8, 3, '#7fc6e8');
      px(ctx, 14, 24, 8, 30, '#3c4a52');
      break;
    }
    case 'generator': {
      drawCabinet(12, 16, 40, 46, '#454a32');
      // bobines
      for (let i = 0; i < 3; i++) {
        px(ctx, 18, 24 + i * 12, 28, 6, '#6a7244');
        px(ctx, 18, 24 + i * 12, 28, 2, '#8a9455');
      }
      glow(24, 60, 16, 4, '#ffd97a');
      px(ctx, 8, 34, 6, 12, '#3c4a42');
      break;
    }
    case 'filter': {
      drawCabinet(14, 14, 36, 48, body);
      // fentes de ventilation
      for (let i = 0; i < 5; i++) px(ctx, 20, 22 + i * 7, 24, 3, '#10160f');
      // réservoir vert
      ctx.fillStyle = '#2f5a38';
      ctx.fillRect(22, 56, 20, 8);
      glow(24, 58, 16, 3, '#7fff6a');
      px(ctx, 50, 30, 6, 24, '#3c4a42');
      break;
    }
    case 'security': {
      drawCabinet(8, 18, 48, 42, body2);
      // écrans ambrés
      px(ctx, 14, 24, 18, 12, '#0c110d');
      px(ctx, 34, 24, 16, 12, '#0c110d');
      glow(16, 26, 14, 8, '#e8b04a');
      glow(36, 26, 12, 8, '#e8b04a');
      px(ctx, 16, 38, 30, 4, '#10160f');
      glow(18, 40, 26, 2, 'rgba(232,176,74,0.6)');
      px(ctx, 14, 46, 34, 8, '#12181a');
      break;
    }
    case 'containment': {
      // lourde porte blindée
      drawCabinet(12, 12, 40, 52, '#3a3236');
      px(ctx, 18, 20, 28, 34, '#241f22');
      ctx.strokeStyle = '#5a4a4a';
      ctx.strokeRect(18.5, 20.5, 27, 33);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? '#c9a23d' : '#20241f';
        ctx.fillRect(19, 24 + i * 10, 26, 5);
      }
      glow(28, 58, 8, 4, '#ff5d5d');
      break;
    }
    case 'lights': {
      drawCabinet(12, 22, 40, 36, body2);
      // grille d'ampoules
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        glow(18 + i * 12, 28 + j * 14, 8, 8, i % 2 ? '#fff3b0' : '#e8d04a');
      }
      break;
    }
    case 'ventilation': {
      drawCabinet(10, 18, 44, 42, body);
      // grand ventilateur
      ctx.fillStyle = '#10160f';
      ctx.beginPath(); ctx.arc(32, 38, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5aa0c8';
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.6;
        ctx.beginPath();
        ctx.moveTo(32, 38);
        ctx.lineTo(32 + Math.cos(a) * 13, 38 + Math.sin(a) * 13);
        ctx.stroke();
      }
      px(ctx, 14, 58, 36, 4, '#12181a');
      glow(30, 60, 4, 3, '#7fc6e8');
      break;
    }
    case 'beacon': {
      // balise d'évacuation : mât + lampe
      px(ctx, 29, 16, 6, 52, '#3c4a42');
      px(ctx, 27, 62, 10, 6, '#1c2420');
      glow(24, 8, 16, 10, '#7fff6a');
      px(ctx, 28, 10, 8, 5, '#c9ffcf');
      // antennes
      px(ctx, 24, 22, 2, 10, '#4d5a52');
      px(ctx, 38, 26, 2, 8, '#4d5a52');
      break;
    }
    default: {
      drawCabinet(14, 20, 36, 42, body);
      glow(24, 34, 16, 6, '#59d977');
    }
  }
  return makeTexture(c);
}

/* ---------------- Personnages (feuilles 128x64) ---------------- */

function charSheet(palette, seed = 1) {
  const { c, ctx } = canvas(CHAR_W * SHEET_COLS, CHAR_H * SHEET_ROWS);
  const body = palette.body || '#4a5a50';
  const dark = shade(body, -28);
  const light = shade(body, 22);
  const accent = palette.accent || '#7fff6a';
  const visor = palette.visor || '#c9ffcf';

  function draw(frameCol, frameRow, dir) {
    const ox = frameCol * CHAR_W, oy = frameRow * CHAR_H;
    const cx = ox + 16, baseY = oy + 28;
    const walk = frameRow === 1;
    const bob = frameRow === 0 ? (seed % 2) : 0;
    // ombre portée
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // jambes
    if (walk) {
      px(ctx, cx - 5, baseY - 7, 4, 7, dark);
      px(ctx, cx + 2, baseY - 6, 4, 6, dark);
    } else {
      px(ctx, cx - 4, baseY - 7, 4, 7, dark);
      px(ctx, cx + 1, baseY - 7, 4, 7, dark);
    }
    // torse
    const torsoY = baseY - 16 - bob;
    px(ctx, cx - 7, torsoY, 14, 10, body);
    px(ctx, cx - 7, torsoY, 14, 3, light);
    px(ctx, cx - 7, torsoY + 7, 14, 3, dark);
    // bande accent
    px(ctx, cx - 7, torsoY + 4, 14, 2, accent);
    // bras
    if (dir === 1) { px(ctx, cx - 10, torsoY + 2, 4, 8, dark); px(ctx, cx + 8, torsoY + 2, 3, 8, body); }
    else if (dir === 2) { px(ctx, cx + 7, torsoY + 2, 4, 8, dark); px(ctx, cx - 9, torsoY + 2, 3, 8, body); }
    else { px(ctx, cx - 10, torsoY + 2, 3, 8, body); px(ctx, cx + 8, torsoY + 2, 3, 8, body); }
    // arme (visée vers la direction)
    if (dir === 2) px(ctx, cx + 10, torsoY + 4, 6, 3, '#22282a');
    else if (dir === 1) px(ctx, cx - 15, torsoY + 4, 6, 3, '#22282a');
    else if (dir === 0) px(ctx, cx + 4, torsoY + 10, 3, 7, '#22282a');
    // casque
    const headY = torsoY - 8;
    px(ctx, cx - 6, headY, 12, 9, shade(body, 12));
    px(ctx, cx - 6, headY, 12, 3, shade(body, 30));
    px(ctx, cx - 6, headY + 8, 12, 2, dark);
    // visière lumineuse selon direction
    if (dir === 0) px(ctx, cx - 4, headY + 4, 8, 3, visor);
    else if (dir === 1) px(ctx, cx - 5, headY + 4, 5, 3, visor);
    else if (dir === 2) px(ctx, cx + 1, headY + 4, 5, 3, visor);
    else px(ctx, cx - 6, headY + 3, 12, 3, shade(body, -18)); // de dos : pas de visière
    // reflet casque
    px(ctx, cx - 4, headY + 1, 3, 1, 'rgba(255,255,255,0.5)');
    // sac de dos (visible de dos et côtés)
    if (dir === 3) px(ctx, cx - 5, torsoY + 1, 10, 8, dark);
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

/* ---------------- Effets ---------------- */

function lightTexture() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,236,190,0.55)');
  g.addColorStop(0.45, 'rgba(255,220,150,0.22)');
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

function projectileTexture(color) {
  const { c, ctx } = canvas(14, 14);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(7, 7, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(6, 6, 2, 0, Math.PI * 2); ctx.fill();
  return makeTexture(c);
}

/* ---------------- Fabrique ---------------- */

export class TextureFactory {
  constructor(fighters, skinsById = {}) {
    const FLOOR_BASE = { '.': '#414a44', 'p': '#46504a', 'g': '#3a4143', 'h': '#4a4438', 'e': '#1c3a24', 'd': '#31363a' };
    this.floors = {};
    let seed = 7;
    for (const [ch, color] of Object.entries(FLOOR_BASE)) {
      this.floors[ch] = floorDiamond(color, ch, seed++, FLOOR_PAINTERS[ch]);
    }
    this.walls = [wallTexture(1, 101), wallTexture(2, 202), wallTexture(3, 303)];
    this.stairsUp = stairsTexture(true);
    this.stairsDown = stairsTexture(false);
    this.tasks = {};
    for (const type of ['reactor', 'cooling', 'generator', 'filter', 'security', 'containment', 'lights', 'ventilation', 'beacon']) {
      this.tasks[type] = machineTexture(type);
    }
    this.light = lightTexture();
    this.glowGreen = glowTexture('rgba(127,255,106,0.5)');
    this.glowAmber = glowTexture('rgba(255,179,71,0.5)');
    this.glowRed = glowTexture('rgba(255,93,93,0.5)');
    this.glowCyan = glowTexture('rgba(127,198,232,0.5)');
    this.projectileGreen = projectileTexture('#aaff9d');
    this.projectileAmber = projectileTexture('#ffd97a');
    this.projectileCyan = projectileTexture('#8fd6ff');
    // feuilles de personnages
    this.charSheets = {};
    this.charCanvases = {};
    const palettes = {
      rust: { body: '#5a5636', accent: '#ffd97a', visor: '#fff3b0' },
      brick: { body: '#4a5a50', accent: '#c9a23d', visor: '#e8ffd9' },
      volt: { body: '#354a5a', accent: '#7fc6e8', visor: '#bfe9ff' },
      mole: { body: '#5c4632', accent: '#ff9b3d', visor: '#ffd9a0' },
      wraith: { body: '#2a2f38', accent: '#b28cff', visor: '#e2d5ff' }
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
