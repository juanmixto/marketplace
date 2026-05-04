# Env-file layout

> Closes #1180. Required reading before editing any `.env*` file or
> docker-compose env block.

## TL;DR

| File | Loaded by | Tracked in git? | Holds real secrets? |
|---|---|---|---|
| `.env.example` | nobody (template) | yes | no — placeholders only |
| `.env.development.example` | nobody (template) | yes | no |
| `.env.staging.example` | nobody (template) | yes | no |
| `.env.production.example` | nobody (template) | yes | no |
| `.env.local` | Next.js dev (`next dev`), tsx scripts | no (gitignored) | yes — your dev secrets |
| `.env.production` | docker-compose prod | no (gitignored) | yes — live prod secrets |
| `.env.staging` | docker-compose staging | no (gitignored) | yes — live staging secrets |
| `.env.test` | integration test runner | yes | no — only the test DB URL |
| `.env` | **NEVER** | NO (audit-enforced) | n/a — must not exist |

## Why no `.env` at root

Next.js loads `.env` *before* `.env.local`, so its mere presence on a
laptop overrides every other file with whatever it contains. The 2026-04-27
incident left a `.env` on disk that mixed CI placeholders
(`AUTH_SECRET=ci-secret-please-change`, allow-listed in `.gitleaks.toml`)
with a real `AUTH_GOOGLE_SECRET`. From there:

- A copy-paste into `.env.example` would exfiltrate the real secret.
- A `cat .env` in a screenshot or pasted into a chat would do the same.
- A teammate cloning the repo and running `cp .env .env.local` would
  inherit it without realising it was a manual artefact.

`scripts/audit-no-root-env.mjs` (wired into the `verify` job) enforces
that `.env` is **gitignored** and **untracked**. Locally the script
also prints a one-line warning if the file exists in your working tree,
so you find out at the next `npm run lint` rather than after an audit.

## Where to put each variable

- **Dev secret on your laptop?** `.env.local`
- **Test-only DB URL?** `.env.test` (already tracked, only because the
  value is the same `marketplace_test` URL on every machine)
- **Prod secret?** `.env.production` (gitignored) or
  `/etc/marketplace/app.env` mounted into the container — never the
  repo root
- **Documenting a new var?** add it to **all three** `*.example` files
  with a placeholder value and a one-line comment, in the same section
  as related vars

## Migrating away from `/.env`

If your laptop still has `/.env`:

```bash
# 1. Inspect — is anything in here that's NOT also in .env.local?
diff <(sort .env) <(sort .env.local 2>/dev/null || true)

# 2. Merge anything missing into .env.local
cat .env >> .env.local
sort -u -o .env.local .env.local

# 3. Snapshot + remove
mv .env .env.backup-$(date +%s)
# (keep the backup until you're sure nothing else reads .env)

# 4. ROTATE any real secret you find in there.
#    The 2026-04-27 incident leaked AUTH_GOOGLE_SECRET — anything
#    in the legacy file should be considered potentially leaked.
```

Real-secret rotation lives in
[`docs/runbooks/secret-rotation.md`](runbooks/secret-rotation.md).
