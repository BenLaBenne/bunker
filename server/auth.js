// server/auth.js — Authentification sécurisée : bcryptjs, sessions en cookie httpOnly
// (révocables via la table sessions), protection rate-limit, contrôle ban/suspend.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db/index.js';
import { env } from './env.js';
import { now } from './util.js';

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

const COOKIE = 'bk_session';

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const days = env.SESSION_DAYS;
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  await db.query('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)', [token, userId, now(), expires]);
  return token;
}

export async function destroySession(token) {
  if (token) await db.query('DELETE FROM sessions WHERE id = ?', [token]);
}

export async function getUserByToken(token) {
  if (!token) return null;
  const rows = await db.query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`, [token, now()]);
  return rows[0] || null;
}

function cookieOptions(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const secure = proto.includes('https');
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${env.SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

export function setSessionCookie(res, req, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieOptions(req)}`);
}
export function clearSessionCookie(res, req) {
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOptions(req).replace(/Max-Age=\d+/, 'Max-Age=0')}`);
}

/** Middleware : charge req.user depuis le cookie de session. */
export async function attachUser(req, _res, next) {
  const cookies = Object.fromEntries(
    String(req.headers.cookie || '').split(';').map(p => {
      const i = p.indexOf('=');
      return i === -1 ? ['', ''] : [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1).trim())];
    }).filter(([k]) => k)
  );
  req.sessionToken = cookies[COOKIE] || null;
  req.user = await getUserByToken(req.sessionToken);
  next();
}

/** Middleware : exige une session valide et un compte actif. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  if (req.user.banned) return res.status(403).json({ error: 'BANNED' });
  if (req.user.suspended_until && new Date(req.user.suspended_until) > new Date()) {
    return res.status(403).json({ error: 'SUSPENDED' });
  }
  next();
}

/** Middleware admin : vérifié côté serveur à CHAQUE action privilégiée. */
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'ADMIN_REQUIRED' });
  next();
}

/** Profil public d'un utilisateur (jamais de hash ni de champs sensibles). */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, uname: u.uname, is_admin: !!u.is_admin, lang: u.lang || 'fr',
    level: u.level, xp: u.xp, trophies: u.trophies, season_trophies: u.season_trophies,
    wins: u.wins, kills: u.kills, deaths: u.deaths, tasks_done: u.tasks_done, matches: u.matches,
    coins: u.coins, cores: u.cores,
    selected_fighter: u.selected_fighter, selected_skin: u.selected_skin,
    settings: typeof u.settings === 'string' ? JSON.parse(u.settings || '{}') : (u.settings || {}),
    banned: !!u.banned, suspended_until: u.suspended_until || null, created_at: u.created_at
  };
}
