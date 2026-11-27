// server/game/Bots.js — IA des bots : exploration, réparation, combat, escaliers,
// réaction à l'intoxication et évacuation. Difficultés configurables par l'admin.
import { astarFloor, stairToward } from './Pathfinding.js';
import { pointVisible, los } from './Vision.js';
import { SERVER } from '../config.js';

function pathTo(match, bot, tx, ty, targetFloor) {
  // Chemin vers une case éventuellement sur un autre étage : passer par un escalier
  if (targetFloor !== undefined && targetFloor !== bot.floor) {
    const st = stairToward(match.map, bot.floor, targetFloor, bot.x, bot.y);
    if (!st) return null;
    return astarFloor(match.map, bot.floor, Math.floor(bot.x), Math.floor(bot.y), st.x, st.y);
  }
  return astarFloor(match.map, bot.floor, Math.floor(bot.x), Math.floor(bot.y), tx, ty);
}

function followPath(match, bot, dt) {
  const b = bot.bot;
  if (!b.path || b.pathIdx >= b.path.length) return false;
  const node = b.path[b.pathIdx];
  const tx = node.x + 0.5, ty = node.y + 0.5;
  const d = Math.hypot(tx - bot.x, ty - bot.y);
  if (d < 0.18) {
    b.pathIdx++;
    // sur un escalier : changer d'étage automatiquement
    const s = match.map.stairAt(bot.floor, node.x, node.y);
    if (s) match.useStairs(bot, s);
    return b.pathIdx < b.path.length;
  }
  const vx = (tx - bot.x) / (d || 1), vy = (ty - bot.y) / (d || 1);
  match.moveEntity(bot, vx, vy, match.speedOf(bot), dt);
  return true;
}

function setPath(match, bot, path) {
  bot.bot.path = path;
  bot.bot.pathIdx = 0;
}

export function updateBots(match, dt) {
  const diff = match.diff;
  for (const bot of match.players.values()) {
    const isBot = bot.kind === 'bot' || bot.botControlled;
    if (!isBot) continue;
    if (!bot.alive || bot.extracted || match.phase === 'ended') continue;
    if (bot.kind === 'human' && bot.connected) continue;
    const b = bot.bot;
    bot.attackCd = Math.max(0, bot.attackCd - dt);
    bot.specialCd = Math.max(0, bot.specialCd - dt);

    // 1) cible ennemie visible ?
    let enemy = null, bestD = 1e9;
    for (const q of match.players.values()) {
      if (q === bot || !q.alive || q.extracted) continue;
      if (match.clock < q.cloakUntil) continue;
      const d = Math.hypot(q.x - bot.x, q.y - bot.y);
      if (d < diff.aggro && d < bestD && q.floor === bot.floor
          && pointVisible(match.map, bot.floor, bot.x, bot.y, q.x, q.y, diff.aggro)) {
        enemy = q; bestD = d;
      }
    }

    // 2) évacuation ouverte → foncer vers la zone d'évac
    if (match.evacOpen && !bot.extracted) {
      if (!b.goal || b.goal.kind !== 'evac' || match.clock > b.repathAt) {
        const evac = match.map.evacTiles;
        if (evac.length) {
          // tuile d'évac la plus proche (même étage d'abord)
          const sameFloor = evac.filter(t => t.floor === bot.floor);
          const list = sameFloor.length ? sameFloor : evac;
          const t = list[Math.floor(Math.random() * list.length)];
          const p = pathTo(match, bot, t.x, t.y, t.floor);
          if (p) { setPath(match, bot, p); b.goal = { kind: 'evac' }; b.repathAt = match.clock + 4; }
        }
      }
      followPath(match, bot, dt);
      if (match.map.isEvac(bot.floor, Math.floor(bot.x), Math.floor(bot.y))) {
        bot.extracting += dt;
        if (bot.extracting >= SERVER.EXTRACT_TIME_S) {
          bot.extracted = true;
          match.pushEvent({ type: 'extract', id: bot.id, name: bot.uname });
        }
      }
      continue;
    }

    // 3) combat si ennemi visible (après délai de réaction)
    if (enemy) {
      if (b.targetId !== enemy.id) {
        b.targetId = enemy.id;
        b.reactAt = match.clock + diff.reaction;
      }
      if (match.clock >= b.reactAt) {
        // fuir si très blessé
        if (bot.hp < bot.maxHp * 0.22 && Math.random() < 0.85) {
          if (!b.path || match.clock > b.repathAt) {
            const awayX = Math.floor(bot.x + (bot.x - enemy.x));
            const awayY = Math.floor(bot.y + (bot.y - enemy.y));
            const p = pathTo(match, bot, Math.max(1, awayX), Math.max(1, awayY));
            if (p) { setPath(match, bot, p); b.repathAt = match.clock + 1; b.goal = { kind: 'flee' }; }
          }
        } else {
          // approcher et attaquer
          const st = bot.stats;
          const d = Math.hypot(enemy.x - bot.x, enemy.y - bot.y);
          if (d > st.attack_range * 0.85) {
            if (!b.path || b.goal?.kind !== 'fight' || match.clock > b.repathAt) {
              const p = pathTo(match, bot, Math.floor(enemy.x), Math.floor(enemy.y));
              if (p) { setPath(match, bot, p); b.goal = { kind: 'fight' }; b.repathAt = match.clock + 0.6; }
            }
          } else {
            b.path = null;
          }
          // tir avec erreur de visée
          if (bot.attackCd <= 0 && d <= st.attack_range
              && los(match.map, bot.floor, Math.floor(bot.x), Math.floor(bot.y), Math.floor(enemy.x), Math.floor(enemy.y))) {
            const ang = Math.atan2(enemy.y - bot.y, enemy.x - bot.x) + (Math.random() - 0.5) * diff.aimError;
            match.tryAttack(bot, Math.cos(ang), Math.sin(ang));
          }
          // compétence spéciale
          if (bot.specialCd <= 0 && d < st.attack_range && Math.random() < 0.02) {
            match.useSpecial(bot);
          }
        }
        followPath(match, bot, dt);
        continue;
      }
    } else {
      b.targetId = null;
    }

    // 4) pendant l'intoxication : priorité aux réparations (rouvrir l'évac)
    // 5) sinon : réparer la tâche non terminée la plus proche, ou explorer
    let task = null, bestTD = 1e9;
    for (const t of match.map.tasks) {
      const stt = match.tasks.get(t.id);
      if (!stt || stt.done) continue;
      const dFloor = Math.abs(t.floor - bot.floor);
      const d = Math.hypot(t.x + 0.5 - bot.x, t.y + 0.5 - bot.y) + dFloor * 12;
      if (d < bestTD) { task = t; bestTD = d; }
    }
    if (task) {
      if (!b.goal || b.goal.kind !== 'task' || b.goal.taskId !== task.id || match.clock > b.repathAt) {
        const p = pathTo(match, bot, task.x, task.y, task.floor);
        if (p) { setPath(match, bot, p); b.goal = { kind: 'task', taskId: task.id }; b.repathAt = match.clock + 3; }
      }
      const reached = task.floor === bot.floor && Math.hypot(task.x + 0.5 - bot.x, task.y + 0.5 - bot.y) < 1.3;
      if (reached) {
        b.path = null;
        const stt = match.tasks.get(task.id);
        const rate = (bot.stats.repair_mult || 1) * diff.taskSpeed;
        stt.progress = Math.min(1, stt.progress + dt / task.duration * rate);
        bot.taskContrib[task.id] = (bot.taskContrib[task.id] || 0) + dt / task.duration * rate;
        bot.repairing = true;
        if (stt.progress >= 1 && !stt.done) {
          stt.done = true;
          match.bunkerProgress = Math.min(100, match.bunkerProgress + task.weight);
          bot.tasksDone += 1;
          bot.armor = Math.min(match.cfg.armorMax, bot.armor + match.cfg.taskArmorBonus);
          bot.coinsPending += match.cfg.taskCoins;
          bot.xpPending += match.cfg.xpTask;
          match.pushEvent({ type: 'task_done', id: task.id, name: task.name || task.id, progress: match.bunkerProgress, by: [bot.id] });
          if (match.bunkerProgress >= 100) match.openEvac();
        }
      } else {
        bot.repairing = false;
        followPath(match, bot, dt);
      }
      continue;
    }

    // 6) exploration aléatoire
    if (!b.goal || b.goal.kind !== 'wander' || !b.path || match.clock > b.wanderUntil) {
      const tx = 1 + Math.floor(Math.random() * (match.map.w - 2));
      const ty = 1 + Math.floor(Math.random() * (match.map.h - 2));
      const p = pathTo(match, bot, tx, ty);
      if (p) { setPath(match, bot, p); b.goal = { kind: 'wander' }; b.wanderUntil = match.clock + 8; }
    }
    followPath(match, bot, dt);
  }
}
