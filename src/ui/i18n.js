// src/ui/i18n.js — Internationalisation FR / EN.

const FR = {
  // Auth
  auth_login: 'Connexion', auth_register: 'Créer un compte', auth_uname: 'Pseudo', auth_pword: 'Mot de passe',
  auth_pword_hint: '8 caractères min., lettres + chiffres', auth_go: 'Entrer dans le bunker', auth_bad: 'Pseudo ou mot de passe incorrect',
  auth_taken: 'Pseudo déjà utilisé', auth_bad_uname: 'Pseudo : 3-16 caractères (lettres, chiffres, - _)', auth_bad_pword: 'Mot de passe trop faible',
  auth_suspended: 'Compte suspendu', auth_banned: 'Compte banni', auth_first_admin: 'Premier compte → admin',
  // Lobby
  play: 'Jouer', shop: 'Boutique', fighters: 'Fighters', friends: 'Amis', clans: 'Clans', pass: 'Pass',
  quests: 'Quêtes', news: 'Nouveautés', gifts: 'Cadeaux', leaderboard: 'Classement', settings: 'Paramètres',
  admin: 'Admin', logout: 'Déconnexion', notifications: 'Notifications',
  play_solo: 'Survival', play_desc: 'Chacun pour soi. Réparez le bunker ou soyez le dernier survivant.',
  map_select: 'Map', select: 'Sélectionner', selected: 'Sélectionné', launch: 'Lancer', searching: 'Recherche de partie…',
  cancel: 'Annuler', waiting_players: 'En attente de joueurs…', invited_by: 'invité par',
  // Boutique
  buy: 'Acheter', owned: 'Possédé', not_enough: 'Fonds insuffisants', category_all: 'Tout', cat_skins: 'Skins',
  cat_emotes: 'Emotes', cat_tags: 'Tags', cat_effects: 'Effets', cat_cosmetics: 'Cosmétiques',
  // Fighters
  choose_fighter: 'Choisissez votre Fighter', stats: 'Stats', hp: 'Vie', speed: 'Vitesse', damage: 'Dégâts',
  special: 'Compétence', attack: 'Attaque', repair_mult: 'Vitesse de réparation', range: 'Portée',
  sp_dash: 'Ruée', sp_shield: 'Bouclier', sp_overcharge: 'Surcharge', sp_medkit: 'Trousse de soins', sp_cloak: 'Camouflage',
  // Amis
  add_friend: 'Ajouter un ami', friend_uname: 'Pseudo du joueur', send: 'Envoyer', requests: 'Demandes',
  accept: 'Accepter', refuse: 'Refuser', remove: 'Retirer', invite_match: 'Inviter en partie', online: 'En ligne',
  offline: 'Hors ligne', no_friends: 'Aucun ami pour le moment. Ajoutez des survivants !',
  // Clans
  create_clan: 'Créer un clan', clan_name: 'Nom du clan', clan_tag: 'Tag (2-6)', clan_emblem: 'Emblème',
  clan_desc: 'Description', join_clan: 'Rejoindre', leave_clan: 'Quitter', kick: 'Exclure', chat: 'Chat de clan',
  members: 'Membres', leader: 'Chef', officer: 'Officier', member: 'Membre', clan_chat_hint: 'Message…', send_msg: 'Envoyer',
  clan_invites_you: 'invitations reçues', no_clan: 'Vous n’avez pas de clan.',
  // Pass
  pass_level: 'Niveau', claim: 'Récupérer', claimed: 'Récupéré', pass_desc: 'Gagnez de l’XP en jouant : parties, victoires, éliminations, tâches.',
  // Quêtes
  daily: 'Quotidiennes', weekly: 'Hebdomadaires', seasonal: 'Saisonnières', progress: 'Progression',
  q_stat_kills: 'éliminations', q_stat_tasks: 'tâches réparées', q_stat_wins: 'victoires', q_stat_matches: 'parties', q_stat_damage: 'dégâts',
  // Cadeaux
  claim_gift: 'Ouvrir', gift_from: 'Cadeau de l’administration', no_gifts: 'Aucun cadeau disponible.',
  // Classement
  lb_players: 'Joueurs', lb_clans: 'Clans', cat_trophies: 'Trophées', cat_wins: 'Victoires', cat_kills: 'Éliminations',
  cat_seasonal: 'Saison', rank: 'Rang', trophies: 'Trophées', wins: 'Victoires', kills: 'Élims', level: 'Niveau',
  // Settings
  set_audio: 'Audio', set_master: 'Volume général', set_music: 'Musique / ambiance', set_sfx: 'Effets',
  set_controls: 'Commandes', set_keybinds: 'Touches (clavier)', set_key_hint: 'Cliquez sur une touche puis appuyez sur la nouvelle.',
  set_display: 'Affichage', set_zoom: 'Zoom caméra', set_lang: 'Langue', reset_binds: 'Réinitialiser',
  bind_up: 'Haut', bind_down: 'Bas', bind_left: 'Gauche', bind_right: 'Droite', bind_attack: 'Attaque',
  bind_interact: 'Interagir', bind_special: 'Compétence', bind_map: 'Carte', bind_emote: 'Emote',
  // Jeu
  repair_left: 'Réparation', radiation_in: 'Intoxication dans', radiation_active: 'INTOXICATION NUCLÉAIRE',
  evac_open: 'ÉVACUATION OUVERTE', join_evac: 'Rejoignez la zone d’évacuation !', extracting: 'Extraction…',
  extracted: 'Extrait !', alive: 'Vivants', interact_repair: 'Réparer', interact_stairs: 'Escalier', use: 'Utiliser',
  you_died: 'Vous êtes éliminé', spectate: 'Partie en cours…', match_over: 'Fin de partie',
  victory_survival: 'VICTOIRE SURVIVAL', victory_bunker: 'VICTOIRE BUNKER', draw_no_survivor: 'Personne n’a survécu…',
  you_win: 'Vous avez gagné !', you_lose: 'Défaite…', draw: 'Égalité',
  rew_xp: 'XP', rew_coins: 'Écrous', rew_trophies: 'Trophées', back_lobby: 'Retour au lobby',
  killed_by: 'éliminé par', killed: 'a éliminé', repaired: 'a réparé', reconnected: 'est de retour', disconnected: 's’est déconnecté',
  fps: 'FPS', loading_map: 'Chargement du bunker…', reconnecting: 'Reconnexion…',
  // Admin
  adm_players: 'Joueurs', adm_rooms: 'Parties', adm_config: 'Règles', adm_maps: 'Maps', adm_fighters: 'Fighters',
  adm_skins: 'Skins', adm_textures: 'Textures', adm_shop: 'Boutique', adm_quests: 'Quêtes', adm_pass: 'Pass',
  adm_news: 'Nouveautés', adm_clans: 'Clans', adm_gifts: 'Cadeaux', adm_notifs: 'Notifs', adm_sounds: 'Sons',
  adm_logs: 'Logs', save: 'Enregistrer', delete: 'Supprimer', create: 'Créer', edit: 'Modifier', publish: 'Publier',
  unpublish: 'Dépublier', duplicate: 'Dupliquer', test_map: 'Tester', ban: 'Bannir', unban: 'Débannir',
  suspend: 'Suspendre', unsuspend: 'Lever', make_admin: 'Promouvoir admin', remove_admin: 'Retirer admin',
  grant: 'Donner', search: 'Rechercher…', sound_mode: 'Mode', sound_synth: 'Synthèse', sound_file: 'Fichier',
  upload_file: 'Importer un fichier', play_sound: 'Écouter', floor: 'Étage', floors: 'Étages', grid_size: 'Taille',
  tasks_label: 'Tâches', stairs_label: 'Escaliers', spawn_label: 'Spawns', evac_label: 'Évacuation', hazard_label: 'Danger',
  no_logs: 'Aucune action enregistrée.', confirm: 'Confirmer', old_value: 'Ancien', new_value: 'Nouveau',
  // Divers
  close: 'Fermer', ok: 'OK', loading: 'Chargement…', server_error: 'Erreur serveur, réessayez.', rate_limited: 'Trop de requêtes, patientez.',
  coins: 'Écrous', cores: 'Cœurs', emote: 'Emote', update_ready: 'Nouvelle version disponible — rechargez la page.',
  player_profile: 'Profil', send_invite: 'Inviter', sent: 'Envoyé ✓', none: 'Aucun'
};

const EN = {
  auth_login: 'Sign in', auth_register: 'Create account', auth_uname: 'Username', auth_pword: 'Password',
  auth_pword_hint: '8+ chars, letters + digits', auth_go: 'Enter the bunker', auth_bad: 'Wrong username or password',
  auth_taken: 'Username already taken', auth_bad_uname: 'Username: 3-16 chars (letters, digits, - _)', auth_bad_pword: 'Password too weak',
  auth_suspended: 'Account suspended', auth_banned: 'Account banned', auth_first_admin: 'First account → admin',
  play: 'Play', shop: 'Shop', fighters: 'Fighters', friends: 'Friends', clans: 'Clans', pass: 'Pass',
  quests: 'Quests', news: 'News', gifts: 'Gifts', leaderboard: 'Leaderboard', settings: 'Settings',
  admin: 'Admin', logout: 'Log out', notifications: 'Notifications',
  play_solo: 'Survival', play_desc: 'Free-for-all. Repair the bunker or be the last survivor.',
  map_select: 'Map', select: 'Select', selected: 'Selected', launch: 'Launch', searching: 'Searching for a match…',
  cancel: 'Cancel', waiting_players: 'Waiting for players…', invited_by: 'invited by',
  buy: 'Buy', owned: 'Owned', not_enough: 'Not enough funds', category_all: 'All', cat_skins: 'Skins',
  cat_emotes: 'Emotes', cat_tags: 'Tags', cat_effects: 'Effects', cat_cosmetics: 'Cosmetics',
  choose_fighter: 'Choose your Fighter', stats: 'Stats', hp: 'Health', speed: 'Speed', damage: 'Damage',
  special: 'Special', attack: 'Attack', repair_mult: 'Repair speed', range: 'Range',
  sp_dash: 'Dash', sp_shield: 'Shield', sp_overcharge: 'Overcharge', sp_medkit: 'Medkit', sp_cloak: 'Cloak',
  add_friend: 'Add a friend', friend_uname: 'Player username', send: 'Send', requests: 'Requests',
  accept: 'Accept', refuse: 'Decline', remove: 'Remove', invite_match: 'Invite to match', online: 'Online',
  offline: 'Offline', no_friends: 'No friends yet. Add some survivors!',
  create_clan: 'Create a clan', clan_name: 'Clan name', clan_tag: 'Tag (2-6)', clan_emblem: 'Emblem',
  clan_desc: 'Description', join_clan: 'Join', leave_clan: 'Leave', kick: 'Kick', chat: 'Clan chat',
  members: 'Members', leader: 'Leader', officer: 'Officer', member: 'Member', clan_chat_hint: 'Message…', send_msg: 'Send',
  clan_invites_you: 'pending invites', no_clan: 'You are not in a clan.',
  pass_level: 'Level', claim: 'Claim', claimed: 'Claimed', pass_desc: 'Earn XP by playing: matches, wins, kills, tasks.',
  daily: 'Daily', weekly: 'Weekly', seasonal: 'Seasonal', progress: 'Progress',
  q_stat_kills: 'eliminations', q_stat_tasks: 'tasks repaired', q_stat_wins: 'wins', q_stat_matches: 'matches', q_stat_damage: 'damage',
  claim_gift: 'Open', gift_from: 'Gift from the administration', no_gifts: 'No gifts available.',
  lb_players: 'Players', lb_clans: 'Clans', cat_trophies: 'Trophies', cat_wins: 'Wins', cat_kills: 'Eliminations',
  cat_seasonal: 'Season', rank: 'Rank', trophies: 'Trophies', wins: 'Wins', kills: 'Kills', level: 'Level',
  set_audio: 'Audio', set_master: 'Master volume', set_music: 'Music / ambience', set_sfx: 'Effects',
  set_controls: 'Controls', set_keybinds: 'Keys (keyboard)', set_key_hint: 'Click a key then press the new one.',
  set_display: 'Display', set_zoom: 'Camera zoom', set_lang: 'Language', reset_binds: 'Reset',
  bind_up: 'Up', bind_down: 'Down', bind_left: 'Left', bind_right: 'Right', bind_attack: 'Attack',
  bind_interact: 'Interact', bind_special: 'Special', bind_map: 'Map', bind_emote: 'Emote',
  repair_left: 'Repair', radiation_in: 'Radiation in', radiation_active: 'NUCLEAR POISONING',
  evac_open: 'EVACUATION OPEN', join_evac: 'Reach the evacuation zone!', extracting: 'Extracting…',
  extracted: 'Extracted!', alive: 'Alive', interact_repair: 'Repair', interact_stairs: 'Stairs', use: 'Use',
  you_died: 'You were eliminated', spectate: 'Match in progress…', match_over: 'Match over',
  victory_survival: 'SURVIVAL VICTORY', victory_bunker: 'BUNKER VICTORY', draw_no_survivor: 'Nobody survived…',
  you_win: 'You won!', you_lose: 'Defeat…', draw: 'Draw',
  rew_xp: 'XP', rew_coins: 'Nuts', rew_trophies: 'Trophies', back_lobby: 'Back to lobby',
  killed_by: 'eliminated by', killed: 'eliminated', repaired: 'repaired', reconnected: 'is back', disconnected: 'disconnected',
  fps: 'FPS', loading_map: 'Loading the bunker…', reconnecting: 'Reconnecting…',
  adm_players: 'Players', adm_rooms: 'Matches', adm_config: 'Rules', adm_maps: 'Maps', adm_fighters: 'Fighters',
  adm_skins: 'Skins', adm_textures: 'Textures', adm_shop: 'Shop', adm_quests: 'Quests', adm_pass: 'Pass',
  adm_news: 'News', adm_clans: 'Clans', adm_gifts: 'Gifts', adm_notifs: 'Notifs', adm_sounds: 'Sounds',
  adm_logs: 'Logs', save: 'Save', delete: 'Delete', create: 'Create', edit: 'Edit', publish: 'Publish',
  unpublish: 'Unpublish', duplicate: 'Duplicate', test_map: 'Test', ban: 'Ban', unban: 'Unban',
  suspend: 'Suspend', unsuspend: 'Lift', make_admin: 'Make admin', remove_admin: 'Remove admin',
  grant: 'Grant', search: 'Search…', sound_mode: 'Mode', sound_synth: 'Synthesis', sound_file: 'File',
  upload_file: 'Upload a file', play_sound: 'Listen', floor: 'Floor', floors: 'Floors', grid_size: 'Size',
  tasks_label: 'Tasks', stairs_label: 'Stairs', spawn_label: 'Spawns', evac_label: 'Evac', hazard_label: 'Hazard',
  no_logs: 'No logged actions yet.', confirm: 'Confirm', old_value: 'Old', new_value: 'New',
  close: 'Close', ok: 'OK', loading: 'Loading…', server_error: 'Server error, try again.', rate_limited: 'Too many requests, wait a bit.',
  coins: 'Nuts', cores: 'Cores', emote: 'Emote', update_ready: 'New version available — reload the page.',
  player_profile: 'Profile', send_invite: 'Invite', sent: 'Sent ✓', none: 'None'
};

let current = 'fr';
const dicts = { fr: FR, en: EN };

export function setLang(lang) {
  if (dicts[lang]) current = lang;
}
export function getLang() { return current; }

export function t(key) {
  return dicts[current]?.[key] ?? dicts.fr[key] ?? key;
}
