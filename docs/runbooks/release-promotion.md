# Release promotion: dev -> staging -> production

Goal: every public environment should run the same committed code path. Avoid
one-off edits in production; if an emergency hotfix is unavoidable, commit it
immediately after the incident and promote the same change through the pipeline.

## Environment files

Each Docker environment has its own env file and Compose project name:

| Environment | Env file | Compose project | Public host |
| --- | --- | --- | --- |
| Development preview | `.env.development` | `marketplacedev` | `dev.raizdirecta.es` |
| Staging | `.env.staging` | `marketplacestg` | `staging.raizdirecta.es` |
| Production | `.env.production` | `marketplaceprod` | `raizdirecta.es` |

Create local secrets from the examples:

```bash
cp .env.development.example .env.development
cp .env.staging.example .env.staging
cp .env.production.example .env.production
```

Never commit rendered `.env.*` files. Only examples belong in git.

## Cloudflare tunnel routes

For the Docker-managed environments, configure each Cloudflare Tunnel published
application route to point directly at the app service:

```txt
dev.raizdirecta.es      -> http://app:3000
staging.raizdirecta.es  -> http://app:3000
raizdirecta.es          -> http://app:3000
```

Keep one tunnel token per environment. Do not reuse the production token in
development or staging.

## Routine promotion

1. Merge the change to `main`.
2. Deploy development preview:

```bash
npm run deploy:dev
```

3. Smoke-test the exact public URL.
4. Deploy staging:

```bash
npm run deploy:stg
```

5. Smoke-test staging, including login and any touched flow.
6. Deploy production:

```bash
npm run deploy:prod
```

7. Verify that all public environments serve the expected `origin/main` commit:

```bash
npm run verify:public-envs
```

The deploy script:

- refuses tracked dirty changes by default;
- refuses staging/production deploys unless `HEAD` equals `origin/main`;
- loads the environment-specific `.env` file;
- validates host/app env consistency;
- builds the same Docker image path;
- brings up the environment-specific DB;
- runs `prisma migrate deploy`;
- replaces only the app container, never the DB volume;
- starts `app` + `cloudflared`;
- checks `https://<APP_HOST>/api/version`.

## Emergency hotfix

Only use this during an active outage:

```bash
scripts/deploy-local-env.sh production --allow-dirty --allow-unpublished
```

After the emergency:

1. Commit the exact diff that was deployed.
2. Run `npm run deploy:stg` so staging catches up.
3. Run the smoke test again on production.

## Smoke test checklist

At minimum after each deploy:

```bash
curl -fsS "https://$APP_HOST/api/version"
curl -fsSI "https://$APP_HOST/productores"
```

For auth-touching changes, also verify:

- `/login` with a non-2FA user still signs in.
- `/login` with a 2FA admin shows the TOTP step before Auth.js callback.
- `/admin/dashboard` redirects unauthenticated users to login.

## Staging data policy

Staging is a rehearsal environment: public enough to share demos, but separate
from production. Keep its database useful for realistic flows without turning it
into a shadow copy of production.

Current policy:

- Use demo products, demo producers, demo customers, Stripe test mode, and fake
  orders for checkout/regression tests.
- Never point staging at the production database.
- Never copy raw production customer/order data into staging.
- If staging needs production-like volume later, restore a scrubbed snapshot:
  remove or anonymize personal data first, then add stable demo rows on top.
- Once production has real curated producers, staging can intentionally mix:
  real producer/catalog records plus dummy customers, dummy orders, and Stripe
  test payments. That gives realistic catalog demos without leaking customer
  data.

Seed or refresh the demo dataset:

```bash
npm run db:seed:stg
```

Reset known demo rows and reseed them:

```bash
npm run db:seed:stg:reset
```
