// server/game/results.js — Persistance de fin de partie : matches, match_players,
// tasks_progress, mise à jour des comptes (xp, pass, trophées, monnaies) et quêtes.
// Read-modify-write en JS pour rester compatible PostgreSQL ET SQLite.
import { db } from '../db/index.js';
import { now } from '../util.js';

function periodKeys(date = new Date()) {
  const d = date.toISOString().slice(0, 10);                    // yyyy-mm-dd
  const onejan = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
  return { daily: `d:${d}`, weekly: `w:${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`, seasonal: 'season' };
}

export async function persistResults(match, results) {
  if (match.persisted) return;
  match.persisted = true;
  const ts = now();
  const inserted = await db.query(
    `INSERT INTO matches (map_id, mode, started_at, ended_at, winner_type, winners, config)
     VALUES (?,?,?,?,?,?,?) RETURNING id`,
    [results.mapId, 'survival', new Date(match.startedAt).toISOString(), ts, results.winnerType,
     JSON.stringify(results.winners), JSON.stringify({})]
  );
  const matchId = inserted[0].id;
  const periods = periodKeys();
  let botSeq = 0;

  for (const p of results.players) {
    // Les bots n'ont pas de compte : identifiants négatifs uniques
    const dbUserId = p.kind === 'bot' ? (--botSeq) : (p.userId ?? null);
    await db.query(
      `INSERT INTO match_players (match_id, user_id, uname, fighter_id, is_bot, kills, deaths, tasks_done, damage, survived_s, won, xp_gained, coins_gained)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [matchId, dbUserId, p.uname, p.fighter, p.kind === 'bot' ? 1 : 0,
       p.kills, p.deaths, p.tasksDone, p.damage, p.survivedS, p.won ? 1 : 0, p.xp, p.coins]
    );
    if (p.kind === 'human') {
      for (const [taskId, contrib] of Object.entries(p.taskContrib || {})) {
        if (contrib <= 0) continue;
        await db.query(
          `INSERT INTO tasks_progress (match_id, user_id, task_id, progress, done) VALUES (?,?,?,?,?)`,
          [matchId, p.userId, taskId, Math.min(1, +contrib.toFixed(3)), contrib >= 0.999 ? 1 : 0]
        );
      }
      await applyUserRewards(p, periods);
    }
  }
  console.log(`[match ${match.id}] résultats persistés (match #${matchId})`);
}

async function applyUserRewards(p, periods) {
  if (!p.userId || p.userId < 0) return;
  const rows = await db.query('SELECT * FROM users WHERE id = ?', [p.userId]);
  const u = rows[0];
  if (!u) return;

  const xp = (u.xp || 0) + p.xp;
  const cfgRows = await db.query(`SELECT value FROM game_config WHERE key = 'xpPerPassLevel'`);
  const perLevel = Number(JSON.parse(cfgRows[0]?.value || '100')) || 100;
  const newLevel = Math.min(50, 1 + Math.floor(xp / perLevel));

  await db.query(
    `UPDATE users SET coins = ?, cores = ?, xp = ?, level = ?, kills = ?, deaths = ?,
     tasks_done = ?, matches = ?, wins = ?, trophies = ?, season_trophies = ? WHERE id = ?`,
    [(u.coins || 0) + p.coins, u.cores || 0, xp, newLevel,
     (u.kills || 0) + p.kills, (u.deaths || 0) + p.deaths,
     (u.tasks_done || 0) + p.tasksDone, (u.matches || 0) + 1, (u.wins || 0) + (p.won ? 1 : 0),
     Math.max(0, (u.trophies || 0) + p.trophies), Math.max(0, (u.season_trophies || 0) + p.trophies), p.userId]
  );

  if (newLevel > u.level) {
    await db.query('INSERT INTO notifications (user_id, type, title, body, created_at) VALUES (?,?,?,?,?)',
      [p.userId, 'pass', `Pass niveau ${newLevel}`, 'Nouvelles récompenses disponibles dans le Pass !', now()]);
  }

  // Progression des quêtes (kills, tasks, wins, matches, damage)
  const stats = { kills: p.kills, tasks: p.tasksDone, wins: p.won ? 1 : 0, matches: 1, damage: p.damage };
  for (const [stat, delta] of Object.entries(stats)) {
    if (!delta) continue;
    const quests = await db.query('SELECT id, goal FROM quests WHERE stat = ? AND published = 1', [stat]);
    for (const q of quests) {
      for (const period of [periods.daily, periods.weekly, periods.seasonal]) {
        const existing = await db.query(
          'SELECT progress, claimed FROM quest_progress WHERE user_id = ? AND quest_id = ? AND period = ?',
          [p.userId, q.id, period]);
        if (existing.length) {
          const progress = Math.min(q.goal, (existing[0].progress || 0) + delta);
          await db.query('UPDATE quest_progress SET progress = ? WHERE user_id = ? AND quest_id = ? AND period = ?',
            [progress, p.userId, q.id, period]);
        } else {
          await db.query('INSERT INTO quest_progress (user_id, quest_id, period, progress, claimed) VALUES (?,?,?,?,0)',
            [p.userId, q.id, period, Math.min(q.goal, delta)]);
        }
      }
    }
  }
}
