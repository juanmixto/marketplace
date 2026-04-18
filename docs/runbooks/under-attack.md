# Under attack runbook — Cloudflare WAF

Playbook for responding to L7 DDoS, credential stuffing, scraper floods, or slowloris against production. Assumes Cloudflare (free tier is enough) in front of Traefik → Node. Walk top-to-bottom; each step is reversible.

## Signals — when to open this runbook

- `/api/auth/*` 4xx spikes over baseline (`ratelimit` metric with `action=login|register|password-reset`).
- Sentry flood from `src/app/api/**` with distinct IPs but identical User-Agent.
- Sustained 5xx rate > 1% on the origin (check Grafana or doctor's `Server ready` healthcheck in preview).
- Node event loop lag > 500ms (pm2/systemd `top` shows Node at 100% CPU with hundreds of concurrent sockets).
- Credential-stuffing pattern: `/api/auth/callback/credentials` traffic with wide username/password variety from a narrow IP range.

## Step 0 — verify you're actually behind Cloudflare

```bash
curl -I https://<domain>/ | grep -iE "cf-ray|cf-cache-status|server"
```

Expect `server: cloudflare` and a `cf-ray:` header. If missing → DNS has been detached or TTL hasn't flipped; fix DNS first, everything below is useless otherwise.

Also confirm origin IP is not reachable from the public internet:

```bash
# From outside the private network:
curl -I https://<origin-ip>/   # should time out or return 444
```

If the origin IP answers, Cloudflare can be bypassed. Close the firewall to everything except Cloudflare's [IP ranges](https://www.cloudflare.com/ips/) before continuing.

## Step 1 — enable "Under Attack" mode (soft)

Cloudflare dashboard → **Security → WAF → Tools → Security Level: Under Attack**. Shows a 5-second JS challenge to every visitor.

- Scope: entire zone, ~30 minutes TTL. Legitimate buyers see a spinner, not an error.
- Cost: all traffic goes through JS challenge; bots without a JS engine drop.
- Reversible: set level back to **High** or **Medium** when traffic normalises.

## Step 2 — rate-limit `/api/auth/*` at the edge

Cloudflare → **Security → WAF → Rate limiting rules**. Required rule:

```
When:  http.request.uri.path matches ^/api/auth/
Action: Block | Period: 10s | Requests: 20
```

This must run BEFORE the "Under Attack" challenge so brute-force attempts don't consume challenge tokens. The app rate-limit (`src/lib/ratelimit.ts`) is the backstop — it now reads `cf-connecting-ip` when present so per-IP buckets work correctly behind Cloudflare (#540).

## Step 3 — identify the attack signature

Cloudflare → **Analytics → Security events**. Filter by the spiking status / path / country / ASN. Usual shapes:

- **Single ASN / datacenter**: add a WAF custom rule to `Challenge` or `Block` that ASN.
- **Residential botnet**: JS challenge alone rarely suffices; require proof-of-work (`Managed Challenge` in Cloudflare terms).
- **Slowloris**: Cloudflare absorbs it by default. If it still reaches origin, check Traefik `readTimeout` (`--entrypoints.web.transport.respondingTimeouts.readTimeout=30s`).

Export the event sample to JSON and attach to the incident ticket.

## Step 4 — block obvious offenders

```
When:  ip.src in { <list of abusive IPs> }
Action: Block
```

Prefer ASN/country rules to individual IPs (botnet IPs rotate in minutes). Keep the block active for 24h, then re-evaluate.

## Step 5 — check the app is still healthy

```bash
curl -fsS https://<domain>/api/healthcheck | jq '.ok, .checks'
# or run the full doctor:
node scripts/doctor.mjs --base-url https://<domain> --auth
```

If `/api/healthcheck` is returning non-200 you have two problems (attack + origin broken); roll back any recent deploy suspected of contributing.

## Step 6 — escalate if we're saturating Cloudflare's free tier

Cloudflare free tier has [10M requests/month soft limits](https://www.cloudflare.com/plans/) for WAF rules. If the attack is sustained:

1. Upgrade to **Pro** (~$20/month) for richer rules + longer rate-limit windows.
2. Consider Cloudflare Tunnel to hide the origin IP permanently.
3. Open an Abuse ticket with the offending ASN's provider.

## Step 7 — document and close

Append to `docs/runbooks/under-attack.md#incidents` (below) with:

- Start / end timestamps (UTC)
- Attack shape (rough RPS at peak, IP/ASN dominance, path focus)
- Rules activated and their TTL
- Whether any legitimate buyer impact was observed (from Sentry + support tickets)

Remove the "Under Attack" mode once traffic is baseline for 1h. Rate-limit rules from step 2 stay on permanently.

## Permanent hardening (pre-incident)

- [x] `cf-connecting-ip` preferred over `x-forwarded-for` in `src/lib/ratelimit.ts` and `src/lib/audit.ts` (#540).
- [ ] Cloudflare DNS cut over with orange-cloud on the apex + www records.
- [ ] WAF rate-limit rule permanently active on `/api/auth/*` (20 req/10s per IP).
- [ ] Traefik strict `Host()` matcher so requests missing the expected Host header return 444 instead of falling through to the app.
- [ ] Firewall on the Proxmox host allows inbound 443 only from Cloudflare IP ranges.
- [ ] (Optional) Cloudflare Tunnel so origin IP is never public.

Items marked `[ ]` are ops work that lives outside this repo; tick them once executed and link to the infra commit/ticket.

## Incidents

_(Append below in reverse-chronological order as they happen.)_
