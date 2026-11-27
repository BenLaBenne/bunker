// server/routes/meta.js — Systèmes joueur : pass, quêtes, cadeaux, notifications,
// news, classements, amis, clans, textures et sons.
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../auth.js';
import { limit } from '../ratelimit.js';
import { now, cleanStr, safeJsonParse } from '../util.js';

export function metaRoutes(notifier) {
  const r = Router();

  // ---------- Pass ----------
  r.get('/pass', requireAuth, async (req, res) => {
    const rewards = await db.query('SELECT * FROM pass_rewards ORDER BY level');
    const claimed = await db.query('SELECT level FROM pass_progress WHERE user_id = ? AND claimed = 1', [req.user.id]);
    const claimedSet = new Set(claimed.map(c => c.level));
    const level = req.user.level;
    res.json({
      level, xp: req.user.xp,
      rewards: rewards.map(rw => ({ ...rw, claimed: claimedSet.has(rw.level), claimable: rw.level <= level && !claimedSet.has(rw.level) }))
    });
  });

  r.post('/pass/claim', requireAuth, async (req, res) => {
    const level = parseInt(req.body?.level, 10);
    if (!(level >= 1 && level <= 50)) return res.status(400).json({ error: 'BAD_LEVEL' });
    if (level > req.user.level) return res.status(403).json({ error: 'LEVEL_TOO_LOW' });
    const existing = await db.query('SELECT 1 FROM pass_progress WHERE user_id = ? AND level = ? AND claimed = 1', [req.user.id, level]);
    if (existing.length) return res.status(409).json({ error: 'ALREADY_CLAIMED' });
    const rewards = await db.query('SELECT * FROM pass_rewards WHERE level = ?', [level]);
    const rw = rewards[0];
    if (!rw) return res.status(404).json({ error: 'REWARD_NOT_FOUND' });
    await grantReward(req.user.id, rw.type, rw.id, rw.qty);
    await db.query(`INSERT INTO pass_progress (user_id, level, claimed, claimed_at) VALUES (?,?,1,?)
      ON CONFLICT (user_id, level) DO UPDATE SET claimed = 1`, [req.user.id, level, now()]);
    res.json({ ok: true, reward: rw });
  });

  // ---------- Quêtes ----------
  r.get('/quests', requireAuth, async (req, res) => {
    const quests = await db.query('SELECT * FROM quests WHERE published = 1 ORDER BY sort');
    const progress = await db.query('SELECT * FROM quest_progress WHERE user_id = ?', [req.user.id]);
    const pmap = new Map(progress.map(p => [`${p.quest_id}|${p.period}`, p]));
    const periods = currentPeriods();
    const out = [];
    for (const q of quests) {
      const period = q.type === 'daily' ? periods.daily : q.type === 'weekly' ? periods.weekly : periods.seasonal;
      const p = pmap.get(`${q.id}|${period}`) || { progress: 0, claimed: 0 };
      out.push({
        id: q.id, type: q.type, stat: q.stat, name: q.name, name_en: q.name_en, icon: q.icon, goal: q.goal,
        reward_xp: q.reward_xp, reward_coins: q.reward_coins, reward_cores: q.reward_cores,
        progress: p.progress || 0, claimed: !!p.claimed, claimable: !p.claimed && (p.progress || 0) >= q.goal
      });
    }
    res.json({ quests: out });
  });

  r.post('/quests/claim', requireAuth, limit(20, 60000), async (req, res) => {
    const qid = String(req.body?.questId || '').slice(0, 64);
    const quests = await db.query('SELECT * FROM quests WHERE id = ? AND published = 1', [qid]);
    const q = quests[0];
    if (!q) return res.status(404).json({ error: 'QUEST_NOT_FOUND' });
    const periods = currentPeriods();
    const period = q.type === 'daily' ? periods.daily : q.type === 'weekly' ? periods.weekly : periods.seasonal;
    const rows = await db.query('SELECT * FROM quest_progress WHERE user_id = ? AND quest_id = ? AND period = ?', [req.user.id, qid, period]);
    if (!rows.length || rows[0].claimed) return res.status(409).json({ error: 'NOT_CLAIMABLE' });
    if ((rows[0].progress || 0) < q.goal) return res.status(403).json({ error: 'GOAL_NOT_REACHED' });
    await db.query('UPDATE quest_progress SET claimed = 1 WHERE user_id = ? AND quest_id = ? AND period = ?', [req.user.id, qid, period]);
    await db.query('UPDATE users SET xp = xp + ?, coins = coins + ?, cores = cores + ? WHERE id = ?',
      [q.reward_xp, q.reward_coins, q.reward_cores, req.user.id]);
    res.json({ ok: true, reward: { xp: q.reward_xp, coins: q.reward_coins, cores: q.reward_cores } });
  });

  // ---------- Cadeaux ----------
  r.get('/gifts', requireAuth, async (req, res) => {
    const gifts = await db.query('SELECT * FROM gifts ORDER BY created_at DESC LIMIT 50');
    const claims = await db.query('SELECT gift_id FROM gift_claims WHERE user_id = ?', [req.user.id]);
    const claimedSet = new Set(claims.map(c => c.gift_id));
    const out = [];
    for (const g of gifts) {
      const targets = g.targets === 'all' ? 'all' : safeJsonParse(g.targets, []);
      if (targets !== 'all' && !targets.includes(req.user.id)) continue;
      const expired = g.expires_at && new Date(g.expires_at) < new Date();
      if (expired) continue;
      const limitReached = g.max_claims > 0 && g.claimed >= g.max_claims;
      out.push({
        id: g.id, title: g.title, message: g.message, reward_type: g.reward_type,
        reward_id: g.reward_id, qty: g.qty, expires_at: g.expires_at,
        claimed: claimedSet.has(g.id), claimable: !claimedSet.has(g.id) && !limitReached
      });
    }
    res.json({ gifts: out });
  });

  r.post('/gifts/claim', requireAuth, limit(20, 60000), async (req, res) => {
    const gid = parseInt(req.body?.giftId, 10);
    const gifts = await db.query('SELECT * FROM gifts WHERE id = ?', [gid]);
    const g = gifts[0];
    if (!g) return res.status(404).json({ error: 'GIFT_NOT_FOUND' });
    const targets = g.targets === 'all' ? 'all' : safeJsonParse(g.targets, []);
    if (targets !== 'all' && !targets.includes(req.user.id)) return res.status(403).json({ error: 'NOT_TARGETED' });
    if (g.expires_at && new Date(g.expires_at) < new Date()) return res.status(410).json({ error: 'EXPIRED' });
    if (g.max_claims > 0 && g.claimed >= g.max_claims) return res.status(409).json({ error: 'LIMIT_REACHED' });
    const existing = await db.query('SELECT 1 FROM gift_claims WHERE gift_id = ? AND user_id = ?', [gid, req.user.id]);
    if (existing.length) return res.status(409).json({ error: 'ALREADY_CLAIMED' });
    await db.query('INSERT INTO gift_claims (gift_id, user_id, claimed_at) VALUES (?,?,?)', [gid, req.user.id, now()]);
    await db.query('UPDATE gifts SET claimed = claimed + 1 WHERE id = ?', [gid]);
    await grantReward(req.user.id, g.reward_type, g.reward_id, g.qty);
    res.json({ ok: true, reward: { type: g.reward_type, id: g.reward_id, qty: g.qty } });
  });

  // ---------- Notifications ----------
  r.get('/notifications', requireAuth, async (req, res) => {
    const rows = await db.query(
      `SELECT n.* FROM notifications n
       WHERE n.user_id = ? OR n.user_id IS NULL
       ORDER BY n.created_at DESC LIMIT 60`, [req.user.id]);
    const reads = await db.query('SELECT notification_id FROM notification_reads WHERE user_id = ?', [req.user.id]);
    const readSet = new Set(reads.map(x => x.notification_id));
    res.json({
      notifications: rows.map(n => ({
        id: n.id, type: n.type, title: n.title, body: n.body, created_at: n.created_at,
        read: readSet.has(n.id) || !!n.user_id
      }))
    });
  });

  r.post('/notifications/read', requireAuth, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 100).map(Number) : [];
    for (const id of ids) {
      if (!Number.isFinite(id)) continue;
      await db.query('INSERT INTO notification_reads (user_id, notification_id, read_at) VALUES (?,?,?) ON CONFLICT DO NOTHING',
        [req.user.id, id, now()]);
    }
    res.json({ ok: true });
  });

  // ---------- Nouveautés ----------
  r.get('/news', async (_req, res) => {
    const rows = await db.query('SELECT * FROM news WHERE published = 1 ORDER BY created_at DESC LIMIT 30');
    res.json({
      news: rows.map(n => ({
        id: n.id, title: n.title, title_en: n.title_en, body: n.body, body_en: n.body_en,
        image: n.image, author: n.author, created_at: n.created_at
      }))
    });
  });

  // ---------- Classements ----------
  r.get('/leaderboard', async (req, res) => {
    const type = ['players', 'clans'].includes(req.query.type) ? req.query.type : 'players';
    if (type === 'players') {
      const cat = ['global', 'trophies', 'wins', 'kills', 'seasonal'].includes(req.query.cat) ? req.query.cat : 'trophies';
      const col = { global: 'trophies', trophies: 'trophies', wins: 'wins', kills: 'kills', seasonal: 'season_trophies' }[cat];
      const rows = await db.query(
        `SELECT id, uname, level, trophies, season_trophies, wins, kills, matches, selected_fighter, selected_skin
         FROM users WHERE banned = 0 ORDER BY ${col} DESC, uname ASC LIMIT 100`);
      res.json({ type, cat, entries: rows.map((r, i) => ({
        rank: i + 1, id: r.id, uname: r.uname, level: r.level, trophies: r.trophies,
        season_trophies: r.season_trophies, wins: r.wins, kills: r.kills, matches: r.matches,
        fighter: r.selected_fighter, skin: r.selected_skin
      })) });
    } else {
      const cat = ['global', 'trophies', 'wins'].includes(req.query.cat) ? req.query.cat : 'trophies';
      const col = cat === 'wins' ? 'wins' : 'trophies';
      const rows = await db.query(
        `SELECT c.id, c.name, c.tag, c.emblem, c.emblem_color, c.trophies, c.wins, c.level,
                (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS members
         FROM clans c ORDER BY ${col} DESC, c.name ASC LIMIT 100`);
      res.json({ type, cat, entries: rows.map((r, i) => ({
        rank: i + 1, id: r.id, name: r.name, tag: r.tag, emblem: r.emblem, emblem_color: r.emblem_color,
        trophies: r.trophies, wins: r.wins, level: r.level, members: r.members
      })) });
    }
  });

  // ---------- Amis ----------
  r.get('/friends', requireAuth, async (req, res) => {
    const friends = await db.query(
      `SELECT u.id, u.uname, u.level, u.trophies, u.selected_fighter, u.last_login FROM friends f
       JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
       WHERE f.user_id = ? OR f.friend_id = ?`, [req.user.id, req.user.id, req.user.id]);
    const requests = await db.query(
      `SELECT fr.id, fr.from_id, u.uname, u.level FROM friend_requests fr
       JOIN users u ON u.id = fr.from_id WHERE fr.to_id = ?`, [req.user.id]);
    res.json({
      friends: friends.map(f => ({ id: f.id, uname: f.uname, level: f.level, trophies: f.trophies, fighter: f.selected_fighter, online: notifier.isOnline(f.id) })),
      requests: requests.map(rq => ({ id: rq.id, from_id: rq.from_id, uname: rq.uname, level: rq.level }))
    });
  });

  r.post('/friends/request', requireAuth, limit(15, 60000), async (req, res) => {
    const target = parseInt(req.body?.userId, 10) || null;
    const uname = String(req.body?.uname || '').trim();
    let userId = target;
    if (!userId && uname) {
      const rows = await db.query('SELECT id FROM users WHERE uname = ?', [uname]);
      if (!rows.length) return res.status(404).json({ error: 'USER_NOT_FOUND' });
      userId = rows[0].id;
    }
    if (!userId || userId === req.user.id) return res.status(400).json({ error: 'BAD_TARGET' });
    const already = await db.query(
      'SELECT 1 FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [req.user.id, userId, userId, req.user.id]);
    if (already.length) return res.status(409).json({ error: 'ALREADY_FRIENDS' });
    const existing = await db.query('SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ?', [req.user.id, userId]);
    if (existing.length) return res.status(409).json({ error: 'REQUEST_EXISTS' });
    // Si l'autre nous a déjà demandé → acceptation directe
    const inverse = await db.query('SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ?', [userId, req.user.id]);
    if (inverse.length) {
      await db.query('DELETE FROM friend_requests WHERE id = ?', [inverse[0].id]);
      await db.query('INSERT INTO friends (user_id, friend_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [req.user.id, userId, now()]);
      await db.query('INSERT INTO friends (user_id, friend_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [userId, req.user.id, now()]);
      return res.json({ ok: true, accepted: true });
    }
    await db.query('INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?,?,?)', [req.user.id, userId, now()]);
    notifier.push(userId, { type: 'friend_request', from: req.user.uname });
    res.json({ ok: true });
  });

  r.post('/friends/respond', requireAuth, async (req, res) => {
    const rid = parseInt(req.body?.requestId, 10);
    const accept = !!req.body?.accept;
    const rows = await db.query('SELECT * FROM friend_requests WHERE id = ? AND to_id = ?', [rid, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
    await db.query('DELETE FROM friend_requests WHERE id = ?', [rid]);
    if (accept) {
      await db.query('INSERT INTO friends (user_id, friend_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [req.user.id, rows[0].from_id, now()]);
      await db.query('INSERT INTO friends (user_id, friend_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [rows[0].from_id, req.user.id, now()]);
      notifier.push(rows[0].from_id, { type: 'friend_accepted', by: req.user.uname });
    }
    res.json({ ok: true });
  });

  r.post('/friends/remove', requireAuth, async (req, res) => {
    const fid = parseInt(req.body?.userId, 10);
    await db.query('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [req.user.id, fid, fid, req.user.id]);
    res.json({ ok: true });
  });

  // Inviter un ami à rejoindre la salle d'attente
  r.post('/friends/invite-match', requireAuth, async (req, res) => {
    const fid = parseInt(req.body?.userId, 10);
    const roomId = String(req.body?.roomId || '').slice(0, 24);
    const friends = await db.query('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?', [req.user.id, fid]);
    if (!friends.length) return res.status(403).json({ error: 'NOT_FRIENDS' });
    notifier.push(fid, { type: 'match_invite', from: req.user.uname, roomId });
    res.json({ ok: true });
  });

  // ---------- Clans ----------
  r.get('/clans', async (_req, res) => {
    const rows = await db.query(
      `SELECT c.*, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS members
       FROM clans c ORDER BY c.trophies DESC LIMIT 50`);
    res.json({ clans: rows.map(c => ({ id: c.id, name: c.name, tag: c.tag, emblem: c.emblem, emblem_color: c.emblem_color, trophies: c.trophies, wins: c.wins, level: c.level, members: c.members, description: c.description })) });
  });

  r.get('/clans/mine', requireAuth, async (req, res) => {
    const mine = await db.query(
      `SELECT c.*, cm.role, (SELECT COUNT(*) FROM clan_members m2 WHERE m2.clan_id = c.id) AS members
       FROM clan_members cm JOIN clans c ON c.id = cm.clan_id WHERE cm.user_id = ?`, [req.user.id]);
    if (!mine.length) return res.json({ clan: null, invites: [] });
    const c = mine[0];
    const members = await db.query(
      `SELECT u.id, u.uname, u.level, u.trophies, u.wins, cm.role FROM clan_members cm
       JOIN users u ON u.id = cm.user_id WHERE cm.clan_id = ? ORDER BY cm.role = 'leader' DESC, u.trophies DESC`, [c.id]);
    const invites = await db.query(
      `SELECT ci.id, u.uname, u.level FROM clan_invites ci JOIN users u ON u.id = ci.user_id
       WHERE ci.user_id = ?`, [req.user.id]);
    res.json({
      clan: { id: c.id, name: c.name, tag: c.tag, emblem: c.emblem, emblem_color: c.emblem_color,
        trophies: c.trophies, wins: c.wins, level: c.level, members: c.members, description: c.description,
        my_role: c.role, leader_id: c.leader_id },
      members, invites: invites.map(i => ({ id: i.id, uname: i.uname, level: i.level }))
    });
  });

  r.post('/clans', requireAuth, limit(5, 60000), async (req, res) => {
    const name = cleanStr(req.body?.name, 24);
    const tag = cleanStr(req.body?.tag, 6).toUpperCase();
    const emblem = cleanStr(req.body?.emblem || '☢', 8);
    const color = /^#[0-9a-fA-F]{6}$/.test(String(req.body?.color || '')) ? req.body.color : '#7fff6a';
    const description = cleanStr(req.body?.description, 160);
    if (name.length < 3) return res.status(400).json({ error: 'BAD_NAME' });
    if (!/^[A-Z0-9]{2,6}$/.test(tag)) return res.status(400).json({ error: 'BAD_TAG' });
    const mine = await db.query('SELECT 1 FROM clan_members WHERE user_id = ?', [req.user.id]);
    if (mine.length) return res.status(409).json({ error: 'ALREADY_IN_CLAN' });
    const nameTaken = await db.query('SELECT 1 FROM clans WHERE name = ?', [name]);
    if (nameTaken.length) return res.status(409).json({ error: 'NAME_TAKEN' });
    const insert = await db.query(
      `INSERT INTO clans (name, tag, emblem, emblem_color, leader_id, description, created_at)
       VALUES (?,?,?,?,?,?,?) RETURNING id`,
      [name, tag, emblem, color, req.user.id, description, now()]);
    const clanId = insert[0].id;
    await db.query('INSERT INTO clan_members (clan_id, user_id, role, joined_at) VALUES (?,?,?,?)', [clanId, req.user.id, 'leader', now()]);
    res.json({ ok: true, clanId });
  });

  r.post('/clans/join', requireAuth, async (req, res) => {
    const clanId = parseInt(req.body?.clanId, 10);
    const mine = await db.query('SELECT 1 FROM clan_members WHERE user_id = ?', [req.user.id]);
    if (mine.length) return res.status(409).json({ error: 'ALREADY_IN_CLAN' });
    const rows = await db.query('SELECT id FROM clans WHERE id = ?', [clanId]);
    if (!rows.length) return res.status(404).json({ error: 'CLAN_NOT_FOUND' });
    const count = await db.query('SELECT COUNT(*) AS c FROM clan_members WHERE clan_id = ?', [clanId]);
    if (Number(count[0].c) >= 30) return res.status(409).json({ error: 'CLAN_FULL' });
    await db.query('INSERT INTO clan_members (clan_id, user_id, role, joined_at) VALUES (?,?,?,?)', [clanId, req.user.id, 'member', now()]);
    await db.query('DELETE FROM clan_invites WHERE user_id = ? AND clan_id = ?', [req.user.id, clanId]);
    res.json({ ok: true });
  });

  r.post('/clans/leave', requireAuth, async (req, res) => {
    const mine = await db.query('SELECT * FROM clan_members WHERE user_id = ?', [req.user.id]);
    if (!mine.length) return res.status(404).json({ error: 'NOT_IN_CLAN' });
    const clanId = mine[0].clan_id;
    if (mine[0].role === 'leader') {
      const members = await db.query('SELECT * FROM clan_members WHERE clan_id = ?', [clanId]);
      const others = members.filter(m => m.user_id !== req.user.id);
      if (!others.length) {
        await db.query('DELETE FROM clans WHERE id = ?', [clanId]);
        await db.query('DELETE FROM clan_members WHERE clan_id = ?', [clanId]);
        await db.query('DELETE FROM clan_messages WHERE clan_id = ?', [clanId]);
        return res.json({ ok: true, deleted: true });
      }
      // transfert au membre le plus ancien non-leader
      others.sort((a, b) => a.role === 'officer' ? -1 : 1);
      await db.query('UPDATE clan_members SET role = ? WHERE clan_id = ? AND user_id = ?', ['leader', clanId, others[0].user_id]);
      await db.query('UPDATE clans SET leader_id = ? WHERE id = ?', [others[0].user_id, clanId]);
    }
    await db.query('DELETE FROM clan_members WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  });

  r.post('/clans/invite', requireAuth, limit(20, 60000), async (req, res) => {
    const userId = parseInt(req.body?.userId, 10);
    const mine = await db.query('SELECT * FROM clan_members WHERE user_id = ?', [req.user.id]);
    if (!mine.length || mine[0].role === 'member') return res.status(403).json({ error: 'NOT_ALLOWED' });
    const clanId = mine[0].clan_id;
    const target = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (!target.length) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const inClan = await db.query('SELECT 1 FROM clan_members WHERE user_id = ?', [userId]);
    if (inClan.length) return res.status(409).json({ error: 'ALREADY_IN_CLAN' });
    const existing = await db.query('SELECT id FROM clan_invites WHERE clan_id = ? AND user_id = ?', [clanId, userId]);
    if (existing.length) return res.status(409).json({ error: 'INVITE_EXISTS' });
    await db.query('INSERT INTO clan_invites (clan_id, user_id, from_id, created_at) VALUES (?,?,?,?)', [clanId, userId, req.user.id, now()]);
    const clan = await db.query('SELECT name FROM clans WHERE id = ?', [clanId]);
    notifier.push(userId, { type: 'clan_invite', clan: clan[0]?.name || 'Clan', from: req.user.uname });
    res.json({ ok: true });
  });

  r.post('/clans/respond', requireAuth, async (req, res) => {
    const iid = parseInt(req.body?.inviteId, 10);
    const accept = !!req.body?.accept;
    const rows = await db.query('SELECT * FROM clan_invites WHERE id = ? AND user_id = ?', [iid, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'INVITE_NOT_FOUND' });
    await db.query('DELETE FROM clan_invites WHERE id = ?', [iid]);
    if (accept) {
      const mine = await db.query('SELECT 1 FROM clan_members WHERE user_id = ?', [req.user.id]);
      if (mine.length) return res.status(409).json({ error: 'ALREADY_IN_CLAN' });
      await db.query('INSERT INTO clan_members (clan_id, user_id, role, joined_at) VALUES (?,?,?,?)', [rows[0].clan_id, req.user.id, 'member', now()]);
    }
    res.json({ ok: true });
  });

  r.post('/clans/kick', requireAuth, async (req, res) => {
    const userId = parseInt(req.body?.userId, 10);
    const mine = await db.query('SELECT * FROM clan_members WHERE user_id = ?', [req.user.id]);
    if (!mine.length || mine[0].role === 'member') return res.status(403).json({ error: 'NOT_ALLOWED' });
    const target = await db.query('SELECT * FROM clan_members WHERE user_id = ?', [userId]);
    if (!target.length || target[0].clan_id !== mine[0].clan_id) return res.status(404).json({ error: 'NOT_IN_YOUR_CLAN' });
    if (target[0].role === 'leader') return res.status(403).json({ error: 'CANNOT_KICK_LEADER' });
    await db.query('DELETE FROM clan_members WHERE user_id = ?', [userId]);
    res.json({ ok: true });
  });

  r.post('/clans/update', requireAuth, async (req, res) => {
    const mine = await db.query('SELECT * FROM clan_members WHERE user_id = ?', [req.user.id]);
    if (!mine.length || mine[0].role === 'member') return res.status(403).json({ error: 'NOT_ALLOWED' });
    const clanId = mine[0].clan_id;
    const updates = {};
    if (req.body?.name) {
      const name = cleanStr(req.body.name, 24);
      if (name.length < 3) return res.status(400).json({ error: 'BAD_NAME' });
      const taken = await db.query('SELECT id FROM clans WHERE name = ? AND id != ?', [name, clanId]);
      if (taken.length) return res.status(409).json({ error: 'NAME_TAKEN' });
      updates.name = name;
    }
    if (req.body?.tag) {
      const tag = cleanStr(req.body.tag, 6).toUpperCase();
      if (!/^[A-Z0-9]{2,6}$/.test(tag)) return res.status(400).json({ error: 'BAD_TAG' });
      updates.tag = tag;
    }
    if (req.body?.emblem) updates.emblem = cleanStr(req.body.emblem, 8);
    if (req.body?.color && /^#[0-9a-fA-F]{6}$/.test(req.body.color)) updates.emblem_color = req.body.color;
    if (req.body?.description !== undefined) updates.description = cleanStr(req.body.description, 160);
    for (const [k, v] of Object.entries(updates)) {
      const col = k === 'color' ? 'emblem_color' : k;
      await db.query(`UPDATE clans SET ${col} = ? WHERE id = ?`, [v, clanId]);
    }
    res.json({ ok: true });
  });

  r.get('/clans/:id/chat', requireAuth, async (req, res) => {
    const clanId = parseInt(req.params.id, 10);
    const mine = await db.query('SELECT 1 FROM clan_members WHERE user_id = ? AND clan_id = ?', [req.user.id, clanId]);
    if (!mine.length) return res.status(403).json({ error: 'NOT_IN_CLAN' });
    const rows = await db.query('SELECT * FROM clan_messages WHERE clan_id = ? ORDER BY id DESC LIMIT 50', [clanId]);
    res.json({ messages: rows.reverse().map(m => ({ id: m.id, uname: m.uname, message: m.message, created_at: m.created_at })) });
  });

  // ---------- Textures (images publiques) ----------
  r.get('/textures/:id/raw', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const rows = await db.query('SELECT mime, data, published FROM textures WHERE id = ?', [id]);
    const t = rows[0];
    if (!t || !t.published) return res.status(404).json({ error: 'NOT_FOUND' });
    const data = Buffer.isBuffer(t.data) ? t.data : Buffer.from(t.data);
    res.setHeader('Content-Type', t.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(data);
  });

  // ---------- Sons (fichiers administrés) ----------
  r.get('/sounds/:id/raw', async (req, res) => {
    const id = String(req.params.id).slice(0, 32);
    const rows = await db.query('SELECT mode, mime, file FROM sounds WHERE id = ?', [id]);
    const s = rows[0];
    if (!s || s.mode !== 'file' || !s.file) return res.status(404).json({ error: 'NOT_FOUND' });
    const data = Buffer.isBuffer(s.file) ? s.file : Buffer.from(s.file);
    res.setHeader('Content-Type', s.mime || 'audio/ogg');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.send(data);
  });

  return r;
}

async function grantReward(userId, type, id, qty) {
  const n = Math.max(1, parseInt(qty, 10) || 1);
  switch (type) {
    case 'coins':
      await db.query('UPDATE users SET coins = coins + ? WHERE id = ?', [n, userId]); break;
    case 'cores':
      await db.query('UPDATE users SET cores = cores + ? WHERE id = ?', [n, userId]); break;
    case 'xp':
      await db.query('UPDATE users SET xp = xp + ? WHERE id = ?', [n, userId]); break;
    case 'trophies':
      await db.query('UPDATE users SET trophies = trophies + ?, season_trophies = season_trophies + ? WHERE id = ?', [n, n, userId]); break;
    case 'skin':
    case 'emote':
    case 'tag':
    case 'fx':
    case 'item':
      await db.query(`INSERT INTO inventory (user_id, item_type, item_id, qty, acquired_at) VALUES (?,?,?,?,?)
        ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET qty = inventory.qty + ?`,
        [userId, type, id || type, n, now(), n]);
      break;
    default: break;
  }
}

function currentPeriods() {
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
  return { daily: `d:${day}`, weekly: `w:${d.getUTCFullYear()}-${String(week).padStart(2, '0')}`, seasonal: 'season' };
}
