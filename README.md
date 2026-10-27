# 37 Companion

An open-source tracker for students of the **42 network** and **1337**. Sign in with your intra account to see your holy graph, plan your RNCP titles, simulate your level, plan your week, and use campus tools like the leaderboard, live clusters and peer finder.

Your progress (level, projects, marks, events) is always read live from the 42 API with your own login. Only the things you create, like calendar events, are stored in the app's database.

## Features

| Page | What it does |
| --- | --- |
| **Dashboard** | Your profile at a glance: level, rank on your campus and level history. |
| **Calendar** | A week grid and a 24 h day view for your own events (one-off, daily, weekdays or weekly; past midnight works too). An optional read-only layer shows your scheduled intra evaluations and the campus events you're subscribed to. Events are saved to your account. |
| **Holy graph** | Every project like the intra graph: prerequisites, live status, "simulate as validated", and layers for career tracks, RNCP titles and industry certifications. You can import your intra `project_data.json` for the exact intra layout. |
| **Tracks** | Curricula by career (security, web, mobile, data, AI, DevOps, systems…), staged from foundations to capstone, with live status. "Send to calculator" shows the level a track gets you to. |
| **RNCP** | A planner for the four RNCP titles (6 Web, 6 Apps, 7 Security, 7 Data): block XP, events, experiences, planned marks and the level your plan reaches. |
| **Projects** | Every advanced project: XP, estimate, XP per hour, team size, prerequisites, unlocks, RNCP blocks and subject. Filter by "available now", solo or title. |
| **Calculator** | Your level after a list of projects and marks (with bonus). Reorder it to see when each level lands. |
| **Eval sheets** | Every evaluation sheet, with checkboxes to go through each point before you book a correction. |
| **Leaderboard · Rank · Alumni · Campus moves** | Your campus by level, correction points, wallet and coalition, plus podiums by pool, alumni, and who moved between campuses. |
| **Clusters** | Live cluster maps showing who's sitting where. |
| **Peer finder** | Students on your campus working on the same project. |

## Create your 42 API keys

37 Companion signs users in with their intra account and reads their data from the [42 API](https://api.intra.42.fr/apidoc). It needs a 42 **OAuth application**, which any student can create in a few minutes.

### 1. Register an application

1. Log in to the intra and open **Settings → API** (<https://profile.intra.42.fr/oauth/applications>), then click **Register a new app**, or go straight to <https://profile.intra.42.fr/oauth/applications/new>.
2. Fill in the form:

   | Field | What to put |
   | --- | --- |
   | **Name** | Anything, e.g. `37 Companion (local)`. Users see it on the 42 login page. |
   | **Description** / **Website** | Optional. |
   | **Redirect URI** | `http://localhost:3000/api/auth` for local use. For a server, add `https://your-domain/api/auth` on its own line. It must match `INTRA_REDIRECT_URI` exactly: same scheme, host, port and path. |
   | **Scopes** | Leave only **public** checked. The app never needs more. |

3. Click **Submit**. The app's page shows:
   - **UID**: the client id, which goes in `INTRA_UID`.
   - **SECRET**: the client secret, which goes in `INTRA_SECRET_KEY`.
   - The app's rate limits, plus the date the secret expires.

### 2. Put the keys in `.env.local`

```sh
INTRA_UID=u-s4t2ud-…            # UID from the app page
INTRA_SECRET_KEY=s-s4t2ud-…     # SECRET from the app page
INTRA_REDIRECT_URI=http://localhost:3000/api/auth
```

`.env.local` is git-ignored, so never commit it or paste the secret anywhere public. If a secret leaks, click **Replace secret** on the app page and update `.env.local`.

### 3. Check that the keys work (optional)

Ask 42 for an app token with the client-credentials flow, then call the API with it:

```sh
curl -s -X POST https://api.intra.42.fr/oauth/token \
  -d grant_type=client_credentials -d client_id="$INTRA_UID" -d client_secret="$INTRA_SECRET_KEY"
# → {"access_token":"…","token_type":"bearer","expires_in":7200,…}

curl -s -H "Authorization: Bearer <access_token>" https://api.intra.42.fr/v2/cursus/42cursus
```

A JSON answer means the keys are good. An `invalid_client` error means the UID or secret is wrong, or the secret has expired.

### How the app uses them

- **User tokens**: when someone clicks "Sign in with 42", 42 sends them back to the redirect URI with a one-time code. The app exchanges the code for that user's access token, encrypts it with `SECRET_KEY` and stores it in an httpOnly session cookie. Pages then call the API as that user.
- **App token**: a few campus-wide lookups that student tokens can't read (campus moves, project XP) use the client-credentials token from step 3. The app requests it and refreshes it by itself.
- **Expiry**: secrets expire. Before the date on the app page, generate a new one there and update `INTRA_SECRET_KEY`, or every login will fail.

## Quick start (Docker)

You need Docker with Compose, plus a 42 OAuth application.

1. Create your 42 app and copy its UID and SECRET ([see above](#create-your-42-api-keys)).
2. Run:

   ```sh
   git clone <this repo> && cd 37-companion
   make run        # first run creates .env.local with a random SECRET_KEY, then stops
   ```

3. Put your app's `INTRA_UID` and `INTRA_SECRET_KEY` in `.env.local`, then run `make run` again. The app opens at <http://localhost:3000>.
4. Optional: to show an owner badge on your profile and in the rankings, run `make owner LOGIN=<your 42 login>`.

`make help` lists every command: `stop`, `logs`, `db`, `dev`, `check`, `clean`, and more.

### Development

```sh
npm ci
make dev        # runs Postgres in Docker and the app with hot reload on http://localhost:3000
make check      # lint + typecheck, run before every commit
```

Requires Node 20 or newer.

## Deploying to production

The app is a standard Next.js server (`output: "standalone"`) plus PostgreSQL 16.

1. Create a separate 42 OAuth app whose redirect URI is `https://your-domain/api/auth` ([how](#create-your-42-api-keys)), and put its UID and SECRET in the server's `.env.local`.
2. On the server, create `.env.local` from `.env.example`:
   - `INTRA_REDIRECT_URI=https://your-domain/api/auth`
   - `SECRET_KEY`: generate it with `openssl rand -hex 32` and keep it secret. Changing it signs everyone out.
   - In `.env`, next to `docker-compose.yml`, set `POSTGRES_PASSWORD` (and optionally `POSTGRES_USER` / `POSTGRES_DB`) to something strong.
3. Run `docker compose up -d --build`. The app listens on port 3000 (`APP_PORT` changes it). Put it behind a reverse proxy that terminates HTTPS (Caddy, nginx, Traefik). Session cookies are marked `Secure` automatically when the redirect URI is `https://`.
4. Run `make owner LOGIN=<your login>`.

For a managed database, set `DATABASE_KEY` to its connection string and run `scripts/seed-database.sql` against it once.

**42 API limits.** 42 rate-limits each OAuth application (about 2 requests per second). Campus-wide pages cache their results for hours and every API route is rate-limited per user, but a busy public deployment shares one app quota. Ask your campus staff for a higher limit if you expect many users.

### Optional: local workspace (self-hosting only)

On your own machine, the Projects and Tracks pages can show each project's local folder, git state and subject PDF, and create a folder for a new project. This reads and writes the server's filesystem, so it's **off unless `WORKSPACE_DIR` is set**. Never enable it on a shared server.

```sh
make run WORKSPACE=~/42      # mounts ~/42 (your project folders + a subjects/ folder of PDFs)
```

## Data

| File | Contents | Refresh with |
| --- | --- | --- |
| `src/data/projects.json` | Catalog of advanced projects (XP, estimate, prerequisites, RNCP blocks) | `make fetch-projects CAMPUS=<campus id>` |
| `src/data/rncp/*.json` | RNCP title blocks (RNCP 6 = 39783, RNCP 7 = 39774) | by hand |
| `src/data/roadmap.json` | Suggested domains used for "quick add" in the calculator and RNCP planner | by hand |
| `src/data/tracks.json` | Career tracks | by hand |
| `src/data/career.json` | Industry certifications that build on 42 projects | by hand |
| `src/data/certifications.json` | 42's Credly badges and the RNCP fiches | `make certifications` |
| `src/data/evals.json` | Evaluation sheets | `make evals` |
| `src/data/clusters.json` | Cluster map list | by hand |

The project catalog is generated from one campus (21 by default). Projects that aren't open on your campus are flagged on the Projects page.

## Contributing

Issues and pull requests are welcome. Run `make check` before opening a PR; CI runs lint, typecheck, a production build and a Docker build.

## Credits & license

37 Companion builds on the work of other 42 students:

- [demostanis/42evaluators](https://github.com/demostanis/42evaluators) (GPL-3.0): leaderboard, clusters and peer finder logic.
- [lucas-ht/42calculator](https://github.com/lucas-ht/42calculator) (GPL-3.0): level calculator.
- [Mohammed-Maghri/The-Official-New-Leets](https://github.com/Mohammed-Maghri/The-Official-New-Leets): the original app this one grew from.
- [d-r-e/rncp](https://github.com/d-r-e/rncp): the first version of the RNCP block data.
- [42evalhub.com](https://www.42evalhub.com): evaluation sheets.

Released under the **GNU GPL v3.0 or later**; see [LICENSE](LICENSE). This project is not affiliated with 42 or 1337.
