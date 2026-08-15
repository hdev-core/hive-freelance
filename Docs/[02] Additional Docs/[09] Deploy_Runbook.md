# API Server Runbook

Covers the `apps/api` deployment on the dedicated server. Server address
is intentionally not printed here — this repo is public. It's configured
locally as the `hive-api`/`hive-api-deploy` SSH aliases (see `~/.ssh/config`
on any machine that's been set up to deploy) and as the `DEPLOY_HOST`
GitHub Actions secret.

For how the server got into this state in the first place (SSH
hardening, firewall, user setup), see
[Docs/[02] Additional Docs/[10] Server_Setup_Session_Log.md](./%5B10%5D%20Server_Setup_Session_Log.md) —
this doc is about day-to-day operation, not initial setup.

## Current known trade-offs — read this first

Each of these is a deliberate, temporary decision with a reason tied to
where this project is right now, not an oversight. Each should be
revisited before this server is ever exposed to anyone outside the team:

- **HTTP only, no HTTPS.** Let's Encrypt needs a real hostname to issue a
  cert against. A subdomain now exists, but it currently resolves through
  Cloudflare rather than pointing directly at this server — whether
  Cloudflare is already terminating TLS for us (proxied/orange-cloud
  mode) or needs to be switched to DNS-only before we can issue our own
  cert is an open question, pending confirmation.
- **Dev-auth routes (`dev-google`, `dev-keychain-login`) are
  IP-allowlisted, not open to the internet.** `ENABLE_DEV_AUTH_ROUTES=true`
  issues a real session cookie for any `{email, role}` with zero
  credentials — this was briefly reachable from the open internet before
  the allowlist was added (found via security review, closed same day).
  Enforced in `/etc/nginx/sites-available/hive-freelance-api`, a
  regex `location` block matching just those two paths, `allow`-listing
  specific IPs and `deny all` otherwise — the rest of the API is
  unaffected. To add someone: append an `allow <their IP>;` line inside
  that location block, `nginx -t`, then `systemctl reload nginx`. IPs
  change (home connections especially), so this needs occasional upkeep,
  not a set-and-forget.
- **`NODE_ENV` is deliberately not set to `production`.** Setting it
  would give the session cookie its `Secure` flag via `COOKIE_SECURE`'s
  intent, but — more importantly — it changes what `npm ci` installs.
  `tsc`, `vite`, `prisma`, and `tsx` are all devDependencies; `npm ci`
  with `NODE_ENV=production` in the environment omits devDependencies
  entirely, which breaks every build step in the deploy pipeline. **Do
  not set `NODE_ENV=production` in the deploy user's shell or `.env`
  without also handling this** (e.g. `npm ci --include=dev`), or the
  next deploy silently fails at the first `tsc` build.
- **`COOKIE_SECURE`** is the real flag controlling the session cookie's
  `Secure` attribute (and, tied to it, `sameSite: "none"` vs `"strict"`)
  — see `apps/api/src/lib/jwt.ts`. Deliberately decoupled from
  `NODE_ENV` for the reason above. Should be `true` once this server is
  reachable over HTTPS and the frontend is calling it cross-origin;
  `false` locally, where frontend and API are same-origin via the Vite
  proxy over plain HTTP.
- **No automatic rollback on a bad deploy.** A failed post-deploy health
  check fails the GitHub Actions run loudly, but the server keeps
  running whatever was live before the failed step got that far — see
  "Rollback" below for the manual process, including database backups
  taken automatically before every migration attempt.
- **`apps/listener` is not part of this deployment.** The deploy
  workflow builds and restarts `apps/api` only. Escrow finalization
  depends on the listener process — whether it's running somewhere else,
  or genuinely isn't running at all right now, is an open question, not
  a documented decision. Needs an answer before relying on end-to-end
  escrow flows against this server.
- **CORS (`WEB_ORIGIN`)** should be set to the real Vercel production
  URL. Check `.env` on the server if cross-origin requests from the
  actual frontend aren't working — CORS is browser-enforced only, so
  direct `curl`/Postman-style requests will still succeed even if this
  is wrong.

## Connecting

Two SSH aliases are set up locally (see `~/.ssh/config`):

```
ssh hive-api          # root — infra-level changes only (nginx, ufw, apt)
ssh hive-api-deploy   # deploy user — app-level work (git, npm, pm2)
```

Deliberately kept separate: app-level work never needs root, limiting
the blast radius of anything that goes wrong in the Node process itself.

## Normal deploy (automatic)

Pushing to `develop` with changes under `apps/api/`, `packages/db/`,
`packages/shared/`, `packages/hive/`, `apps/provisioner/`, or root
`package.json`/`package-lock.json` triggers
`.github/workflows/deploy-api.yml`: pulls the exact commit that
triggered the run (not just "whatever's newest," which matters under
concurrent merges), rebuilds the affected workspaces, backs up the
database, runs `prisma migrate deploy`, restarts PM2, and verifies
`/health` actually reports `"ok":true` in its response body (not just a
`200` status — the two aren't the same, see "Known trade-offs" history
in the PR review if curious why this matters). Check the Actions tab
for the run status.

**Branch protection on `develop` is not yet set up** — a direct push
bypasses review entirely and immediately runs `prisma migrate deploy`
against the live database. This is on Mohammad's list to fix, not
something to work around here.

## Manual deploy

If you need to deploy without pushing:

```
ssh hive-api-deploy "cd ~/hive-freelance && \
  git fetch origin develop && git checkout develop && git reset --hard origin/develop && \
  npm ci && \
  npm run build -w @hive-freelance/shared && \
  npm run build -w @hive-freelance/db && \
  npm run build -w @hive-freelance/hive && \
  npm run build -w @hive-freelance/provisioner && \
  npm run build -w @hive-freelance/api && \
  mkdir -p ~/db-backups && \
  (set -a; source packages/db/.env; set +a; pg_dump \"\$PG_DUMP_URL\" > ~/db-backups/manual-\$(date +%Y%m%d-%H%M%S).sql) && \
  npm run migrate -w @hive-freelance/db && \
  pm2 restart hive-freelance-api"
```

`git reset --hard` is deliberate — this checkout should never have local
changes worth preserving. If you've been debugging directly on the
server, `git stash` before running this or your changes are gone.

## Rollback

### If a migration fails mid-way (Prisma P3009)

A `prisma migrate deploy` that gets interrupted (timeout, dropped
connection) can leave a migration recorded as failed. Every subsequent
`migrate deploy` then refuses to run at all until this is resolved:

```
ssh hive-api-deploy "cd ~/hive-freelance/packages/db && npx prisma migrate status"
```

This shows which migration failed. Two paths from there:

- **If the migration's SQL is safe to simply retry** (e.g. it failed on
  a transient connection issue, not a real schema conflict):
  ```
  npx prisma migrate resolve --rolled-back <migration_name>
  npx prisma migrate deploy
  ```
- **If the database is in a genuinely inconsistent state** (partially
  applied), restore from the pre-migration backup first — see below —
  then resolve and retry.

### Restoring from a backup

Every automatic deploy takes a `pg_dump` backup immediately before
running migrations, kept in `~/db-backups/` on the server (5 most
recent, older ones pruned automatically). To restore one:

```
ssh hive-api-deploy "ls -lt ~/db-backups/"
```

Pick the file, then (⚠️ this overwrites current data — confirm you have
the right file first):

```
ssh hive-api-deploy "cd ~/hive-freelance/packages/db && \
  set -a && source .env && set +a && \
  psql \"\$PG_DUMP_URL\" < ~/db-backups/<filename>.sql"
```

### Rolling back the application code

```
ssh hive-api-deploy "cd ~/hive-freelance && git log --oneline -10"
```

Pick the commit to roll back to, then:

```
ssh hive-api-deploy "cd ~/hive-freelance && git checkout <commit-hash> && \
  npm ci && \
  npm run build -w @hive-freelance/shared && \
  npm run build -w @hive-freelance/db && \
  npm run build -w @hive-freelance/hive && \
  npm run build -w @hive-freelance/provisioner && \
  npm run build -w @hive-freelance/api && \
  pm2 restart hive-freelance-api"
```

**Caution on migrations during rollback:** `prisma migrate deploy` only
ever applies *forward*. If the commit you're rolling back to predates a
migration that's already been applied to the database, the schema and
the older code may disagree — this may need a manual, case-by-case fix,
possibly involving the backup restore above, rather than a blind
rollback.

Afterward, `git checkout develop` (without `reset --hard`) to get back
to tracking the branch normally once ready to redeploy forward.

## Logs

```
ssh hive-api-deploy "pm2 logs hive-freelance-api --lines 100"
```

Add `--nostream` to print and exit instead of tailing live. PM2 also
keeps rotated logs on disk under `~/.pm2/logs/`.

## Restart / status

```
ssh hive-api-deploy "pm2 restart hive-freelance-api"
ssh hive-api-deploy "pm2 status"
ssh hive-api-deploy "curl -s http://localhost:4000/health"
```

The API survives both a crash (PM2 restarts it automatically) and a
full server reboot (registered as a systemd service, `pm2-deploy.service`
— verified against a real reboot, not just configured).

## Checking nginx

```
ssh hive-api "nginx -t"              # validate config syntax BEFORE reloading
ssh hive-api "systemctl reload nginx"
ssh hive-api "systemctl status nginx --no-pager"
```

Config lives at `/etc/nginx/sites-available/hive-freelance-api`,
symlinked into `sites-enabled`. Always run `nginx -t` before reloading —
a bad config can otherwise take the reverse proxy down entirely. This
file also contains the dev-auth IP allowlist — see "Known trade-offs."

## Checking the firewall

```
ssh hive-api "ufw status verbose"
```

Should show `22/tcp`, `80/tcp`, `443/tcp` allowed, default deny on
everything else inbound. Note: `80/tcp` being open to everyone is fine
for the API generally, but is exactly why the dev-auth routes needed
their own narrower restriction at the nginx layer rather than relying
on the firewall alone.

## Environment variables

Two separate `.env` files exist on the server, and they're not
redundant — different tools read different ones:

- `~/hive-freelance/.env` — read by `apps/api` itself at runtime
- `~/hive-freelance/packages/db/.env` — read by the Prisma CLI
  specifically (`DATABASE_URL`/`DIRECT_URL`), a Prisma convention, not
  something `apps/api` uses directly. That file also has `PG_DUMP_URL` —
  needed because `DIRECT_URL`, despite its name, still goes through
  Supavisor's session-mode pooler, and raw clients (`pg_dump`, `psql`)
  fail to connect through it with a nonsensical "database does not
  exist" error (verified directly — Prisma's own connector handles the
  same pooler fine, this is specific to libpq-based tools).
  `PG_DUMP_URL` points at Supabase's true direct, non-pooled host
  instead, and is what every backup/restore command in this doc
  actually uses.

Both are gitignored and were never committed — see `.env.example` at
the repo root for the full list of variables and what each one means;
placeholders only there, no real values. As of the last check, no real
Hive active keys are present in either file (`LOCAL_AGENT_ACTIVE_KEY`
and `LOCAL_CREATOR_ACTIVE_KEY` are both empty), and every live-broadcast
flag (`PROVISIONER_LIVE`, `AGENT_LIVE`, `CLAIM_LIVE`) is `false`.