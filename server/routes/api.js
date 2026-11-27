// server/routes/api.js — Authentification + données publiques du jeu.
import { Router } from 'express';
import { db } from '../db/index.js';
import { hashPassword, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie, requireAuth, publicUser } from '../auth.js';
import { validateUname, validatePassword, validateSettings } from '../validate.js';
import { limit } from '../ratelimit.js';
import { now, safeJsonParse } from '../util.js';

export function apiRoutes(notifier) {
  const r = Router();

  r.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

  // ---------- Auth ----------
  r.post('/auth/register', limit(12, 5 * 60000), async (req, res) => {
    try {
      const uname = String(req.body?.uname || '').trim();
      const pword = String(req.body?.pword || '');
      if (!validateUname(uname)) return res.status(400).json({ error: 'BAD_UNAME' });
      if (!validatePassword(pword)) return res.status(400).json({ error: 'BAD_PWORD' });
      const existing = await db.query('SELECT id FROM users WHERE uname = ?', [uname]);
      if (existing.length) return res.status(409).json({ error: 'UNAME_TAKEN' });
      const hash = await hashPassword(pword);
      const countRows = await db.query('SELECT COUNT(*) AS c FROM users');
      const isFirst = Number(countRows[0].c) === 0;
      const inserted = await db.query(
        `INSERT INTO users (uname, password_hash, is_admin, created_at, last_login) VALUES (?,?,?,?,?) RETURNING id`,
        [uname, hash, isFirst ? 1 : 0, now(), now()]
      );
      const userId = inserted[0].id;
      if (isFirst) console.log(`[auth] Premier compte inscrit → admin : ${uname}`);
      // Dons de départ
      await db.query(`INSERT INTO inventory (user_id, item_type, item_id, qty, acquired_at) VALUES (?,?,?,?,?)
        ON CONFLICT (user_id, item_type, item_id) DO NOTHING`, [userId, 'fighter', 'rust', 1, now()]);
      await db.query(`INSERT INTO inventory (user_id, item_type, item_id, qty, acquired_at) VALUES (?,?,?,?,?)
        ON CONFLICT (user_id, item_type, item_id) DO NOTHING`, [userId, 'fighter', 'brick', 1, now()]);
      const token = await createSession(userId);
      setSessionCookie(res, req, token);
      const rows = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
      res.json({ user: publicUser(rows[0]) });
    } catch (err) { console.error('[register]', err); res.status(500).json({ error: 'SERVER_ERROR' }); }
  });

  r.post('/auth/login', limit(15, 5 * 60000), async (req, res) => {
    try {
      const uname = String(req.body?.uname || '').trim();
      const pword = String(req.body?.pword || '');
      const rows = await db.query('SELECT * FROM users WHERE uname = ?', [uname]);
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'BAD_CREDENTIALS' });
      if (user.banned) return res.status(403).json({ error: 'BANNED' });
      if (user.suspended_until && new Date(user.suspended_until) > new Date()) {
        return res.status(403).json({ error: 'SUSPENDED', until: user.suspended_until });
      }
      const ok = await verifyPassword(pword, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'BAD_CREDENTIALS' });
      await db.query('UPDATE users SET last_login = ? WHERE id = ?', [now(), user.id]);
      const token = await createSession(user.id);
      setSessionCookie(res, req, token);
      res.json({ user: publicUser(user) });
    } catch (err) { console.error('[login]', err); res.status(500).json({ error: 'SERVER_ERROR' }); }
  });

  r.post('/auth/logout', async (req, res) => {
    await destroySession(req.sessionToken);
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // ---------- Méta-données publiques (boot du lobby) ----------
  r.get('/meta', async (_req, res) => {
    try {
      const fighters = await db.query('SELECT * FROM fighters WHERE published = 1 ORDER BY sort');
      const maps = await db.query('SELECT id, name, name_en, description, description_en FROM maps WHERE published = 1 ORDER BY id');
      const shop = await db.query('SELECT * FROM shop_items WHERE available = 1 ORDER BY price');
      const quests = await db.query('SELECT * FROM quests WHERE published = 1 ORDER BY sort');
      const pass = await db.query('SELECT * FROM pass_rewards ORDER BY level');
      const sounds = await db.query('SELECT id, name, mode FROM sounds ORDER BY id');
      const cfgRows = await db.query('SELECT key, value FROM game_config');
      const config = {};
      for (const row of cfgRows) config[row.key] = safeJsonParse(row.value, null);
      res.json({
        fighters: fighters.map(f => ({
          id: f.id, name: f.name, name_en: f.name_en, description: f.description, description_en: f.description_en,
          rarity: f.rarity, price: f.price, currency: f.currency, hp: f.hp, speed: f.speed, damage: f.damage,
          attack_type: f.attack_type, attack_range: f.attack_range, attack_cooldown: f.attack_cooldown,
          special: f.special, special_cd: f.special_cd, repair_mult: f.repair_mult
        })),
        maps: maps.map(m => ({ id: m.id, name: m.name, name_en: m.name_en, description: m.description, description_en: m.description_en })),
        shop: shop.map(s => ({
          id: s.id, name: s.name, name_en: s.name_en, description: s.description, description_en: s.description_en,
          category: s.category, rarity: s.rarity, price: s.price, currency: s.currency, image: s.image,
          payload: safeJsonParse(s.payload, {})
        })),
        quests: quests.map(q => ({
          id: q.id, type: q.type, stat: q.stat, goal: q.goal, reward_xp: q.reward_xp,
          reward_coins: q.reward_coins, reward_cores: q.reward_cores, name: q.name, name_en: q.name_en, icon: q.icon
        })),
        pass: pass.map(p => ({ level: p.level, type: p.type, id: p.id, qty: p.qty })),
        sounds: sounds.map(s => ({ id: s.id, name: s.name, mode: s.mode })),
        config
      });
    } catch (err) { console.error('[meta]', err); res.status(500).json({ error: 'SERVER_ERROR' }); }
  });

  // ---------- Réglages du joueur ----------
  r.post('/me/settings', requireAuth, async (req, res) => {
    const settings = validateSettings(req.body?.settings ?? {});
    const lang = ['fr', 'en'].includes(req.body?.lang) ? req.body.lang : null;
    const current = typeof req.user.settings === 'string' ? safeJsonParse(req.user.settings, {}) : (req.user.settings || {});
    const merged = { ...current, ...settings };
    if (lang) {
      await db.query('UPDATE users SET settings = ?, lang = ? WHERE id = ?', [JSON.stringify(merged), lang, req.user.id]);
    } else {
      await db.query('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify(merged), req.user.id]);
    }
    res.json({ ok: true, settings: merged, lang: lang || req.user.lang });
  });

  r.post('/me/select', requireAuth, async (req, res) => {
    const fighter = String(req.body?.fighter || '').slice(0, 32);
    const skin = String(req.body?.skin || '').slice(0, 64);
    if (fighter) {
      const owned = await db.query('SELECT 1 FROM inventory WHERE user_id = ? AND item_type = ?', [req.user.id, 'fighter']);
      const published = await db.query('SELECT 1 FROM fighters WHERE id = ? AND published = 1 AND price = 0', [fighter]);
      const ownedF = await db.query('SELECT 1 FROM inventory WHERE user_id = ? AND item_type = ? AND item_id = ?', [req.user.id, 'fighter', fighter]);
      if (!published.length && !ownedF.length && !owned.length) return res.status(403).json({ error: 'FIGHTER_NOT_OWNED' });
      await db.query('UPDATE users SET selected_fighter = ? WHERE id = ?', [fighter, req.user.id]);
    }
    if (skin !== undefined) {
      if (skin) {
        const ownedSkin = await db.query('SELECT 1 FROM inventory WHERE user_id = ? AND item_type = ? AND item_id = ?', [req.user.id, 'skin', skin]);
        const freeSkin = await db.query('SELECT 1 FROM skins WHERE id = ? AND published = 1 AND price = 0', [skin]);
        if (!ownedSkin.length && !freeSkin.length) return res.status(403).json({ error: 'SKIN_NOT_OWNED' });
      }
      await db.query('UPDATE users SET selected_skin = ? WHERE id = ?', [skin, req.user.id]);
    }
    res.json({ ok: true });
  });

  // ---------- Inventaire ----------
  r.get('/inventory', requireAuth, async (req, res) => {
    const rows = await db.query('SELECT item_type, item_id, qty FROM inventory WHERE user_id = ?', [req.user.id]);
    res.json({ items: rows.map(r => ({ type: r.item_type, id: r.item_id, qty: r.qty })) });
  });

  // ---------- Boutique / achats ----------
  r.post('/shop/buy', requireAuth, limit(30, 60000), async (req, res) => {
    const itemId = String(req.body?.itemId || '').slice(0, 64);
    const rows = await db.query('SELECT * FROM shop_items WHERE id = ? AND available = 1', [itemId]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
    const userRows = await db.query('SELECT coins, cores FROM users WHERE id = ?', [req.user.id]);
    const u = userRows[0];
    const balance = item.currency === 'cores' ? u.cores : u.coins;
    if (balance < item.price) return res.status(402).json({ error: 'NOT_ENOUGH' });
    // Déjà possédé ?
    const typeByCat = { skins: 'skin', emotes: 'emote', tags: 'tag', effects: 'fx' };
    const invType = typeByCat[item.category] || 'item';
    if (invType !== 'item') {
      const owned = await db.query('SELECT 1 FROM inventory WHERE user_id = ? AND item_type = ? AND item_id = ?', [req.user.id, invType, item.id]);
      if (owned.length) return res.status(409).json({ error: 'ALREADY_OWNED' });
    }
    const newBalance = balance - item.price;
    if (item.currency === 'cores') await db.query('UPDATE users SET cores = ? WHERE id = ?', [newBalance, req.user.id]);
    else await db.query('UPDATE users SET coins = ? WHERE id = ?', [newBalance, req.user.id]);
    await db.query(`INSERT INTO inventory (user_id, item_type, item_id, qty, acquired_at) VALUES (?,?,?,?,?)
      ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET qty = inventory.qty + 1`, [req.user.id, invType, item.id, 1, now()]);
    if (item.category === 'skins') {
      const payload = safeJsonParse(item.payload, {});
      if (payload.skinId) {
        await db.query(`INSERT INTO inventory (user_id, item_type, item_id, qty, acquired_at) VALUES (?,?,?,?,?)
          ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET qty = inventory.qty + 1`,
          [req.user.id, 'skin', payload.skinId, 1, now()]);
      }
    }
    res.json({ ok: true, coins: item.currency === 'coins' ? newBalance : u.coins, cores: item.currency === 'cores' ? newBalance : u.cores });
  });

  r.post('/fighters/buy', requireAuth, limit(30, 60000), async (req, res) => {
    const fid = String(req.body?.fighterId || '').slice(0, 32);
    const rows = await db.query('SELECT * FROM fighters WHERE id = ? AND published = 1', [fid]);
    const f = rows[0];
    if (!f) return res.status(404).json({ error: 'FIGHTER_NOT_FOUND' });
    const owned = await db.query('SELECT 1 FROM inventory WHERE user_id = ? AND item_type = ? AND item_id = ?', [req.user.id, 'fighter', fid]);
    if (owned.length || f.price === 0) return res.status(409).json({ error: 'ALREADY_OWNED' });
    const userRows = await db.query('SELECT coins, cores FROM users WHERE id = ?', [req.user.id]);
    const u = userRows[0];
    const balance = f.currency === 'cores' ? u.cores : u.coins;
    if (balance < f.price) return res.status(402).json({ error: 'NOT_ENOUGH' });
    const newBalance = balance - f.price;
    if (f.currency === 'cores') await db.query('UPDATE users SET cores = ? WHERE id = ?', [newBalance, req.user.id]);
    else await db.query('UPDATE users SET coins = ? WHERE id = ?', [newBalance, req.user.id]);
    await db.query('INSERT INTO inventory (user_id, item_type, item_id, qty, acquired_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING',
      [req.user.id, 'fighter', fid, 1, now()]);
    res.json({ ok: true, coins: f.currency === 'coins' ? newBalance : u.coins, cores: f.currency === 'cores' ? newBalance : u.cores });
  });

  r.post('/skins/buy', requireAuth, limit(30, 60000), async (req, res) => {
    const sid = String(req.body?.skinId || '').slice(0, 64);
    const rows = await db.query('SELECT * FROM skins WHERE id = ? AND published = 1', [sid]);
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'SKIN_NOT_FOUND' });
    const owned = await db.query('SELECT 1 FROM inventory WHERE user_id = ? AND item_type = ? AND item_id = ?', [req.user.id, 'skin', sid]);
    if (owned.length || s.price === 0) return res.status(409).json({ error: 'ALREADY_OWNED' });
    const userRows = await db.query('SELECT coins, cores FROM users WHERE id = ?', [req.user.id]);
    const u = userRows[0];
    const balance = s.currency === 'cores' ? u.cores : u.coins;
    if (balance < s.price) return res.status(402).json({ error: 'NOT_ENOUGH' });
    const newBalance = balance - s.price;
    if (s.currency === 'cores') await db.query('UPDATE users SET cores = ? WHERE id = ?', [newBalance, req.user.id]);
    else await db.query('UPDATE users SET coins = ? WHERE id = ?', [newBalance, req.user.id]);
    await db.query('INSERT INTO inventory (user_id, item_type, item_id, qty, acquired_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING',
      [req.user.id, 'skin', sid, 1, now()]);
    res.json({ ok: true });
  });

  // ---------- Aperçus publics ----------
  r.get('/map-preview/:id', async (req, res) => {
    const rows = await db.query('SELECT data FROM maps WHERE id = ? AND published = 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'MAP_NOT_FOUND' });
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    res.json({ data: { w: data.w, h: data.h, floors: data.floors, tasks: data.tasks } });
  });

  // Données de skins publiées (pixels) — utilisées par le rendu de jeu
  r.get('/skins', async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 30);
    if (!ids.length) return res.json({ skins: [] });
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.query(
      `SELECT id, fighter_id, data FROM skins WHERE published = 1 AND id IN (${placeholders})`, ids);
    res.json({ skins: rows.map(s => ({ id: s.id, fighter_id: s.fighter_id, data: safeJsonParse(s.data, {}) })) });
  });

  return r;
}
