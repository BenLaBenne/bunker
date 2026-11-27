// server/routes/admin.js — API d'administration (toutes vérifiées côté serveur).
// Chaque mutation est journalisée dans admin_logs (admin, action, cible, ancienne/nouvelle valeur).
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../auth.js';
import { now, cleanStr, safeJsonParse, decodeDataUrl, imageDims } from '../util.js';
import { syncMapRows } from '../db/seed.js';

export function adminRoutes(notifier, gameServer) {
  const r = Router();
  r.use(requireAdmin); // ← contrôle serveur sur CHAQUE route

  const log = async (req, action, targetType, targetId, oldValue, newValue) => {
    await db.query(
      `INSERT INTO admin_logs (admin_id, admin_uname, action, target_type, target_id, old_value, new_value, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.user.id, req.user.uname, action, targetType, String(targetId).slice(0, 64),
       oldValue === undefined ? null : JSON.stringify(oldValue), newValue === undefined ? null : JSON.stringify(newValue), now()]
    );
  };

  // ================= Joueurs =================
  r.get('/players', async (req, res) => {
    const q = cleanStr(req.query.q, 16);
    const rows = q
      ? await db.query(`SELECT * FROM users WHERE uname LIKE ? ORDER BY id DESC LIMIT 100`, [`%${q}%`])
      : await db.query(`SELECT * FROM users ORDER BY id DESC LIMIT 100`);
    res.json({ players: rows.map(u => ({
      id: u.id, uname: u.uname, is_admin: !!u.is_admin, banned: !!u.banned,
      suspended_until: u.suspended_until, level: u.level, xp: u.xp, trophies: u.trophies,
      wins: u.wins, kills: u.kills, coins: u.coins, cores: u.cores,
      selected_fighter: u.selected_fighter, lang: u.lang, created_at: u.created_at, last_login: u.last_login
    })) });
  });

  r.put('/players/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rows = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    const u = rows[0];
    if (!u) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const fields = ['uname', 'level', 'xp', 'trophies', 'wins', 'kills', 'coins', 'cores', 'selected_fighter'];
    const old = {}, upd = {};
    for (const f of fields) {
      if (req.body?.[f] !== undefined) {
        old[f] = u[f];
        let v = req.body[f];
        if (f === 'uname') {
          v = cleanStr(v, 16);
          if (!/^[A-Za-z0-9_-]{3,16}$/.test(v)) return res.status(400).json({ error: 'BAD_UNAME' });
          const taken = await db.query('SELECT id FROM users WHERE uname = ? AND id != ?', [v, id]);
          if (taken.length) return res.status(409).json({ error: 'UNAME_TAKEN' });
        } else if (f === 'selected_fighter') {
          v = cleanStr(v, 32);
        } else {
          v = Math.max(0, parseInt(v, 10) || 0);
          if (f === 'level') v = Math.min(50, v);
        }
        upd[f] = v;
      }
    }
    for (const [f, v] of Object.entries(upd)) {
      await db.query(`UPDATE users SET ${f} = ? WHERE id = ?`, [v, id]);
    }
    await log(req, 'player_update', 'user', id, old, upd);
    notifier.pushTo(id, { type: 'profile_updated' });
    res.json({ ok: true, updated: upd });
  });

  r.post('/players/:id/ban', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rows = await db.query('SELECT is_admin FROM users WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    if (rows[0].is_admin && id !== req.user.id) return res.status(403).json({ error: 'CANNOT_BAN_ADMIN' });
    const banned = req.body?.banned ? 1 : 0;
    await db.query('UPDATE users SET banned = ? WHERE id = ?', [banned, id]);
    await log(req, banned ? 'player_ban' : 'player_unban', 'user', id, { banned: !banned }, { banned: !!banned });
    res.json({ ok: true });
  });

  r.post('/players/:id/suspend', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const hours = Math.max(1, parseInt(req.body?.hours, 10) || 24);
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    await db.query('UPDATE users SET suspended_until = ? WHERE id = ?', [req.body?.clear ? null : until, id]);
    await log(req, req.body?.clear ? 'player_unsuspend' : 'player_suspend', 'user', id, null, { until: req.body?.clear ? null : until });
    res.json({ ok: true, until: req.body?.clear ? null : until });
  });

  r.post('/players/:id/admin', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const want = !!req.body?.is_admin;
    const rows = await db.query('SELECT is_admin FROM users WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    // Protection : jamais moins d'un admin actif
    if (!want && rows[0].is_admin) {
      const admins = await db.query('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND banned = 0');
      if (Number(admins[0].c) <= 1) return res.status(403).json({ error: 'LAST_ADMIN' });
    }
    await db.query('UPDATE users SET is_admin = ? WHERE id = ?', [want ? 1 : 0, id]);
    await log(req, 'player_admin_toggle', 'user', id, { is_admin: !!rows[0].is_admin }, { is_admin: want });
    res.json({ ok: true });
  });

  r.post('/players/:id/grant', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const type = ['skin', 'emote', 'tag', 'fx', 'item', 'coins', 'cores', 'xp'].includes(req.body?.type) ? req.body.type : null;
    const itemId = cleanStr(req.body?.itemId, 64);
    const qty = Math.max(1, Math.min(9999, parseInt(req.body?.qty, 10) || 1));
    if (!type) return res.status(400).json({ error: 'BAD_TYPE' });
    if (['coins', 'cores', 'xp'].includes(type)) {
      const col = type;
      await db.query(`UPDATE users SET ${col} = ${col} + ? WHERE id = ?`, [qty, id]);
    } else {
      await db.query(`INSERT INTO inventory (user_id, item_type, item_id, qty, acquired_at) VALUES (?,?,?,?,?)
        ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET qty = inventory.qty + ?`,
        [id, type, itemId || type, qty, now(), qty]);
    }
    await log(req, 'player_grant', 'user', id, null, { type, itemId, qty });
    notifier.pushTo(id, { type: 'gift_received', from: req.user.uname, what: type });
    res.json({ ok: true });
  });

  r.get('/players/:id/inventory', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rows = await db.query('SELECT item_type, item_id, qty FROM inventory WHERE user_id = ?', [id]);
    res.json({ items: rows });
  });

  r.post('/players/:id/inventory/remove', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const type = cleanStr(req.body?.type, 16);
    const itemId = cleanStr(req.body?.itemId, 64);
    await db.query('DELETE FROM inventory WHERE user_id = ? AND item_type = ? AND item_id = ?', [id, type, itemId]);
    await log(req, 'player_inventory_remove', 'user', id, null, { type, itemId });
    res.json({ ok: true });
  });

  // ================= Parties =================
  r.get('/rooms', (_req, res) => {
    res.json({ rooms: gameServer.listRooms() });
  });

  r.get('/matches', async (_req, res) => {
    const rows = await db.query('SELECT * FROM matches ORDER BY id DESC LIMIT 30');
    const out = [];
    for (const m of rows) {
      const players = await db.query('SELECT uname, fighter_id, is_bot, kills, deaths, tasks_done, won, xp_gained FROM match_players WHERE match_id = ?', [m.id]);
      out.push({ id: m.id, map_id: m.map_id, started_at: m.started_at, ended_at: m.ended_at, winner_type: m.winner_type, players });
    }
    res.json({ matches: out });
  });

  // ================= Configuration de jeu =================
  r.get('/config', async (_req, res) => {
    const rows = await db.query('SELECT key, value FROM game_config ORDER BY key');
    res.json({ config: rows.map(x => ({ key: x.key, value: safeJsonParse(x.value, null) })) });
  });

  r.put('/config', async (req, res) => {
    const body = req.body?.config;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'BAD_BODY' });
    const old = {};
    for (const [key, raw] of Object.entries(body)) {
      const rows = await db.query('SELECT value FROM game_config WHERE key = ?', [key]);
      if (!rows.length) continue;
      old[key] = safeJsonParse(rows[0].value, null);
      let value = raw;
      if (typeof old[key] === 'number') value = Number(raw);
      else if (typeof old[key] === 'boolean') value = !!raw;
      else if (typeof old[key] === 'string') value = String(raw).slice(0, 40);
      await db.query('UPDATE game_config SET value = ? WHERE key = ?', [JSON.stringify(value), key]);
    }
    await log(req, 'config_update', 'game_config', 'multiple', old, body);
    res.json({ ok: true });
  });

  // ================= Maps =================
  r.get('/maps', async (_req, res) => {
    const rows = await db.query('SELECT id, name, name_en, published, updated_at FROM maps ORDER BY id');
    res.json({ maps: rows });
  });

  r.get('/maps/:id', async (req, res) => {
    const rows = await db.query('SELECT * FROM maps WHERE id = ?', [req.params.id]);
    const m = rows[0];
    if (!m) return res.status(404).json({ error: 'MAP_NOT_FOUND' });
    res.json({ map: { id: m.id, name: m.name, name_en: m.name_en, description: m.description, description_en: m.description_en, published: m.published, data: safeJsonParse(m.data, null) } });
  });

  r.post('/maps', async (req, res) => {
    let id = cleanStr(req.body?.id, 32).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!id) id = 'map_' + Date.now().toString(36);
    const duplicateOf = cleanStr(req.body?.duplicateOf, 32);
    if (duplicateOf) {
      const src = await db.query('SELECT * FROM maps WHERE id = ?', [duplicateOf]);
      if (!src.length) return res.status(404).json({ error: 'SOURCE_NOT_FOUND' });
      const s = src[0];
      const newId = id !== duplicateOf ? id : s.id + '_copy';
      await db.query(
        `INSERT INTO maps (id, name, name_en, description, description_en, data, published, created_at, updated_at)
         VALUES (?,?,?,?,?,?,0,?,?)`,
        [newId, s.name + ' (copie)', s.name_en + ' (copy)', s.description, s.description_en, s.data, now(), now()]);
      await log(req, 'map_duplicate', 'map', newId, null, { from: duplicateOf });
      return res.json({ ok: true, id: newId });
    }
    const existing = await db.query('SELECT id FROM maps WHERE id = ?', [id]);
    if (existing.length) return res.status(409).json({ error: 'ID_TAKEN' });
    // Map vide par défaut
    const blank = {
      name: req.body?.name || 'Nouvelle map', name_en: req.body?.name_en || 'New map',
      description: '', description_en: '', theme: 'bunker', w: 24, h: 16,
      radiation: { repairTimeS: 360, graceS: 90, armorDrain: 3.5, damage: 5, maxSurviveS: 240 },
      floors: Array.from({ length: 2 }, () => ({ name: 'Étage', name_en: 'Floor', grid: Array.from({ length: 16 }, () => ' '.repeat(24)) })),
      stairs: [], tasks: [], spawns: [{ floor: 0, x: 2, y: 2 }], evac: [], hazardTiles: []
    };
    const floors = Array.from({ length: 2 }, (_, fi) => ({
      name: `Étage ${fi}`, name_en: `Floor ${fi}`,
      grid: Array.from({ length: 16 }, () => ' '.repeat(24))
    }));
    // petit sol de départ praticable
    const g = floors[0].grid.map(row => row.split(''));
    for (let y = 1; y < 15; y++) for (let x = 1; x < 23; x++) g[y][x] = '.';
    floors[0].grid = g.map(row => row.join(''));
    blank.floors = floors;
    await db.query(
      `INSERT INTO maps (id, name, name_en, description, description_en, data, published, created_at, updated_at)
       VALUES (?,?,?,?,?,?,0,?,?)`,
      [id, blank.name, blank.name_en, blank.description, blank.description_en, JSON.stringify(blank), now(), now()]);
    await log(req, 'map_create', 'map', id, null, null);
    res.json({ ok: true, id });
  });

  r.put('/maps/:id', async (req, res) => {
    const id = req.params.id;
    const rows = await db.query('SELECT * FROM maps WHERE id = ?', [id]);
    const m = rows[0];
    if (!m) return res.status(404).json({ error: 'MAP_NOT_FOUND' });
    const old = { name: m.name, published: m.published, data_len: m.data?.length };
    const name = req.body?.name !== undefined ? cleanStr(req.body.name, 40) : m.name;
    const name_en = req.body?.name_en !== undefined ? cleanStr(req.body.name_en, 40) : m.name_en;
    const description = req.body?.description !== undefined ? cleanStr(req.body.description, 200) : m.description;
    const description_en = req.body?.description_en !== undefined ? cleanStr(req.body.description_en, 200) : m.description_en;
    const data = req.body?.data !== undefined ? JSON.stringify(req.body.data) : m.data;
    // Validation basique de la structure si les données changent
    if (req.body?.data !== undefined) {
      const d = req.body.data;
      if (!Array.isArray(d.floors) || !Array.isArray(d.tasks) || !Array.isArray(d.spawns)) {
        return res.status(400).json({ error: 'BAD_MAP_DATA' });
      }
      if (!d.spawns.length) return res.status(400).json({ error: 'NO_SPAWN' });
      const totalWeight = d.tasks.reduce((s, t) => s + (Number(t.weight) || 0), 0);
      if (totalWeight !== 100) return res.status(400).json({ error: 'BAD_WEIGHTS', totalWeight });
    }
    const published = req.body?.published !== undefined ? (req.body.published ? 1 : 0) : m.published;
    await db.query(
      `UPDATE maps SET name = ?, name_en = ?, description = ?, description_en = ?, data = ?, published = ?, updated_at = ? WHERE id = ?`,
      [name, name_en, description, description_en, data, published, now(), id]);
    if (req.body?.data !== undefined) await syncMapRows(id, req.body.data);
    await log(req, 'map_update', 'map', id, old, { name, published, data_len: data.length });
    res.json({ ok: true });
  });

  r.delete('/maps/:id', async (req, res) => {
    const id = req.params.id;
    await db.query('DELETE FROM maps WHERE id = ?', [id]);
    await db.query('DELETE FROM map_tiles WHERE map_id = ?', [id]);
    await db.query('DELETE FROM map_tasks WHERE map_id = ?', [id]);
    await log(req, 'map_delete', 'map', id, null, null);
    res.json({ ok: true });
  });

  // ================= Fighters =================
  r.get('/fighters', async (_req, res) => {
    const rows = await db.query('SELECT * FROM fighters ORDER BY sort');
    res.json({ fighters: rows });
  });

  r.put('/fighters/:id', async (req, res) => {
    const id = req.params.id;
    const rows = await db.query('SELECT * FROM fighters WHERE id = ?', [id]);
    const f = rows[0];
    if (!f) return res.status(404).json({ error: 'FIGHTER_NOT_FOUND' });
    const fields = ['name', 'name_en', 'description', 'description_en', 'rarity', 'price', 'currency',
      'hp', 'speed', 'damage', 'attack_type', 'attack_range', 'attack_cooldown', 'special', 'special_cd', 'repair_mult', 'published', 'sort'];
    const old = {}, upd = {};
    for (const k of fields) {
      if (req.body?.[k] !== undefined) {
        old[k] = f[k];
        let v = req.body[k];
        if (['hp', 'damage', 'price', 'published', 'sort'].includes(k)) v = parseInt(v, 10) || 0;
        else if (['speed', 'attack_range', 'attack_cooldown', 'special_cd', 'repair_mult'].includes(k)) v = Number(v) || 0;
        else v = cleanStr(String(v), 200);
        upd[k] = v;
      }
    }
    for (const [k, v] of Object.entries(upd)) {
      await db.query(`UPDATE fighters SET ${k} = ? WHERE id = ?`, [v, id]);
    }
    await log(req, 'fighter_update', 'fighter', id, old, upd);
    res.json({ ok: true });
  });

  r.post('/fighters', async (req, res) => {
    const id = cleanStr(req.body?.id, 32).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!id) return res.status(400).json({ error: 'BAD_ID' });
    const existing = await db.query('SELECT id FROM fighters WHERE id = ?', [id]);
    if (existing.length) return res.status(409).json({ error: 'ID_TAKEN' });
    await db.query(
      `INSERT INTO fighters (id, name, name_en, description, description_en, rarity, price, currency, hp, speed, damage,
       attack_type, attack_range, attack_cooldown, special, special_cd, repair_mult, published, sort)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,99)`,
      [id, cleanStr(req.body?.name, 24) || id, cleanStr(req.body?.name_en, 24) || id,
       cleanStr(req.body?.description, 200), cleanStr(req.body?.description_en, 200),
       ['commun', 'rare', 'epique', 'legendaire'].includes(req.body?.rarity) ? req.body.rarity : 'commun',
       parseInt(req.body?.price, 10) || 0, req.body?.currency === 'cores' ? 'cores' : 'coins',
       parseInt(req.body?.hp, 10) || 100, Number(req.body?.speed) || 3.8, parseInt(req.body?.damage, 10) || 14,
       req.body?.attack_type === 'melee' ? 'melee' : 'ranged', Number(req.body?.attack_range) || 4.2,
       Number(req.body?.attack_cooldown) || 0.6, cleanStr(req.body?.special, 16), Number(req.body?.special_cd) || 10,
       Number(req.body?.repair_mult) || 1]);
    await log(req, 'fighter_create', 'fighter', id, null, null);
    res.json({ ok: true, id });
  });

  // ================= Skins =================
  r.get('/skins', async (req, res) => {
    const fighterId = cleanStr(req.query.fighterId, 32);
    const rows = fighterId
      ? await db.query('SELECT id, fighter_id, name, rarity, price, currency, data, published FROM skins WHERE fighter_id = ?', [fighterId])
      : await db.query('SELECT id, fighter_id, name, rarity, price, currency, data, published FROM skins');
    res.json({ skins: rows.map(s => ({ ...s, data: safeJsonParse(s.data, null) })) });
  });

  r.post('/skins', async (req, res) => {
    const id = cleanStr(req.body?.id, 64).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const fighterId = cleanStr(req.body?.fighterId, 32);
    if (!id || !fighterId) return res.status(400).json({ error: 'BAD_ID' });
    const existing = await db.query('SELECT id FROM skins WHERE id = ?', [id]);
    if (existing.length) return res.status(409).json({ error: 'ID_TAKEN' });
    const data = typeof req.body?.data === 'object' ? JSON.stringify(req.body.data) : '{}';
    await db.query(
      `INSERT INTO skins (id, fighter_id, name, name_en, rarity, price, currency, data, published, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, fighterId, cleanStr(req.body?.name, 40) || id, cleanStr(req.body?.name_en, 40) || id,
       ['commun', 'rare', 'epique', 'legendaire'].includes(req.body?.rarity) ? req.body.rarity : 'commun',
       parseInt(req.body?.price, 10) || 0, req.body?.currency === 'cores' ? 'cores' : 'coins',
       data, req.body?.published ? 1 : 0, req.user.id, now()]);
    await log(req, 'skin_create', 'skin', id, null, { fighterId });
    res.json({ ok: true, id });
  });

  r.put('/skins/:id', async (req, res) => {
    const id = req.params.id;
    const rows = await db.query('SELECT * FROM skins WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'SKIN_NOT_FOUND' });
    const old = { published: rows[0].published, price: rows[0].price };
    if (req.body?.data !== undefined) {
      await db.query('UPDATE skins SET data = ? WHERE id = ?', [JSON.stringify(req.body.data), id]);
    }
    if (req.body?.published !== undefined) {
      await db.query('UPDATE skins SET published = ? WHERE id = ?', [req.body.published ? 1 : 0, id]);
    }
    if (req.body?.price !== undefined) await db.query('UPDATE skins SET price = ? WHERE id = ?', [parseInt(req.body.price, 10) || 0, id]);
    if (req.body?.name !== undefined) await db.query('UPDATE skins SET name = ? WHERE id = ?', [cleanStr(req.body.name, 40), id]);
    await log(req, 'skin_update', 'skin', id, old, { published: req.body?.published, price: req.body?.price });
    res.json({ ok: true });
  });

  r.delete('/skins/:id', async (req, res) => {
    await db.query('DELETE FROM skins WHERE id = ?', [req.params.id]);
    await log(req, 'skin_delete', 'skin', req.params.id, null, null);
    res.json({ ok: true });
  });

  // ================= Textures =================
  r.get('/textures', async (_req, res) => {
    const rows = await db.query('SELECT id, name, category, rarity, mime, size, published, created_at FROM textures ORDER BY id DESC LIMIT 200');
    res.json({ textures: rows });
  });

  r.post('/textures', async (req, res) => {
    const dec = decodeDataUrl(req.body?.data, ['image/png', 'image/webp', 'image/jpeg'], 300 * 1024);
    if (!dec.ok) return res.status(400).json({ error: dec.error });
    const dims = imageDims(dec.buf, dec.mime);
    if (dims && (dims.w > 1024 || dims.h > 1024)) return res.status(400).json({ error: 'TOO_BIG_DIMS', dims });
    const inserted = await db.query(
      `INSERT INTO textures (name, category, rarity, mime, data, size, published, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
      [cleanStr(req.body?.name, 60) || 'texture', cleanStr(req.body?.category, 24) || 'misc',
       ['commun', 'rare', 'epique'].includes(req.body?.rarity) ? req.body.rarity : 'commun',
       dec.mime, dec.buf, dec.buf.length, req.body?.published === false ? 0 : 1, req.user.id, now()]);
    await log(req, 'texture_upload', 'texture', inserted[0].id, null, { name: req.body?.name, size: dec.buf.length });
    res.json({ ok: true, id: inserted[0].id });
  });

  r.put('/textures/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rows = await db.query('SELECT * FROM textures WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });
    if (req.body?.name !== undefined) await db.query('UPDATE textures SET name = ? WHERE id = ?', [cleanStr(req.body.name, 60), id]);
    if (req.body?.category !== undefined) await db.query('UPDATE textures SET category = ? WHERE id = ?', [cleanStr(req.body.category, 24), id]);
    if (req.body?.rarity !== undefined) await db.query('UPDATE textures SET rarity = ? WHERE id = ?', [cleanStr(req.body.rarity, 12), id]);
    if (req.body?.published !== undefined) await db.query('UPDATE textures SET published = ? WHERE id = ?', [req.body.published ? 1 : 0, id]);
    await log(req, 'texture_update', 'texture', id, null, { name: req.body?.name, published: req.body?.published });
    res.json({ ok: true });
  });

  r.delete('/textures/:id', async (req, res) => {
    await db.query('DELETE FROM textures WHERE id = ?', [req.params.id]);
    await log(req, 'texture_delete', 'texture', req.params.id, null, null);
    res.json({ ok: true });
  });

  // ================= Boutique =================
  r.get('/shop', async (_req, res) => {
    const rows = await db.query('SELECT * FROM shop_items ORDER BY category, price');
    res.json({ items: rows.map(s => ({ ...s, payload: safeJsonParse(s.payload, {}) })) });
  });

  r.post('/shop', async (req, res) => {
    const id = cleanStr(req.body?.id, 64).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!id) return res.status(400).json({ error: 'BAD_ID' });
    const existing = await db.query('SELECT id FROM shop_items WHERE id = ?', [id]);
    if (existing.length) return res.status(409).json({ error: 'ID_TAKEN' });
    await db.query(
      `INSERT INTO shop_items (id, name, name_en, description, description_en, category, rarity, price, currency, available, image, payload, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, cleanStr(req.body?.name, 40) || id, cleanStr(req.body?.name_en, 40) || id,
       cleanStr(req.body?.description, 200), cleanStr(req.body?.description_en, 200),
       ['skins', 'emotes', 'tags', 'effects', 'cosmetics'].includes(req.body?.category) ? req.body.category : 'cosmetics',
       ['commun', 'rare', 'epique', 'legendaire'].includes(req.body?.rarity) ? req.body.rarity : 'commun',
       parseInt(req.body?.price, 10) || 100, req.body?.currency === 'cores' ? 'cores' : 'coins',
       req.body?.available === false ? 0 : 1, parseInt(req.body?.image, 10) || null,
       JSON.stringify(req.body?.payload || {}), now()]);
    await log(req, 'shop_create', 'shop_item', id, null, null);
    res.json({ ok: true, id });
  });

  r.put('/shop/:id', async (req, res) => {
    const id = req.params.id;
    const rows = await db.query('SELECT * FROM shop_items WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
    const fields = ['name', 'name_en', 'description', 'description_en', 'category', 'rarity', 'currency', 'image', 'payload'];
    for (const k of fields) {
      if (req.body?.[k] !== undefined) {
        let v = req.body[k];
        if (k === 'image') v = parseInt(v, 10) || null;
        else if (k === 'payload') v = JSON.stringify(v);
        else v = cleanStr(String(v), 200);
        await db.query(`UPDATE shop_items SET ${k} = ? WHERE id = ?`, [v, id]);
      }
    }
    if (req.body?.price !== undefined) await db.query('UPDATE shop_items SET price = ? WHERE id = ?', [parseInt(req.body.price, 10) || 0, id]);
    if (req.body?.available !== undefined) await db.query('UPDATE shop_items SET available = ? WHERE id = ?', [req.body.available ? 1 : 0, id]);
    await log(req, 'shop_update', 'shop_item', id, null, req.body);
    res.json({ ok: true });
  });

  r.delete('/shop/:id', async (req, res) => {
    await db.query('DELETE FROM shop_items WHERE id = ?', [req.params.id]);
    await log(req, 'shop_delete', 'shop_item', req.params.id, null, null);
    res.json({ ok: true });
  });

  // ================= Quêtes =================
  r.get('/quests', async (_req, res) => {
    const rows = await db.query('SELECT * FROM quests ORDER BY sort');
    res.json({ quests: rows });
  });

  r.post('/quests', async (req, res) => {
    const id = cleanStr(req.body?.id, 64).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!id) return res.status(400).json({ error: 'BAD_ID' });
    const existing = await db.query('SELECT id FROM quests WHERE id = ?', [id]);
    if (existing.length) return res.status(409).json({ error: 'ID_TAKEN' });
    await db.query(
      `INSERT INTO quests (id, type, stat, goal, reward_xp, reward_coins, reward_cores, name, name_en, icon, published, sort)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ['daily', 'weekly', 'seasonal'].includes(req.body?.type) ? req.body.type : 'daily',
       ['kills', 'tasks', 'wins', 'matches', 'damage'].includes(req.body?.stat) ? req.body.stat : 'kills',
       Math.max(1, parseInt(req.body?.goal, 10) || 3),
       parseInt(req.body?.reward_xp, 10) || 0, parseInt(req.body?.reward_coins, 10) || 0, parseInt(req.body?.reward_cores, 10) || 0,
       cleanStr(req.body?.name, 60) || id, cleanStr(req.body?.name_en, 60) || id,
       cleanStr(req.body?.icon, 8) || '⚔', req.body?.published === false ? 0 : 1, parseInt(req.body?.sort, 10) || 50]);
    await log(req, 'quest_create', 'quest', id, null, null);
    res.json({ ok: true, id });
  });

  r.put('/quests/:id', async (req, res) => {
    const id = req.params.id;
    const rows = await db.query('SELECT * FROM quests WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'QUEST_NOT_FOUND' });
    const fields = ['type', 'stat', 'goal', 'reward_xp', 'reward_coins', 'reward_cores', 'name', 'name_en', 'icon', 'published', 'sort'];
    for (const k of fields) {
      if (req.body?.[k] !== undefined) {
        let v = req.body[k];
        if (['goal', 'reward_xp', 'reward_coins', 'reward_cores', 'published', 'sort'].includes(k)) v = parseInt(v, 10) || 0;
        else v = cleanStr(String(v), 60);
        await db.query(`UPDATE quests SET ${k} = ? WHERE id = ?`, [v, id]);
      }
    }
    await log(req, 'quest_update', 'quest', id, null, req.body);
    res.json({ ok: true });
  });

  r.delete('/quests/:id', async (req, res) => {
    await db.query('DELETE FROM quests WHERE id = ?', [req.params.id]);
    await log(req, 'quest_delete', 'quest', req.params.id, null, null);
    res.json({ ok: true });
  });

  // ================= Pass =================
  r.get('/pass', async (_req, res) => {
    const rows = await db.query('SELECT * FROM pass_rewards ORDER BY level');
    res.json({ rewards: rows });
  });

  r.put('/pass/:level', async (req, res) => {
    const level = parseInt(req.params.level, 10);
    if (!(level >= 1 && level <= 50)) return res.status(400).json({ error: 'BAD_LEVEL' });
    const oldRows = await db.query('SELECT * FROM pass_rewards WHERE level = ?', [level]);
    const type = ['coins', 'cores', 'xp', 'skin', 'emote', 'tag', 'fx', 'item'].includes(req.body?.type) ? req.body.type : null;
    if (!type) return res.status(400).json({ error: 'BAD_TYPE' });
    await db.query('UPDATE pass_rewards SET type = ?, id = ?, qty = ? WHERE level = ?',
      [type, cleanStr(req.body?.id, 64), Math.max(1, parseInt(req.body?.qty, 10) || 1), level]);
    await log(req, 'pass_reward_update', 'pass', level, oldRows[0], req.body);
    res.json({ ok: true });
  });

  // ================= Nouveautés =================
  r.get('/news', async (_req, res) => {
    const rows = await db.query('SELECT * FROM news ORDER BY created_at DESC LIMIT 100');
    res.json({ news: rows });
  });

  r.post('/news', async (req, res) => {
    const inserted = await db.query(
      `INSERT INTO news (title, title_en, body, body_en, image, author, published, created_at)
       VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
      [cleanStr(req.body?.title, 80) || 'Sans titre', cleanStr(req.body?.title_en, 80) || '',
       cleanStr(req.body?.body, 2000), cleanStr(req.body?.body_en, 2000),
       parseInt(req.body?.image, 10) || null, req.user.uname, req.body?.published ? 1 : 0, now()]);
    await log(req, 'news_create', 'news', inserted[0].id, null, { title: req.body?.title });
    res.json({ ok: true, id: inserted[0].id });
  });

  r.put('/news/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const fields = ['title', 'title_en', 'body', 'body_en'];
    for (const k of fields) {
      if (req.body?.[k] !== undefined) await db.query(`UPDATE news SET ${k} = ? WHERE id = ?`, [cleanStr(req.body[k], 2000), id]);
    }
    if (req.body?.image !== undefined) await db.query('UPDATE news SET image = ? WHERE id = ?', [parseInt(req.body.image, 10) || null, id]);
    if (req.body?.published !== undefined) await db.query('UPDATE news SET published = ? WHERE id = ?', [req.body.published ? 1 : 0, id]);
    await log(req, 'news_update', 'news', id, null, req.body);
    res.json({ ok: true });
  });

  r.delete('/news/:id', async (req, res) => {
    await db.query('DELETE FROM news WHERE id = ?', [req.params.id]);
    await log(req, 'news_delete', 'news', req.params.id, null, null);
    res.json({ ok: true });
  });

  // ================= Notifications =================
  r.post('/notifications', async (req, res) => {
    const target = req.body?.userId === 'all' ? null : parseInt(req.body?.userId, 10) || null;
    await db.query('INSERT INTO notifications (user_id, type, title, body, created_at) VALUES (?,?,?,?,?)',
      [target, cleanStr(req.body?.type, 16) || 'info', cleanStr(req.body?.title, 80), cleanStr(req.body?.body, 500), now()]);
    await log(req, 'notification_send', target ? 'user' : 'all', target || 'all', null, { title: req.body?.title });
    res.json({ ok: true });
  });

  // ================= Cadeaux =================
  r.get('/gifts', async (_req, res) => {
    const rows = await db.query('SELECT * FROM gifts ORDER BY created_at DESC LIMIT 100');
    res.json({ gifts: rows });
  });

  r.post('/gifts', async (req, res) => {
    const reward_type = ['coins', 'cores', 'xp', 'trophies', 'skin', 'emote', 'tag', 'fx', 'item'].includes(req.body?.reward_type) ? req.body.reward_type : null;
    if (!reward_type) return res.status(400).json({ error: 'BAD_REWARD_TYPE' });
    let targets = 'all';
    if (Array.isArray(req.body?.targets) && req.body.targets.length) {
      targets = JSON.stringify(req.body.targets.slice(0, 200).map(Number).filter(Number.isFinite));
    } else if (Number.isFinite(parseInt(req.body?.userId, 10))) {
      targets = JSON.stringify([parseInt(req.body.userId, 10)]);
    }
    const inserted = await db.query(
      `INSERT INTO gifts (title, message, reward_type, reward_id, qty, targets, expires_at, max_claims, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [cleanStr(req.body?.title, 80) || 'Cadeau', cleanStr(req.body?.message, 300),
       reward_type, cleanStr(req.body?.reward_id, 64), Math.max(1, parseInt(req.body?.qty, 10) || 1),
       targets, req.body?.expires_at || null, Math.max(0, parseInt(req.body?.max_claims, 10) || 0),
       req.user.id, now()]);
    await log(req, 'gift_create', 'gift', inserted[0].id, null, { title: req.body?.title, reward_type });
    // Notification à tous les ciblés
    if (targets === 'all') {
      const users = await db.query('SELECT id FROM users WHERE banned = 0');
      for (const u of users) notifier.pushTo(u.id, { type: 'gift_received', from: req.user.uname });
    } else {
      for (const uid of JSON.parse(targets)) notifier.pushTo(uid, { type: 'gift_received', from: req.user.uname });
    }
    res.json({ ok: true, id: inserted[0].id });
  });

  r.delete('/gifts/:id', async (req, res) => {
    await db.query('DELETE FROM gifts WHERE id = ?', [req.params.id]);
    await log(req, 'gift_delete', 'gift', req.params.id, null, null);
    res.json({ ok: true });
  });

  // ================= Clans =================
  r.get('/clans', async (_req, res) => {
    const rows = await db.query(
      `SELECT c.*, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS members
       FROM clans c ORDER BY c.id DESC LIMIT 100`);
    res.json({ clans: rows });
  });

  r.put('/clans/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const fields = ['name', 'tag', 'emblem', 'emblem_color', 'description', 'trophies', 'wins', 'level'];
    const oldRows = await db.query('SELECT * FROM clans WHERE id = ?', [id]);
    if (!oldRows.length) return res.status(404).json({ error: 'CLAN_NOT_FOUND' });
    for (const k of fields) {
      if (req.body?.[k] !== undefined) {
        let v = req.body[k];
        if (['trophies', 'wins', 'level'].includes(k)) v = parseInt(v, 10) || 0;
        else v = cleanStr(String(v), 160);
        await db.query(`UPDATE clans SET ${k} = ? WHERE id = ?`, [v, id]);
      }
    }
    await log(req, 'clan_update', 'clan', id, { name: oldRows[0].name, trophies: oldRows[0].trophies }, req.body);
    res.json({ ok: true });
  });

  r.delete('/clans/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    await db.query('DELETE FROM clans WHERE id = ?', [id]);
    await db.query('DELETE FROM clan_members WHERE clan_id = ?', [id]);
    await db.query('DELETE FROM clan_messages WHERE clan_id = ?', [id]);
    await db.query('DELETE FROM clan_invites WHERE clan_id = ?', [id]);
    await log(req, 'clan_delete', 'clan', id, null, null);
    res.json({ ok: true });
  });

  // ================= Sons (synthèse / fichier par son) =================
  r.get('/sounds', async (_req, res) => {
    const rows = await db.query('SELECT id, name, mode, params, mime, length(file) AS file_size FROM sounds ORDER BY id');
    res.json({ sounds: rows.map(s => ({ ...s, params: safeJsonParse(s.params, {}) })) });
  });

  r.put('/sounds/:id', async (req, res) => {
    const id = req.params.id;
    const rows = await db.query('SELECT * FROM sounds WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'SOUND_NOT_FOUND' });
    const old = { mode: rows[0].mode, params: rows[0].params };
    if (req.body?.mode !== undefined) {
      const mode = req.body.mode === 'file' ? 'file' : 'synth';
      // Impossible de passer en mode fichier sans fichier
      if (mode === 'file' && !rows[0].file) return res.status(400).json({ error: 'NO_FILE_UPLOADED' });
      await db.query('UPDATE sounds SET mode = ? WHERE id = ?', [mode, id]);
    }
    if (req.body?.params !== undefined && typeof req.body.params === 'object') {
      // paramètres de synthèse autorisés
      const p = {};
      for (const k of ['type', 'freq', 'freq2', 'dur', 'vol', 'slide', 'noise', 'loop']) {
        if (req.body.params[k] !== undefined) {
          p[k] = ['type', 'loop'].includes(k) ? String(req.body.params[k]).slice(0, 12) : Number(req.body.params[k]) || 0;
        }
      }
      await db.query('UPDATE sounds SET params = ? WHERE id = ?', [JSON.stringify(p), id]);
    }
    if (req.body?.name !== undefined) await db.query('UPDATE sounds SET name = ? WHERE id = ?', [cleanStr(req.body.name, 40), id]);
    await log(req, 'sound_update', 'sound', id, old, req.body);
    res.json({ ok: true });
  });

  r.post('/sounds/:id/file', async (req, res) => {
    const id = req.params.id;
    const rows = await db.query('SELECT id FROM sounds WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'SOUND_NOT_FOUND' });
    const dec = decodeDataUrl(req.body?.data, ['audio/ogg', 'audio/mpeg', 'audio/wav'], 400 * 1024);
    if (!dec.ok) return res.status(400).json({ error: dec.error });
    await db.query('UPDATE sounds SET file = ?, mime = ?, mode = ? WHERE id = ?', [dec.buf, dec.mime, 'file', id]);
    await log(req, 'sound_file_upload', 'sound', id, null, { mime: dec.mime, size: dec.buf.length });
    res.json({ ok: true, mode: 'file' });
  });

  r.post('/sounds/:id/synth', async (req, res) => {
    const id = req.params.id;
    await db.query('UPDATE sounds SET mode = ? WHERE id = ?', ['synth', id]);
    await log(req, 'sound_mode_synth', 'sound', id, null, null);
    res.json({ ok: true, mode: 'synth' });
  });

  // ================= Logs =================
  r.get('/logs', async (req, res) => {
    const action = cleanStr(req.query.action, 40);
    const rows = action
      ? await db.query('SELECT * FROM admin_logs WHERE action LIKE ? ORDER BY id DESC LIMIT 200', [`%${action}%`])
      : await db.query('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 200');
    res.json({ logs: rows.map(l => ({
      id: l.id, admin_uname: l.admin_uname, action: l.action, target_type: l.target_type,
      target_id: l.target_id, old_value: safeJsonParse(l.old_value, null), new_value: safeJsonParse(l.new_value, null),
      created_at: l.created_at
    })) });
  });

  return r;
}
