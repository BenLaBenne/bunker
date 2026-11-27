// server/config.js — Constantes serveur + configuration de jeu (modifiable via l'admin)

export const SERVER = {
  TICK_MS: 50,            // 20 ticks/s — simulation autoritaire
  SNAPSHOT_HZ: 10,        // envoi des snapshots
  VISION_HZ: 4,           // recalcul de la vision par joueur
  VISION_RADIUS: 9,       // rayon de vision (cases)
  PLAYER_RADIUS: 0.32,    // rayon de collision (cases)
  INTERACT_RANGE: 1.45,   // portée d'interaction (cases)
  STAIR_RANGE: 1.45,
  ATTACK_HAZARD_DPS: 8,   // dégâts/s des zones dangereuses pendant l'intoxication
  DISCONNECT_GRACE_S: 45, // délai avant qu'un joueur déconnecté soit pris en charge par un bot
  MAX_MATCH_S: 1200,      // garde-fou : durée max d'une partie
  EXTRACT_TIME_S: 2.5     // temps à rester dans la zone d'évacuation
};

// Configuration de jeu par défaut — chaque valeur est stockée dans la table
// game_config et modifiable depuis le panneau Admin (Parties > Règles).
export const DEFAULT_GAME_CONFIG = {
  maxPlayers: 10,
  fillBots: true,
  botDifficulty: 'normal',          // easy | normal | hard
  minHumansToStart: 1,
  lobbyCountdownS: 12,              // délai avant le lancement après le premier joueur en file
  // Réparation & intox
  repairTimeS: 360,                 // temps avant l'intoxication nucléaire
  radiationAlertS: 30,              // alerte N secondes avant la fin du délai
  radiationGraceS: 90,              // après le délai : phase d'alerte puis dégâts
  radiationArmorDrain: 3.5,         // armure perdue /s pendant l'intoxication
  radiationDamage: 5,               // dégâts HP /s quand l'armure est à 0
  // Armure anti-nucléaire
  armorMax: 100,
  startArmor: 50,
  killArmorBonus: 20,
  taskArmorBonus: 2,
  // Évacuation
  evacTimeS: 60,                    // délai pour atteindre l'évacuation après réparation complète
  // Récompenses
  killCoins: 25,
  taskCoins: 10,
  winCoins: 100,
  loseCoins: 25,
  xpBase: 20,
  xpKill: 15,
  xpTask: 8,
  xpWin: 50,
  trophiesWin: 8,
  trophiesLose: 4,                  // trophées retirés en cas de défaite (jamais < 0 au total)
  xpPerPassLevel: 100
};

// Difficultés des bots
export const BOT_DIFFICULTY = {
  easy:   { aggro: 3.2, reaction: 0.65, aimError: 0.55, taskSpeed: 0.6,  dodge: 0.1 },
  normal: { aggro: 5.0, reaction: 0.35, aimError: 0.30, taskSpeed: 0.85, dodge: 0.3 },
  hard:   { aggro: 7.0, reaction: 0.18, aimError: 0.15, taskSpeed: 1.0,  dodge: 0.55 }
};

export const BOT_NAMES = [
  'Rex-7', 'Sable', 'Kilo', 'Nova', 'Ratchet', 'Zed', 'Mira', 'Orion', 'Bolt', 'Vex',
  'Cendre', 'Delta', 'Falco', 'Indy', 'Juno'
];

// Types de tuiles : collisions et visibilité
export const TILE = {
  VOID: 'void',       // roche — solide, bloque la vision
  WALL: 'wall',       // solide, bloque la vision
  FLOOR: 'floor',
  PLATE: 'plate',
  GRATE: 'grate',
  HAZARD: 'hazard',   // praticable, dégâts pendant l'intoxication
  DOOR: 'door',       // praticable, ne bloque pas la vision (lisibilité)
  EVAC: 'evac'        // zone d'évacuation
};
export const SOLID = new Set([TILE.VOID, TILE.WALL]);
export const OPAQUE = new Set([TILE.VOID, TILE.WALL]);
