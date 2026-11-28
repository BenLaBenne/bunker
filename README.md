# ☣ BUNKER

**BUNKER** is a 2D top-down multiplayer survival game (Brawl Stars-style view) delivered as a PWA. 10 players (or bots) are locked in a nuclear bunker spread over 3 floors: repair the shared machines before the radiation kills everyone, eliminate the others for armor, or hold out until the end — only the survivors in the extraction zone win.

Pure vanilla JavaScript (ES modules, zero build step) on both client and server.

---

## Gameplay (mode Survival)

| Rule | Detail |
|---|---|
| Players | 10 per match — human players are auto-completed with AI bots |
| Map | Bunker A-7: 3 floors (reactor / habitation / surface), 28×20 grid per floor, 4 staircases |
| Objective | Repair the bunker machines together (hold `E` on a broken machine) |
| Radiation | Progressive phases: warning → grace → damage ticks for everyone still inside |
| Combat | Melee + ranged projectiles. A kill grants **+20 anti-nuclear armor** |
| Special skills | Dash, shield, overcharge, medkit, cloak (per fighter) |
| Extraction | Reach the surface extraction zone and hold it (2.5 s) to win instantly |
| Victory | Last survivor, extraction, or machine repairs completed in time |
| Fog of war | 3 states: visible / explored / unknown, with line-of-sight occlusion and 2D lighting |

## Feature list

- **Accounts**: username/password, bcrypt hashing, httpOnly cookie sessions
- **Admin panel**: first registered account becomes admin (or `ADMIN_USERNAME`/`ADMIN_PASSWORD` env) — full CRUD over fighters, shop, skins, maps, quests, pass, news, notifications, gifts, clans, sounds, config + operation logs
- **Fighters**: 5 playable fighters with unique stats and special skill
- **Shop & inventory**: coins/gems economy, purchases persisted
- **Skins & skin editor**: pixel-art canvas editor (128×64, 4 directions × 2 walk frames), undo/redo, flood fill, mirror, export
- **Map editor**: tile-based editor over the 3 floors, walls/stairs/spawns/tasks/extraction, saved to DB and played immediately
- **Progression**: XP levels, 50-level Battle Pass, daily quests with stat tracking
- **Social**: friends, clans with chat, leaderboard, news, notifications, gifts
- **Match results**: persisted (kills, damage, repairs, survival time), quests/pass/notifications updated server-side
- **Audio**: WebAudio synthesized SFX (per-admin toggle synth/file modes), no audio assets required
- **PWA**: installable, offline shell (service worker cache-first), landscape-first responsive UI with virtual joystick
- **i18n**: French + English, switchable in settings

## Tech stack

| Layer | Technology |
|---|---|
| Client | Vanilla JS ES modules, PixiJS v8 (WebGL), HTML5/CSS3 |
| Server | Node.js ≥ 20, Express 4, `ws` (authoritative WebSocket, 20 Hz tick / 10 Hz snapshots) |
| Database | PostgreSQL (production) / SQLite (local dev), same SQL layer, auto-detected |
| Auth | bcryptjs + httpOnly cookie sessions |
| Assets | 100 % procedural (textures, sprites, sounds) — no binary assets in the repo |

## Quick start (local development)

```bash
npm install
npm start          # → http://localhost:3000
```

With no configuration, the server runs on **SQLite** (`data/bunker.db`, created and seeded automatically). The first account you register becomes **admin**.

Environment file `.env` (optional, same syntax as dotenv) or plain env vars:

```bash
PORT=3000
NODE_ENV=development
DB_DRIVER=sqlite            # or "postgres"
DATABASE_URL=postgres://user:pass@host:5432/dbname   # or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD
DB_SSL=true                 # required by some hosts (Alwaysdata: optional, Render PG: true)
SESSION_SECRET=change-me    # cookie signing secret
SESSION_DAYS=30
ADMIN_USERNAME=owner        # optional: seeds an admin at boot if the name is free
ADMIN_PASSWORD=strong-pass
```

## Scripts

```bash
npm start          # run the server
npm run dev        # run with --watch (auto restart)
npm test           # end-to-end test suite (12 sections, HTTP + WebSocket, no browser needed)
npm run validate:map   # BFS connectivity validation of the default map
npm run icons      # regenerate the PWA icons (requires python3 + Pillow)
```

## Project structure

```
bunker/
├── server/
│   ├── index.js          # assembly: env → db → schema → seed → express → ws → maintenance loop
│   ├── env.js            # env loading + driver detection (postgres/sqlite)
│   ├── config.js         # gameplay constants (timings, radiation, bot difficulty)
│   ├── auth.js           # bcrypt + cookie sessions + requireAdmin middleware
│   ├── ratelimit.js      # per-IP/user rate limiting (HTTP + WS)
│   ├── validate.js       # input validation helpers
│   ├── db/
│   │   ├── index.js      # PgDb / SqliteDb dual driver, shared singleton
│   │   ├── schema.js     # all tables + indexes (users, fighters, maps, quests, …)
│   │   └── seed.js       # default content: map, fighters, shop, pass, quests, sounds
│   ├── game/
│   │   ├── GameMap.js    # collision / opacity / stairs / extraction
│   │   ├── Pathfinding.js# A* with cross-floor stairs
│   │   ├── Vision.js     # Bresenham LOS, visible-tile sets
│   │   ├── Match.js      # 20 Hz simulation: movement, combat, skills, tasks, radiation, extraction
│   │   ├── Bots.js       # bot AI: fight / flee / repair / extract / roam
│   │   ├── GameServer.js # rooms, countdown, bot fill, test rooms
│   │   └── results.js    # match persistence, quests, pass, notifications (bot-safe)
│   ├── routes/
│   │   ├── api.js        # auth, session, shop, fighters, skins, map preview
│   │   ├── meta.js       # pass, quests, gifts, news, friends, clans, leaderboard, textures, sounds
│   │   └── admin.js      # 16 admin resource groups, all logged
│   └── ws.js             # WebSocket hub, rate limit, keepalive
├── src/
│   ├── main.js           # entry point: session → auth screen or lobby
│   ├── net/NetClient.js  # WS client, auto-reconnect, deferred send queue, 20 Hz input flush
│   ├── rendering/        # Renderer (PixiJS, y-sort, fog, lighting), TextureFactory (procedural pixel art)
│   ├── world/GameMap.js  # client-side fog computation
│   ├── gameplay/GameScene.js
│   ├── ui/               # Screens (lobby tabs), HUD, Controls (joystick + keyboard), TaskMap, i18n FR/EN
│   ├── admin/            # AdminPanel, MapEditor, SkinEditor
│   └── audio/AudioManager.js
├── public/               # index.html, app.css, manifest.webmanifest, sw.js, icons
├── data/                 # SQLite database (dev only, git-ignored)
└── scripts/              # test_e2e.js, validate_map.js, icons.py
```

## Multiplayer protocol (summary)

- Client → server: `queue` / `cancel_queue`, 20 Hz `input {mx,my,attack,interact,aimX,aimY}`, `special`, `emote`, `leave_match`
- Server → client: `queued` (countdown), `match_found`, 10 Hz `snapshot` (entities, fog, tasks, radiation phase, projectiles — vision-filtered per player), `match_end` (results)
- Snapshots only contain what your character can see; the client renders fog from the authoritative visible-tile list.

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for a step-by-step guide: free hosting on Render (web service) + free PostgreSQL at Alwaysdata, including WebSocket notes and admin bootstrap.

## License

MIT.
