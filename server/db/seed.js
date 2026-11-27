// server/db/seed.js — Seed idempotent : fighters, map par défaut, boutique, quêtes,
// pass (50 niveaux), nouveautés, sons, config de jeu. Exécuté au démarrage.
import { db } from './index.js';
import { DEFAULT_GAME_CONFIG } from '../config.js';
import { defaultMap } from '../data/defaultMap.js';
import { safeJsonParse, now } from '../util.js';

const FIGHTERS = [
  { id: 'rust', name: 'Rust', name_en: 'Rust', description: 'Éclaireur aguerri des couloirs. Rapide et discret, sa ruée lui permet de fondre sur un objectif ou de s’échapper.', description_en: 'Corridor-scout veteran. Fast and stealthy, his dash closes in on objectives or escapes trouble.', rarity: 'commun', price: 0, currency: 'coins', hp: 90, speed: 4.2, damage: 12, attack_type: 'ranged', attack_range: 4.2, attack_cooldown: 0.55, special: 'dash', special_cd: 7, repair_mult: 1, sort: 1 },
  { id: 'brick', name: 'Brick', name_en: 'Brick', description: 'Ancien maçon du bunker, léger comme un chariot à béton. Frappe au corps à corps et encaisse tout.', description_en: 'Former bunker mason, light as a concrete cart. Melee brawler who soaks everything.', rarity: 'commun', price: 0, currency: 'coins', hp: 130, speed: 3.2, damage: 22, attack_type: 'melee', attack_range: 1.3, attack_cooldown: 0.8, special: 'shield', special_cd: 12, repair_mult: 1, sort: 2 },
  { id: 'volt', name: 'Volt', name_en: 'Volt', description: 'Technicienne des circuits haute tension. Son tir surchargé transperce la première cible touchée.', description_en: 'High-voltage technician. Her overcharged shot pierces the first target hit.', rarity: 'rare', price: 800, currency: 'coins', hp: 100, speed: 3.7, damage: 14, attack_type: 'ranged', attack_range: 5.2, attack_cooldown: 0.7, special: 'overcharge', special_cd: 9, repair_mult: 1, sort: 3 },
  { id: 'mole', name: 'Mole', name_en: 'Mole', description: 'Ingénieur de maintenance. Répare 40% plus vite et soigne ses plaques avec sa trousse.', description_en: 'Maintenance engineer. Repairs 40% faster and patches up with his medkit.', rarity: 'rare', price: 800, currency: 'coins', hp: 110, speed: 3.5, damage: 16, attack_type: 'ranged', attack_range: 3.8, attack_cooldown: 0.6, special: 'medkit', special_cd: 12, repair_mult: 1.4, sort: 4 },
  { id: 'wraith', name: 'Wraith', name_en: 'Wraith', description: 'Ombre des niveaux inférieurs. Se fond dans le brouillard pendant 3 secondes.', description_en: 'Shadow of the lower levels. Blends into the fog for 3 seconds.', rarity: 'epique', price: 30, currency: 'cores', hp: 95, speed: 3.9, damage: 18, attack_type: 'ranged', attack_range: 4.0, attack_cooldown: 0.75, special: 'cloak', special_cd: 14, repair_mult: 1, sort: 5 }
];

const SHOP_ITEMS = [
  { id: 'emote_gg', category: 'emotes', name: 'GG !', name_en: 'GG!', description: 'Un classique du bunker.', description_en: 'A bunker classic.', rarity: 'commun', price: 50, currency: 'coins', payload: { text: 'GG !' } },
  { id: 'emote_bjr', category: 'emotes', name: 'Bien joué', name_en: 'Well played', description: 'Fair-play assumé.', description_en: 'Assumed fair play.', rarity: 'commun', price: 50, currency: 'coins', payload: { text: 'Bien joué !' } },
  { id: 'emote_run', category: 'emotes', name: 'Courez !', name_en: 'Run!', description: 'L’intox arrive.', description_en: 'The radiation is coming.', rarity: 'rare', price: 120, currency: 'coins', payload: { text: 'Courez !!' } },
  { id: 'tag_survivor', category: 'tags', name: 'Tag « Survivant »', name_en: 'Tag "Survivor"', description: 'Un tag affiché près de votre nom.', description_en: 'A tag displayed next to your name.', rarity: 'commun', price: 80, currency: 'coins', payload: { tag: 'Survivant' } },
  { id: 'tag_radium', category: 'tags', name: 'Tag « Radium »', name_en: 'Tag "Radium"', description: 'Brille dans le noir. Presque.', description_en: 'Glows in the dark. Almost.', rarity: 'rare', price: 150, currency: 'coins', payload: { tag: 'Radium' } },
  { id: 'tag_ghost', category: 'tags', name: 'Tag « Spectre »', name_en: 'Tag "Spectre"', description: 'Pour les silencieux des couloirs.', description_en: 'For the silent ones in the corridors.', rarity: 'epique', price: 8, currency: 'cores', payload: { tag: 'Spectre' } },
  { id: 'fx_radia', category: 'effects', name: 'Effet « Radia »', name_en: '"Radia" effect', description: 'Aura verte lors d’une élimination.', description_en: 'Green aura on elimination.', rarity: 'rare', price: 200, currency: 'coins', payload: { color: '#7fff6a' } },
  { id: 'fx_ember', category: 'effects', name: 'Effet « Braise »', name_en: '"Ember" effect', description: 'Aura orangée lors d’une élimination.', description_en: 'Orange aura on elimination.', rarity: 'rare', price: 200, currency: 'coins', payload: { color: '#ffb347' } },
  { id: 'skin_volt_carbon', category: 'skins', name: 'Skin Volt « Carbone »', name_en: 'Volt "Carbon" skin', description: 'Skin alternatif pour Volt.', description_en: 'Alternate skin for Volt.', rarity: 'epique', price: 15, currency: 'cores', payload: { skinId: 'volt_carbon' } }
];

const QUESTS = [
  // Quotidiennes
  { id: 'd_repair3', type: 'daily', stat: 'tasks', goal: 3, reward_xp: 40, reward_coins: 60, reward_cores: 0, name: 'Réparer 3 tâches', name_en: 'Repair 3 tasks', icon: '🔧', sort: 1 },
  { id: 'd_kills2', type: 'daily', stat: 'kills', goal: 2, reward_xp: 40, reward_coins: 60, reward_cores: 0, name: 'Éliminer 2 joueurs', name_en: 'Eliminate 2 players', icon: '⚔', sort: 2 },
  { id: 'd_matches1', type: 'daily', stat: 'matches', goal: 1, reward_xp: 25, reward_coins: 40, reward_cores: 0, name: 'Disputer 1 partie', name_en: 'Play 1 match', icon: '🎮', sort: 3 },
  // Hebdomadaires
  { id: 'w_kills10', type: 'weekly', stat: 'kills', goal: 10, reward_xp: 150, reward_coins: 250, reward_cores: 1, name: 'Éliminer 10 joueurs', name_en: 'Eliminate 10 players', icon: '⚔', sort: 10 },
  { id: 'w_repair15', type: 'weekly', stat: 'tasks', goal: 15, reward_xp: 150, reward_coins: 250, reward_cores: 0, name: 'Réparer 15 tâches', name_en: 'Repair 15 tasks', icon: '🔧', sort: 11 },
  { id: 'w_win3', type: 'weekly', stat: 'wins', goal: 3, reward_xp: 200, reward_coins: 300, reward_cores: 2, name: 'Gagner 3 parties', name_en: 'Win 3 matches', icon: '🏆', sort: 12 },
  { id: 'w_damage500', type: 'weekly', stat: 'damage', goal: 500, reward_xp: 120, reward_coins: 200, reward_cores: 0, name: 'Infliger 500 dégâts', name_en: 'Deal 500 damage', icon: '💥', sort: 13 },
  { id: 'w_matches10', type: 'weekly', stat: 'matches', goal: 10, reward_xp: 130, reward_coins: 220, reward_cores: 0, name: 'Disputer 10 parties', name_en: 'Play 10 matches', icon: '🎮', sort: 14 },
  // Saisonnières
  { id: 's_win10', type: 'seasonal', stat: 'wins', goal: 10, reward_xp: 500, reward_coins: 800, reward_cores: 5, name: 'Gagner 10 parties (saison)', name_en: 'Win 10 matches (season)', icon: '🏆', sort: 20 },
  { id: 's_tasks50', type: 'seasonal', stat: 'tasks', goal: 50, reward_xp: 400, reward_coins: 600, reward_cores: 3, name: 'Réparer 50 tâches (saison)', name_en: 'Repair 50 tasks (season)', icon: '🔧', sort: 21 }
];

const PASS_REWARD_TABLE = [
  ['coins', '', 60], ['emote', 'emote_gg', 1], ['coins', '', 80], ['skin', 'volt_carbon', 1], ['cores', '', 2],
  ['coins', '', 100], ['tag', 'tag_survivor', 1], ['coins', '', 120], ['emote', 'emote_bjr', 1], ['cores', '', 2],
  ['coins', '', 120], ['fx', 'fx_radia', 1], ['coins', '', 140], ['skin', 'brick_marine', 1], ['cores', '', 3],
  ['coins', '', 150], ['emote', 'emote_run', 1], ['coins', '', 160], ['tag', 'tag_radium', 1], ['cores', '', 3],
  ['coins', '', 180], ['fx', 'fx_ember', 1], ['coins', '', 200], ['skin', 'rust_kaki', 1], ['cores', '', 4],
  ['coins', '', 200], ['emote', 'emote_gg', 1], ['coins', '', 220], ['tag', 'tag_ghost', 1], ['cores', '', 4],
  ['coins', '', 220], ['skin', 'mole_orange', 1], ['coins', '', 240], ['emote', 'emote_bjr', 1], ['cores', '', 5],
  ['coins', '', 240], ['fx', 'fx_radia', 1], ['coins', '', 260], ['skin', 'wraith_noir', 1], ['cores', '', 5],
  ['coins', '', 260], ['emote', 'emote_run', 1], ['coins', '', 280], ['tag', 'tag_survivor', 1], ['cores', '', 6],
  ['coins', '', 280], ['skin', 'volt_carbon', 1], ['coins', '', 300], ['fx', 'fx_ember', 1], ['cores', '', 10]
];

const SOUNDS = [
  ['click', 'Clic interface'], ['attack', 'Attaque'], ['hit', 'Impact'], ['kill', 'Élimination'],
  ['repair', 'Réparation'], ['reward', 'Récompense'], ['purchase', 'Achat'], ['alarm', 'Alerte nucléaire'],
  ['ambience', 'Ambiance du bunker'], ['notification', 'Notification'], ['victory', 'Victoire'], ['defeat', 'Défaite']
];

export async function seed() {
  // Config de jeu
  for (const [key, value] of Object.entries(DEFAULT_GAME_CONFIG)) {
    await db.query('INSERT INTO game_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
  }
  // Fighters
  for (const f of FIGHTERS) {
    await db.query(
      `INSERT INTO fighters (id, name, name_en, description, description_en, rarity, price, currency, hp, speed, damage, attack_type, attack_range, attack_cooldown, special, special_cd, repair_mult, published, sort)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
       ON CONFLICT (id) DO NOTHING`,
      [f.id, f.name, f.name_en, f.description, f.description_en, f.rarity, f.price, f.currency, f.hp, f.speed, f.damage, f.attack_type, f.attack_range, f.attack_cooldown, f.special, f.special_cd, f.repair_mult, f.sort]
    );
  }
  // Skins achetables (données de pixels générées côté client par palette)
  const SKINS = [
    { id: 'volt_carbon', fighter_id: 'volt', name: 'Volt Carbone', name_en: 'Volt Carbon', rarity: 'epique', price: 15, currency: 'cores', palette: { body: '#2b2f36', accent: '#38e0ff', visor: '#9ff7ff' } },
    { id: 'brick_marine', fighter_id: 'brick', name: 'Brick Marine', name_en: 'Brick Marine', rarity: 'rare', price: 200, currency: 'coins', palette: { body: '#2e4a3f', accent: '#8fd6ff', visor: '#c8ffe8' } },
    { id: 'rust_kaki', fighter_id: 'rust', name: 'Rust Kaki', name_en: 'Rust Khaki', rarity: 'rare', price: 200, currency: 'coins', palette: { body: '#5a5636', accent: '#ffd97a', visor: '#fff3b0' } },
    { id: 'mole_orange', fighter_id: 'mole', name: 'Mole Orange', name_en: 'Mole Orange', rarity: 'rare', price: 200, currency: 'coins', palette: { body: '#6b3d1f', accent: '#ff9b3d', visor: '#ffd9a0' } },
    { id: 'wraith_noir', fighter_id: 'wraith', name: 'Wraith Noir', name_en: 'Wraith Black', rarity: 'epique', price: 15, currency: 'cores', palette: { body: '#14161c', accent: '#b28cff', visor: '#e2d5ff' } }
  ];
  for (const s of SKINS) {
    await db.query(
      `INSERT INTO skins (id, fighter_id, name, name_en, rarity, price, currency, data, published)
       VALUES (?,?,?,?,?,?,?,?,1) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.fighter_id, s.name, s.name_en, s.rarity, s.price, s.currency, JSON.stringify({ palette: s.palette })]
    );
  }
  // Map par défaut
  const existingMap = await db.query('SELECT id FROM maps WHERE id = ?', [defaultMap.id]);
  if (existingMap.length === 0) {
    await db.query(
      `INSERT INTO maps (id, name, name_en, description, description_en, data, published, created_at, updated_at)
       VALUES (?,?,?,?,?,?,1,?,?)`,
      [defaultMap.id, defaultMap.name, defaultMap.name_en, defaultMap.description, defaultMap.description_en, JSON.stringify(defaultMap), now(), now()]
    );
    await syncMapRows(defaultMap.id, defaultMap);
    console.log('[seed] Map par défaut « Bunker A-7 » créée');
  }
  // Boutique
  for (const it of SHOP_ITEMS) {
    await db.query(
      `INSERT INTO shop_items (id, name, name_en, description, description_en, category, rarity, price, currency, available, payload, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT (id) DO NOTHING`,
      [it.id, it.name, it.name_en, it.description, it.description_en, it.category, it.rarity, it.price, it.currency, JSON.stringify(it.payload || {}), now()]
    );
  }
  // Quêtes
  for (const q of QUESTS) {
    await db.query(
      `INSERT INTO quests (id, type, stat, goal, reward_xp, reward_coins, reward_cores, name, name_en, icon, published, sort)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT (id) DO NOTHING`,
      [q.id, q.type, q.stat, q.goal, q.reward_xp, q.reward_coins, q.reward_cores, q.name, q.name_en, q.icon, q.sort]
    );
  }
  // Pass : 50 niveaux
  for (let lvl = 1; lvl <= 50; lvl++) {
    const [type, id, qty] = PASS_REWARD_TABLE[(lvl - 1) % PASS_REWARD_TABLE.length];
    await db.query('INSERT INTO pass_rewards (level, type, id, qty) VALUES (?,?,?,?) ON CONFLICT (level) DO NOTHING', [lvl, type, id, qty]);
  }
  // Sons (synthèse par défaut, modifiable par l'admin)
  for (const [id, name] of SOUNDS) {
    await db.query('INSERT INTO sounds (id, name, mode, params) VALUES (?,?,\'synth\',\'{}\') ON CONFLICT (id) DO NOTHING', [id, name]);
  }
  // Nouveautés d'exemple
  const newsCount = await db.query('SELECT COUNT(*) AS c FROM news');
  if (Number(newsCount[0].c) === 0) {
    await db.query(
      `INSERT INTO news (title, title_en, body, body_en, author, published, created_at) VALUES (?,?,?,?,?,1,?)`,
      ['Bienvenue dans le Bunker A-7', 'Welcome to Bunker A-7',
       'Les systèmes sont en panne, le compte à rebours a commencé. Réparez le bunker ou soyez le dernier survivant lorsque le radium s’invite.',
       'The systems are down and the countdown has started. Repair the bunker — or be the last survivor when the radium comes knocking.',
       'system', now()]
    );
    await db.query(
      `INSERT INTO news (title, title_en, body, body_en, author, published, created_at) VALUES (?,?,?,?,?,1,?)`,
      [' Saison 1 : Radium', 'Season 1: Radium',
       'Le classement saisonnier est ouvert. Trophées, quêtes saisonnières et récompenses Pass vous attendent.',
       'The seasonal leaderboard is open. Trophies, seasonal quests and Pass rewards await.',
       'system', now()]
    );
  }
  // Compte admin via variables d'environnement (optionnel)
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const existing = await db.query('SELECT id FROM users WHERE uname = ?', [process.env.ADMIN_USERNAME]);
    if (existing.length === 0) {
      const bcrypt = (await import('bcryptjs')).default;
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await db.query('INSERT INTO users (uname, password_hash, is_admin, created_at) VALUES (?,?,1,?)', [process.env.ADMIN_USERNAME, hash, now()]);
      console.log(`[seed] Admin créé depuis l'environnement : ${process.env.ADMIN_USERNAME}`);
    }
  }
  console.log('[seed] Base prête.');
}

/** Synchronise les lignes normalisées map_tiles / map_tasks (lecture/requêtes admin). */
export async function syncMapRows(mapId, map) {
  await db.query('DELETE FROM map_tiles WHERE map_id = ?', [mapId]);
  await db.query('DELETE FROM map_tasks WHERE map_id = ?', [mapId]);
  const TILEMAP = { '#': 'wall', '.': 'floor', 'p': 'plate', 'g': 'grate', 'h': 'hazard', 'd': 'door', 'e': 'evac' };
  const rows = [];
  map.floors.forEach((fl, fi) => {
    fl.grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const type = ch === ' ' ? 'void' : (TILEMAP[ch] || 'floor');
        rows.push([mapId, fi, x, y, type]);
      }
    });
  });
  const BATCH = 400;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map(() => '(?,?,?,?,?)').join(',');
    const params = chunk.flat();
    await db.query(`INSERT INTO map_tiles (map_id, floor, x, y, type) VALUES ${values}`, params);
  }
  for (const t of map.tasks) {
    await db.query('INSERT INTO map_tasks (map_id, task_id, type, floor, x, y, duration, weight) VALUES (?,?,?,?,?,?,?,?)',
      [mapId, t.id, t.type, t.floor, t.x, t.y, t.duration, t.weight]);
  }
}

/** Charge la config de jeu depuis la base (valeurs par défaut si absentes). */
export async function loadGameConfig() {
  const rows = await db.query('SELECT key, value FROM game_config');
  const cfg = { ...DEFAULT_GAME_CONFIG };
  for (const r of rows) {
    if (r.key in cfg) cfg[r.key] = safeJsonParse(r.value, cfg[r.key]);
  }
  return cfg;
}
