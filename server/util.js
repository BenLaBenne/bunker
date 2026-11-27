// server/util.js — petits utilitaires partagés
import crypto from 'node:crypto';

export function uid(len = 12) {
  return crypto.randomBytes(24).toString('base64url').slice(0, len);
}

export function now() {
  return new Date().toISOString();
}

export function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Limite une chaîne et la nettoie des caractères de contrôle. */
export function cleanStr(s, maxLen = 200) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen);
}

/** Décode une data URL base64 et vérifie la taille + le magic bytes. */
export function decodeDataUrl(dataUrl, allowedMimes, maxBytes) {
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return { ok: false, error: 'BAD_DATA_URL' };
  const mime = m[1].toLowerCase();
  if (!allowedMimes.includes(mime)) return { ok: false, error: 'BAD_MIME', mime };
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) return { ok: false, error: 'EMPTY' };
  if (buf.length > maxBytes) return { ok: false, error: 'TOO_LARGE', size: buf.length };
  // Vérification magic bytes réelle (ne pas faire confiance au mime déclaré)
  const sig = (bytes) => bytes.every((b, i) => buf[i] === b);
  let kind = null;
  if (sig([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) kind = 'image/png';
  else if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') kind = 'image/webp';
  else if (buf[0] === 0xff && buf[1] === 0xd8) kind = 'image/jpeg';
  else if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'OggS') kind = 'audio/ogg';
  else if (buf.length >= 3 && buf.toString('ascii', 0, 3) === 'ID3') kind = 'audio/mpeg';
  else if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) kind = 'audio/mpeg';
  else if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') kind = 'audio/wav';
  else if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '<?xml') kind = 'image/svg+xml';
  if (!kind) return { ok: false, error: 'UNKNOWN_FORMAT' };
  if (!allowedMimes.includes(kind)) return { ok: false, error: 'BAD_MIME', mime: kind };
  return { ok: true, mime: kind, buf };
}

/** Dimensions d'une image PNG (IHDR) ou WebP (VP8X/VP8L/VP8) sans dépendance. */
export function imageDims(buf, mime) {
  if (mime === 'image/png' && buf.length > 24) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (mime === 'image/webp' && buf.length > 30) {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
    if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

/** Lecture de cookies depuis l'en-tête Cookie. */
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}
