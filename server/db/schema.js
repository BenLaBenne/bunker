// server/db/schema.js — Schéma complet (tables + index), compatible PostgreSQL et SQLite.
// Toutes les données sensibles restent côté serveur. Mots de passe hashés (bcryptjs).

function table(dialect, name, sqliteCols, pgCols, extra = '') {
  const cols = dialect === 'sqlite' ? sqliteCols : pgCols;
  return `CREATE TABLE IF NOT EXISTS ${name} (${cols})${extra};`;
}

export function schemaStatements(dialect) {
  const S = [];
  const T = (name, sqliteCols, pgCols) => S.push(table(dialect, name, sqliteCols, pgCols));

  T('users',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, uname TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0, banned INTEGER DEFAULT 0,
     suspended_until TEXT, created_at TEXT, last_login TEXT,
     level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, trophies INTEGER DEFAULT 0,
     season_trophies INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, kills INTEGER DEFAULT 0,
     deaths INTEGER DEFAULT 0, tasks_done INTEGER DEFAULT 0, matches INTEGER DEFAULT 0,
     coins INTEGER DEFAULT 500, cores INTEGER DEFAULT 10,
     selected_fighter TEXT DEFAULT 'rust', selected_skin TEXT DEFAULT '',
     settings TEXT DEFAULT '{}', lang TEXT DEFAULT 'fr'`,
    `id SERIAL PRIMARY KEY, uname VARCHAR(16) UNIQUE NOT NULL,
     password_hash TEXT NOT NULL, is_admin SMALLINT DEFAULT 0, banned SMALLINT DEFAULT 0,
     suspended_until TIMESTAMPTZ, created_at TIMESTAMPTZ, last_login TIMESTAMPTZ,
     level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, trophies INTEGER DEFAULT 0,
     season_trophies INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, kills INTEGER DEFAULT 0,
     deaths INTEGER DEFAULT 0, tasks_done INTEGER DEFAULT 0, matches INTEGER DEFAULT 0,
     coins INTEGER DEFAULT 500, cores INTEGER DEFAULT 10,
     selected_fighter VARCHAR(32) DEFAULT 'rust', selected_skin TEXT DEFAULT '',
     settings JSONB DEFAULT '{}', lang VARCHAR(4) DEFAULT 'fr'`);

  T('sessions',
    `id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT, expires_at TEXT`,
    `id VARCHAR(64) PRIMARY KEY, user_id INTEGER NOT NULL, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ`);

  T('fighters',
    `id TEXT PRIMARY KEY, name TEXT, name_en TEXT, description TEXT, description_en TEXT,
     rarity TEXT DEFAULT 'commun', price INTEGER DEFAULT 0, currency TEXT DEFAULT 'coins',
     hp INTEGER DEFAULT 100, speed REAL DEFAULT 3.8, damage INTEGER DEFAULT 14,
     attack_type TEXT DEFAULT 'ranged', attack_range REAL DEFAULT 4.2, attack_cooldown REAL DEFAULT 0.6,
     special TEXT DEFAULT '', special_cd REAL DEFAULT 10, repair_mult REAL DEFAULT 1,
     published INTEGER DEFAULT 1, sort INTEGER DEFAULT 0`,
    `id VARCHAR(32) PRIMARY KEY, name TEXT, name_en TEXT, description TEXT, description_en TEXT,
     rarity VARCHAR(12) DEFAULT 'commun', price INTEGER DEFAULT 0, currency VARCHAR(8) DEFAULT 'coins',
     hp INTEGER DEFAULT 100, speed REAL DEFAULT 3.8, damage INTEGER DEFAULT 14,
     attack_type VARCHAR(8) DEFAULT 'ranged', attack_range REAL DEFAULT 4.2, attack_cooldown REAL DEFAULT 0.6,
     special VARCHAR(16) DEFAULT '', special_cd REAL DEFAULT 10, repair_mult REAL DEFAULT 1,
     published SMALLINT DEFAULT 1, sort INTEGER DEFAULT 0`);

  T('skins',
    `id TEXT PRIMARY KEY, fighter_id TEXT NOT NULL, name TEXT, name_en TEXT,
     rarity TEXT DEFAULT 'commun', price INTEGER DEFAULT 0, currency TEXT DEFAULT 'coins',
     data TEXT, published INTEGER DEFAULT 0, created_by INTEGER, created_at TEXT`,
    `id VARCHAR(32) PRIMARY KEY, fighter_id VARCHAR(32) NOT NULL, name TEXT, name_en TEXT,
     rarity VARCHAR(12) DEFAULT 'commun', price INTEGER DEFAULT 0, currency VARCHAR(8) DEFAULT 'coins',
     data TEXT, published SMALLINT DEFAULT 0, created_by INTEGER, created_at TIMESTAMPTZ`);

  T('textures',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, category TEXT DEFAULT 'misc',
     rarity TEXT DEFAULT 'commun', mime TEXT, data BLOB, size INTEGER DEFAULT 0,
     published INTEGER DEFAULT 1, created_by INTEGER, created_at TEXT`,
    `id SERIAL PRIMARY KEY, name TEXT, category VARCHAR(24) DEFAULT 'misc',
     rarity VARCHAR(12) DEFAULT 'commun', mime VARCHAR(40), data BYTEA, size INTEGER DEFAULT 0,
     published SMALLINT DEFAULT 1, created_by INTEGER, created_at TIMESTAMPTZ`);

  T('maps',
    `id TEXT PRIMARY KEY, name TEXT, name_en TEXT, description TEXT, description_en TEXT,
     data TEXT, published INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT`,
    `id VARCHAR(32) PRIMARY KEY, name TEXT, name_en TEXT, description TEXT, description_en TEXT,
     data TEXT, published SMALLINT DEFAULT 0, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ`);

  T('map_tiles',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, map_id TEXT NOT NULL, floor INTEGER, x INTEGER, y INTEGER, type TEXT`,
    `id SERIAL PRIMARY KEY, map_id VARCHAR(32) NOT NULL, floor INTEGER, x INTEGER, y INTEGER, type VARCHAR(12)`);

  T('map_tasks',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, map_id TEXT NOT NULL, task_id TEXT, type TEXT,
     floor INTEGER, x INTEGER, y INTEGER, duration REAL, weight REAL`,
    `id SERIAL PRIMARY KEY, map_id VARCHAR(32) NOT NULL, task_id VARCHAR(32), type VARCHAR(24),
     floor INTEGER, x INTEGER, y INTEGER, duration REAL, weight REAL`);

  T('shop_items',
    `id TEXT PRIMARY KEY, name TEXT, name_en TEXT, description TEXT, description_en TEXT,
     category TEXT DEFAULT 'skins', rarity TEXT DEFAULT 'commun', price INTEGER DEFAULT 100,
     currency TEXT DEFAULT 'coins', available INTEGER DEFAULT 1, image INTEGER,
     payload TEXT DEFAULT '{}', created_at TEXT`,
    `id VARCHAR(32) PRIMARY KEY, name TEXT, name_en TEXT, description TEXT, description_en TEXT,
     category VARCHAR(16) DEFAULT 'skins', rarity VARCHAR(12) DEFAULT 'commun', price INTEGER DEFAULT 100,
     currency VARCHAR(8) DEFAULT 'coins', available SMALLINT DEFAULT 1, image INTEGER,
     payload JSONB DEFAULT '{}', created_at TIMESTAMPTZ`);

  T('inventory',
    `user_id INTEGER, item_type TEXT, item_id TEXT, qty INTEGER DEFAULT 1, acquired_at TEXT,
     PRIMARY KEY (user_id, item_type, item_id)`,
    `user_id INTEGER, item_type VARCHAR(16), item_id VARCHAR(64), qty INTEGER DEFAULT 1, acquired_at TIMESTAMPTZ,
     PRIMARY KEY (user_id, item_type, item_id)`);

  T('friends',
    `user_id INTEGER, friend_id INTEGER, created_at TEXT, PRIMARY KEY (user_id, friend_id)`,
    `user_id INTEGER, friend_id INTEGER, created_at TIMESTAMPTZ, PRIMARY KEY (user_id, friend_id)`);

  T('friend_requests',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER, to_id INTEGER, created_at TEXT`,
    `id SERIAL PRIMARY KEY, from_id INTEGER, to_id INTEGER, created_at TIMESTAMPTZ`);

  T('clans',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, tag TEXT, emblem TEXT DEFAULT '☢',
     emblem_color TEXT DEFAULT '#7fff6a', leader_id INTEGER, description TEXT,
     trophies INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, level INTEGER DEFAULT 1, created_at TEXT`,
    `id SERIAL PRIMARY KEY, name VARCHAR(24) UNIQUE, tag VARCHAR(6), emblem VARCHAR(8) DEFAULT '☢',
     emblem_color VARCHAR(9) DEFAULT '#7fff6a', leader_id INTEGER, description TEXT,
     trophies INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, level INTEGER DEFAULT 1, created_at TIMESTAMPTZ`);

  T('clan_members',
    `clan_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'member', joined_at TEXT,
     PRIMARY KEY (clan_id, user_id)`,
    `clan_id INTEGER, user_id INTEGER, role VARCHAR(10) DEFAULT 'member', joined_at TIMESTAMPTZ,
     PRIMARY KEY (clan_id, user_id)`);

  T('clan_invites',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, clan_id INTEGER, user_id INTEGER, from_id INTEGER, created_at TEXT`,
    `id SERIAL PRIMARY KEY, clan_id INTEGER, user_id INTEGER, from_id INTEGER, created_at TIMESTAMPTZ`);

  T('clan_messages',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, clan_id INTEGER, user_id INTEGER, uname TEXT,
     message TEXT, created_at TEXT`,
    `id SERIAL PRIMARY KEY, clan_id INTEGER, user_id INTEGER, uname VARCHAR(16),
     message TEXT, created_at TIMESTAMPTZ`);

  T('matches',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, map_id TEXT, mode TEXT DEFAULT 'survival',
     started_at TEXT, ended_at TEXT, winner_type TEXT, winners TEXT, config TEXT`,
    `id SERIAL PRIMARY KEY, map_id VARCHAR(32), mode VARCHAR(12) DEFAULT 'survival',
     started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, winner_type VARCHAR(12), winners JSONB, config JSONB`);

  T('match_players',
    `match_id INTEGER, user_id INTEGER, uname TEXT, fighter_id TEXT, is_bot INTEGER DEFAULT 0,
     kills INTEGER DEFAULT 0, deaths INTEGER DEFAULT 0, tasks_done INTEGER DEFAULT 0,
     damage INTEGER DEFAULT 0, survived_s INTEGER DEFAULT 0, won INTEGER DEFAULT 0,
     xp_gained INTEGER DEFAULT 0, coins_gained INTEGER DEFAULT 0,
     PRIMARY KEY (match_id, user_id)`,
    `match_id INTEGER, user_id INTEGER, uname VARCHAR(16), fighter_id VARCHAR(32), is_bot SMALLINT DEFAULT 0,
     kills INTEGER DEFAULT 0, deaths INTEGER DEFAULT 0, tasks_done INTEGER DEFAULT 0,
     damage INTEGER DEFAULT 0, survived_s INTEGER DEFAULT 0, won SMALLINT DEFAULT 0,
     xp_gained INTEGER DEFAULT 0, coins_gained INTEGER DEFAULT 0,
     PRIMARY KEY (match_id, user_id)`);

  T('tasks_progress',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER, user_id INTEGER, task_id TEXT,
     progress REAL DEFAULT 0, done INTEGER DEFAULT 0`,
    `id SERIAL PRIMARY KEY, match_id INTEGER, user_id INTEGER, task_id VARCHAR(32),
     progress REAL DEFAULT 0, done SMALLINT DEFAULT 0`);

  T('quests',
    `id TEXT PRIMARY KEY, type TEXT DEFAULT 'daily', stat TEXT DEFAULT 'kills', goal INTEGER DEFAULT 3,
     reward_xp INTEGER DEFAULT 30, reward_coins INTEGER DEFAULT 50, reward_cores INTEGER DEFAULT 0,
     name TEXT, name_en TEXT, icon TEXT DEFAULT '⚔', published INTEGER DEFAULT 1, sort INTEGER DEFAULT 0`,
    `id VARCHAR(32) PRIMARY KEY, type VARCHAR(10) DEFAULT 'daily', stat VARCHAR(16) DEFAULT 'kills', goal INTEGER DEFAULT 3,
     reward_xp INTEGER DEFAULT 30, reward_coins INTEGER DEFAULT 50, reward_cores INTEGER DEFAULT 0,
     name TEXT, name_en TEXT, icon VARCHAR(8) DEFAULT '⚔', published SMALLINT DEFAULT 1, sort INTEGER DEFAULT 0`);

  T('quest_progress',
    `user_id INTEGER, quest_id TEXT, period TEXT, progress INTEGER DEFAULT 0, claimed INTEGER DEFAULT 0,
     PRIMARY KEY (user_id, quest_id, period)`,
    `user_id INTEGER, quest_id VARCHAR(32), period VARCHAR(16), progress INTEGER DEFAULT 0, claimed SMALLINT DEFAULT 0,
     PRIMARY KEY (user_id, quest_id, period)`);

  T('pass_rewards',
    `level INTEGER PRIMARY KEY, type TEXT, id TEXT DEFAULT '', qty INTEGER DEFAULT 1`,
    `level INTEGER PRIMARY KEY, type VARCHAR(16), id VARCHAR(64) DEFAULT '', qty INTEGER DEFAULT 1`);

  T('pass_progress',
    `user_id INTEGER, level INTEGER, claimed INTEGER DEFAULT 0, claimed_at TEXT,
     PRIMARY KEY (user_id, level)`,
    `user_id INTEGER, level INTEGER, claimed SMALLINT DEFAULT 0, claimed_at TIMESTAMPTZ,
     PRIMARY KEY (user_id, level)`);

  T('news',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, title_en TEXT, body TEXT, body_en TEXT,
     image INTEGER, author TEXT, published INTEGER DEFAULT 0, created_at TEXT`,
    `id SERIAL PRIMARY KEY, title TEXT, title_en TEXT, body TEXT, body_en TEXT,
     image INTEGER, author VARCHAR(16), published SMALLINT DEFAULT 0, created_at TIMESTAMPTZ`);

  T('notifications',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, title TEXT, body TEXT, created_at TEXT`,
    `id SERIAL PRIMARY KEY, user_id INTEGER, type VARCHAR(16), title TEXT, body TEXT, created_at TIMESTAMPTZ`);

  T('notification_reads',
    `user_id INTEGER, notification_id INTEGER, read_at TEXT, PRIMARY KEY (user_id, notification_id)`,
    `user_id INTEGER, notification_id INTEGER, read_at TIMESTAMPTZ, PRIMARY KEY (user_id, notification_id)`);

  T('gifts',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, message TEXT, reward_type TEXT,
     reward_id TEXT DEFAULT '', qty INTEGER DEFAULT 1, targets TEXT DEFAULT 'all',
     expires_at TEXT, max_claims INTEGER DEFAULT 0, claimed INTEGER DEFAULT 0,
     created_by INTEGER, created_at TEXT`,
    `id SERIAL PRIMARY KEY, title TEXT, message TEXT, reward_type VARCHAR(16),
     reward_id VARCHAR(64) DEFAULT '', qty INTEGER DEFAULT 1, targets JSONB DEFAULT 'all',
     expires_at TIMESTAMPTZ, max_claims INTEGER DEFAULT 0, claimed INTEGER DEFAULT 0,
     created_by INTEGER, created_at TIMESTAMPTZ`);

  T('gift_claims',
    `gift_id INTEGER, user_id INTEGER, claimed_at TEXT, PRIMARY KEY (gift_id, user_id)`,
    `gift_id INTEGER, user_id INTEGER, claimed_at TIMESTAMPTZ, PRIMARY KEY (gift_id, user_id)`);

  T('admin_logs',
    `id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, admin_uname TEXT, action TEXT,
     target_type TEXT, target_id TEXT, old_value TEXT, new_value TEXT, created_at TEXT`,
    `id SERIAL PRIMARY KEY, admin_id INTEGER, admin_uname VARCHAR(16), action VARCHAR(40),
     target_type VARCHAR(24), target_id VARCHAR(64), old_value JSONB, new_value JSONB, created_at TIMESTAMPTZ`);

  T('game_config',
    `key TEXT PRIMARY KEY, value TEXT`,
    `key VARCHAR(40) PRIMARY KEY, value JSONB`);

  T('sounds',
    `id TEXT PRIMARY KEY, name TEXT, mode TEXT DEFAULT 'synth', file BLOB, mime TEXT,
     params TEXT DEFAULT '{}', updated_at TEXT`,
    `id VARCHAR(32) PRIMARY KEY, name TEXT, mode VARCHAR(6) DEFAULT 'synth', file BYTEA, mime VARCHAR(40),
     params JSONB DEFAULT '{}', updated_at TIMESTAMPTZ`);

  // Index pour les classements et recherches
  const IX = [
    ['users', 'trophies'], ['users', 'wins'], ['users', 'kills'], ['users', 'level'], ['users', 'season_trophies'],
    ['sessions', 'user_id'], ['friends', 'friend_id'], ['friend_requests', 'to_id'],
    ['clan_members', 'user_id'], ['clan_messages', 'clan_id'], ['map_tiles', 'map_id'], ['map_tasks', 'map_id'],
    ['inventory', 'item_id'], ['quests', 'type'], ['news', 'published'], ['gifts', 'expires_at'],
    ['admin_logs', 'created_at'], ['notification_reads', 'notification_id']
  ];
  for (const [t, c] of IX) {
    S.push(`CREATE INDEX IF NOT EXISTS idx_${t}_${c} ON ${t}(${c});`);
  }
  return S;
}
