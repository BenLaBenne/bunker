// server/validate.js — Validation côté serveur de toutes les entrées client.
import { cleanStr } from './util.js';

export const UNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;

export function validateUname(uname) {
  if (typeof uname !== 'string' || !UNAME_RE.test(uname)) return false;
  return true;
}

export function validatePassword(pword) {
  if (typeof pword !== 'string' || pword.length < 8 || pword.length > 72) return false;
  if (!/[A-Za-z]/.test(pword) || !/[0-9]/.test(pword)) return false;
  return true;
}

export function intOf(v, def = 0, min = -Infinity, max = Infinity) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function num(v, def = 0, min = -Infinity, max = Infinity) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Normalise un objet de réglages client (clés connues uniquement). */
export function validateSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const known = ['music', 'sfx', 'master', 'zoom', 'joystickLeft', 'showFps', 'emote'];
  for (const k of known) {
    if (k in raw) {
      if (k === 'joystickLeft' || k === 'showFps') out[k] = !!raw[k];
      else out[k] = num(raw[k], 1, 0, 2);
    }
  }
  if ('lang' in raw && ['fr', 'en'].includes(raw.lang)) out.lang = raw.lang;
  return out;
}

export { cleanStr };
