# BUNKER — Deployment guide (Render FREE + Alwaysdata PostgreSQL FREE)

This guide takes you from zero to a live, installable PWA at `https://your-app.onrender.com`
with all data persisted in a free Alwaysdata PostgreSQL database.

Total cost: **0 €**. Total time: ~20 minutes.

---

## 0. Prerequisites

- A GitHub account (the code must be pushed to a repository)
- The complete `bunker/` project (this folder)

```bash
cd bunker
git init
git add -A
git commit -m "BUNKER initial release"
git remote add origin https://github.com/<you>/bunker.git
git push -u origin main
```

> Do **not** commit `node_modules/` nor `data/` (a `.gitignore` is provided).

---

## 1. Create the PostgreSQL database on Alwaysdata (free plan)

1. Sign up at **https://www.alwaysdata.com** — the free plan includes 100 MB, one PostgreSQL database and no credit card.
2. In the panel, go to **Databases → PostgreSQL → Add a database**:
   - Name: `bunker` (the real DB name becomes `<account>_bunker`, e.g. `ben_bunker`)
   - Leave the default PostgreSQL version.
3. Still in **Databases → PostgreSQL**, note or create your **database user** (on Alwaysdata the user is your account name by default, e.g. `ben`).
4. **No whitelist needed**: Alwaysdata database ports are open to the Internet by default (only the Max offer can close them), and SSL is supported.

Your connection string has the form — the host is `postgresql-<account>.alwaysdata.net`:

```
postgres://<user>:<password>@postgresql-<account>.alwaysdata.net:5432/<account>_bunker
```

⚠️ Common mistake: `<account>.pg.alwaysdata.net` does **not** exist (DNS `ENOTFOUND`). Always copy the **Host** value shown in the panel: Databases → PostgreSQL → your database.

Test it locally once (optional):

```bash
DB_DRIVER=postgres \
DATABASE_URL="postgres://user:pass@postgresql-account.alwaysdata.net:5432/account_bunker" \
node server/index.js
# → [db] PostgreSQL connecté + [seed] Base prête.
```

Tables, indexes and default content are created automatically on first boot — no SQL to run manually.

---

## 2. Create the web service on Render (free plan)

1. Sign up at **https://render.com** with your GitHub account.
2. **New → Web Service** → pick the `bunker` repository.
3. Settings:

| Field | Value |
|---|---|
| Runtime | **Node** |
| Region | closest to you (e.g. Frankfurt) |
| Branch | `main` |
| Build command | `npm install` |
| Start command | `npm start` |
| Instance type | **Free** |
| Health check path | `/api/meta` (optional but recommended) |

4. **Environment variables** (Environment tab):

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@postgresql-account.alwaysdata.net:5432/account_bunker` | host format: `postgresql-<account>.alwaysdata.net` |
| `DB_DRIVER` | `postgres` | optional; auto-detected from the URL anyway |
| `DB_SSL` | `true` | Alwaysdata supports TLS; harmless if unavailable |
| `SESSION_SECRET` | a long random string (e.g. `openssl rand -hex 32`) | cookie signing |
| `NODE_ENV` | `production` | |
| `ADMIN_USERNAME` | your name | optional: seeds this admin account at first boot |
| `ADMIN_PASSWORD` | a strong password | only used together with `ADMIN_USERNAME` |

5. **Create Web Service**. First boot takes ~1–2 minutes (npm install → DB schema → seed).

> **WebSocket**: the free plan supports WebSockets natively — nothing to configure.
> The client connects on `wss://your-app.onrender.com/ws` automatically.

## 3. Verify the deployment

1. Open `https://your-app.onrender.com` → the BUNKER login screen appears.
2. **Register the first account**: it automatically becomes **admin** (unless `ADMIN_USERNAME` was set, then that one is admin).
3. Click **Admin** in the lobby sidebar → you should see the 16 admin tabs.
4. Click **▶ Lancer** → the match fills with bots and starts after the 12 s countdown.
5. Install as an app: browser menu → *Install BUNKER* (PWA manifest + service worker are served at the root).

## 4. Free-plan caveats (important)

| Caveat | What it means for BUNKER |
|---|---|
| Render free instances **sleep after 15 min without HTTP traffic** | The first request after idle takes ~30–60 s to boot. WebSocket connections alone do **not** keep it awake. A cron ping (e.g. https://cron-job.org every 10 min on `/api/meta`) keeps it warm. |
| Render free = **ephemeral disk** | That is why SQLite is not used in production — all state lives in Alwaysdata PostgreSQL, which is persistent. |
| Alwaysdata free = **100 MB storage** | Matches/logs/notifications grow slowly; prune `notifications`/`admin_logs`/`matches` occasionally (admin panel or SQL). |
| Cold start + lobby countdown | If you queue while the server is waking, the client auto-reconnects; just retry once the page responds. |

## 5. Updating the game

```bash
git add -A && git commit -m "update" && git push
```

Render auto-redeploys on push. Database schema changes: `server/db/schema.js` runs `CREATE TABLE IF NOT EXISTS` on boot, so new tables appear automatically. For altering **existing** columns, add an explicit migration in `schema.js`.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `getaddrinfo ENOTFOUND <host>` at boot | The hostname does not exist. Alwaysdata format is `postgresql-<account>.alwaysdata.net` — **not** `<account>.pg.alwaysdata.net`. Copy the exact Host from the panel (Databases → PostgreSQL) and redeploy. |
| `invalid input syntax for type json` / `Token "all" is invalid` at boot | Fixed in the current code (JSON columns use TEXT, and a startup migration converts any JSONB leftovers — data preserved). Pull the latest code and redeploy. |
| `[db] PostgreSQL connecté` absent from logs | Bad `DATABASE_URL` — check host/port/password. |
| `password authentication failed` | Reset the DB user password in Alwaysdata → Databases → users. |
| `database "xxx" does not exist` | The DB name must be the full panel name, e.g. `ben_bunker` (Alwaysdata prefixes with your account). |
| Game stuck on "Recherche de partie…" | The WS may have dropped during a wake-up; reload the page. If it persists, check the Render logs for `ws` errors. |
| Admin tab missing | The first-ever registered account is admin. Later accounts are not. Fix in DB: `UPDATE users SET is_admin = 1 WHERE uname = 'you';` |
| Admin config changes seem ignored | Fixed in current code (hot-reload of game config). Pull latest code; otherwise restart the service after saving. |
| Sessions logged out after each deploy | `SESSION_SECRET` changed or unset (random fallback) — set it permanently in Render env vars. |
| 502 on `/api/meta` | Instance still waking (free plan). Retry after ~60 s. |

## 7. Optional: custom domain

Render → Settings → **Custom Domains** → add your domain and create the `CNAME` record it shows (e.g. `bunker.yourdomain.com → your-app.onrender.com`). HTTPS is issued automatically. Alwaysdata also hosts domains if you need DNS there.

---

That's it — BUNKER is live. Have fun in the bunker. ☣
