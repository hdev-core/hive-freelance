# API Server Runbook

Covers the `apps/api` deployment on the dedicated server (Hetzner,
`62.238.101.245`). For how the server got into this state in the first
place (SSH hardening, firewall, user setup), see the session log this
was built from — this doc is about day-to-day operation, not initial
setup.

## Current known trade-offs — read this first

These are deliberate, temporary decisions, not oversights. Each one has
a reason tied to where this project is right now, and each should be
revisited before this server is ever exposed to anyone outside the team:

- **HTTP only, no HTTPS.** Let's Encrypt can't issue a certificate
  against a bare IP — this genuinely can't be done until a subdomain is
  assigned, not just deferred by choice. Once one exists, add a `443`
  server block to `/etc/nginx/sites-available/hive-freelance-api` (or
  let certbot's nginx plugin do it) and reload nginx.
- **`ENABLE_DEV_AUTH_ROUTES=true`**, and `NODE_ENV` is deliberately
  **not** set to `production`. Setting `NODE_ENV=production` would give
  the session cookie its `Secure` flag (a real gap right now, since this
  server is HTTP-only anyway) but would also silently disable
  `dev-google`/`dev-keychain-login` — the only way anyone's actually
  logging in to test this server. Keeping dev-auth working wins for now,
  since the whole point of this deployment is unblocking end-to-end
  testing. Revisit both together when this server needs to handle real
  users.
- **No automatic rollback on a bad deploy.** If a push to `develop`
  breaks the API, the GitHub Actions health check fails loudly (so
  you'll know), but the server keeps running the broken version until
  someone manually rolls it back (see below). There's no blue-green or
  auto-revert.
- **CORS (`WEB_ORIGIN`) may still be a placeholder.** Check `.env` on
  the server — if it's not a real Vercel URL yet, the browser-based
  frontend can't talk to this API at all (curl/direct requests still
  work fine, since CORS is a browser-enforced restriction, not a
  server-side block).

## Connecting

Two SSH aliases are set up locally (see `~/.ssh/config`):

```
ssh hive-api          # root — infra-level changes only (nginx, ufw, apt)
ssh hive-api-deploy   # deploy user — app-level work (git, npm, pm2)
```

Deliberately kept separate: app-level work never needs root, so it
doesn't get root, limiting the blast radius of anything that goes wrong
in the Node process itself.

## Normal deploy (automatic)

Pushing to `develop` with changes under `apps/api/`, `packages/db/`,
`packages/shared/`, `packages/hive/`, or `apps/provisioner/` triggers
`.github/workflows/deploy-api.yml` automatically: pulls, rebuilds the
affected workspaces, runs `prisma migrate deploy`, restarts PM2, and
verifies `/health`. Check the Actions tab for the run status.

## Manual deploy

If you need to deploy without pushing (or the Action isn't available):

```
ssh hive-api-deploy "cd ~/hive-freelance && \
  git fetch origin develop && git checkout develop && git reset --hard origin/develop && \
  npm ci && \
  npm run build -w @hive-freelance/shared && \
  npm run build -w @hive-freelance/db && \
  npm run build -w @hive-freelance/hive && \
  npm run build -w @hive-freelance/provisioner && \
  npm run build -w @hive-freelance/api && \
  cd packages/db && npx prisma migrate deploy && cd ../.. && \
  pm2 restart hive-freelance-api"
```

`git reset --hard` is deliberate — this checkout should never have local
changes worth preserving. If you've been debugging directly on the
server, `git stash` before running this or your changes are gone.

## Rollback

No automated rollback exists yet. To manually revert to a previous
commit:

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
  cd packages/db && npx prisma migrate deploy && cd ../.. && \
  pm2 restart hive-freelance-api"
```

**Caution on migrations during rollback:** `prisma migrate deploy` only
ever applies *forward* — it won't undo a migration that a newer commit
added. If the commit you're rolling back to predates a migration that's
already been applied to the database, the schema and the older code may
disagree. Check `packages/db/prisma/migrations/` between the two
commits before rolling back across a migration boundary; this may need
a manual, case-by-case fix rather than a blind rollback.

Afterward, `git checkout develop` (without `reset --hard`) to get back
to tracking the branch normally once you're ready to redeploy forward.

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
a bad config can otherwise take the reverse proxy down entirely.

## Checking the firewall

```
ssh hive-api "ufw status verbose"
```

Should show `22/tcp`, `80/tcp`, `443/tcp` allowed, default deny on
everything else inbound.

## Environment variables

Two separate `.env` files exist on the server, and they're not
redundant — different tools read different ones:

- `~/hive-freelance/.env` — read by `apps/api` itself at runtime
- `~/hive-freelance/packages/db/.env` — read by the Prisma CLI
  specifically (`DATABASE_URL`/`DIRECT_URL`), a Prisma convention, not
  something `apps/api` uses directly

Both are gitignored and were never committed — see `.env.example` at
the repo root for the full list of variables and what each one means;
placeholders only there, no real values.