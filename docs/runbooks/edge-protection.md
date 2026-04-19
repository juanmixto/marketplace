# Edge protection runbook (Cloudflare / WAF)

Tracks the infra work for [#540](https://github.com/juanmixto/marketplace/issues/540). The marketplace runs self-hosted (Proxmox + Traefik) with no managed edge in front by default. This document is the playbook for adding one.

## Threat model

Without an edge layer, every L7 request lands on Node directly. Realistic attacks that bypass the app-layer defences:

- **Credential stuffing / brute force** — app-layer rate limits protect login/register, but a botnet rotating 10k residential IPs defeats per-IP throttles. Edge rate limits with JS challenges raise the cost.
- **Scraping** — product catalog is public and enumerable. Scrapers cost CPU and pollute analytics.
- **L7 DDoS / slowloris** — a single VPS can saturate Node with slow POSTs or concurrent connection floods.
- **Origin IP exposure** — once the Proxmox public IP is known, attackers route around DNS-based protections.

## Recommended: Cloudflare (free tier is enough for MVP)

### 1. DNS cut-over

1. Add the domain to a Cloudflare account.
2. Copy the existing records (A/AAAA for root and subdomains, MX, TXT).
3. Flip the proxy toggle to **proxied** (orange cloud) for the app hostnames. Keep MX **unproxied** (grey cloud).
4. At the registrar, change the nameservers to the ones Cloudflare assigns.
5. Wait for propagation (a few minutes with modern TLDs).

### 2. SSL/TLS mode

Cloudflare → SSL/TLS → **Full (strict)**. Anything less (Flexible) accepts HTTP between Cloudflare and the origin, which is silently insecure.

Traefik already terminates TLS with a valid cert → this is a drop-in change.

### 3. Cloudflare Tunnel (origin IP hiding)

Without a tunnel, attackers who scrape historical DNS (e.g. `crt.sh`, `securitytrails`) can still reach the origin directly and bypass Cloudflare.

1. Install `cloudflared` on the Proxmox host.
2. `cloudflared tunnel create marketplace-origin`
3. Route the Cloudflare hostname through the tunnel to `http://127.0.0.1:<traefik-port>`.
4. **Firewall the public Proxmox IP** — drop inbound 80/443 from anything other than the tunnel's loopback source.

Verifies with `curl --resolve marketplace.tld:443:<proxmox-public-ip> https://marketplace.tld` → should time out.

### 4. Rate-limit rules (WAF)

Cloudflare → Security → WAF → Rate limiting rules.

Recommended starters:

| Rule | Expression | Action |
|---|---|---|
| Auth surface brute-force | `http.request.uri.path starts_with "/api/auth/"` | Rate limit: 20 req / 1 min / IP, block 10 min |
| Account-panel abuse | `http.request.uri.path starts_with "/api/account/"` | Rate limit: 10 req / 1 min / IP, challenge |
| Upload abuse | `http.request.uri.path eq "/api/upload"` | Rate limit: 60 req / 10 min / IP, block 1h |
| Checkout-attempt spray | `http.request.uri.path eq "/api/checkout"` | Rate limit: 30 req / 5 min / IP, challenge |

These stack with the app-layer limits in `src/lib/ratelimit.ts` — edge catches botnets before the Node process spends cycles.

### 5. Bot Fight Mode / Super Bot Fight Mode

Security → Bots → enable **Bot Fight Mode** (free). It blocks well-known scraper/DDoS bot signatures without config.

### 6. Managed rulesets

Security → WAF → Managed rules → enable:
- OWASP Core Ruleset (start in Log mode for a week, then flip to Block)
- Cloudflare Managed Ruleset

### 7. "Under Attack" mode

When incident suspected:

```sh
# Via Cloudflare API — fast flip without logging into the dashboard.
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/settings/security_level" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"under_attack"}'
```

Every request gets a JS challenge. Add `$CF_ZONE` and a scoped `$CF_API_TOKEN` (permission: Zone Settings: Edit) to the ops vault before an incident happens, not during one.

## Traefik hardening (defence in depth)

Regardless of whether Cloudflare is in front, harden Traefik:

### Strict Host matcher

Every router must pin the Host header. A default catch-all returning 444 blocks direct-IP probes.

```yaml
http:
  routers:
    app:
      rule: "Host(`marketplace.tld`)"
      service: marketplace
      tls: {}
    default:
      rule: "HostRegexp(`{any:.+}`)"
      service: noop
      priority: 1  # lowest, only fires when nothing else matches

  services:
    noop:
      loadBalancer:
        servers: []  # Traefik returns 404 with no body
```

### Trusted forwarded IPs

Only accept `x-forwarded-for` from Cloudflare's published ranges. Without this, an attacker can spoof client IPs to the app.

```yaml
entryPoints:
  websecure:
    address: ":443"
    forwardedHeaders:
      trustedIPs:
        # Refresh from https://www.cloudflare.com/ips-v4/ on a schedule.
        - 173.245.48.0/20
        - 103.21.244.0/22
        - 103.22.200.0/22
        # ... (full list)
        - 2400:cb00::/32
        # ... (v6 list)
      insecure: false
```

### Rate limit middleware

Belt-and-braces with Cloudflare's edge rules:

```yaml
http:
  middlewares:
    auth-throttle:
      rateLimit:
        average: 20
        period: 1m
        burst: 40
```

Attach to the auth router.

### Admin-host IP allow-list

When `ADMIN_HOST` is set (see `docs/admin-host.md`), also lock the admin vhost to known office IPs:

```yaml
http:
  middlewares:
    admin-allowlist:
      ipAllowList:
        sourceRange:
          - 203.0.113.0/24  # office
          - 198.51.100.42/32  # oncall home VPN exit
```

## Verification checklist

After the cut-over, run the automated probe:

```sh
APP_HOST=marketplace.tld ORIGIN_IP=203.0.113.42 \
  ./scripts/verify-edge-protection.sh
```

The script exits 0 when all five checks pass (DNS, origin refuses direct IP, Host spoof returns 404, edge rate limit fires, `cf-ray` present) and non-zero with a per-check diff otherwise. It's also the quickest way to tell whether a change to Traefik or Cloudflare config landed cleanly — rerun after every edge-side edit.

Manual items the script cannot verify:

- [ ] `getClientIP` in app logs shows the real client IP (requires `TRUST_PROXY_HEADERS=true` + Cloudflare IPs in Traefik's `trustedIPs`). Tail `docker logs marketplace` while a curl from an external IP hits `/api/auth/signin` and confirm the log scope has the right IP, not `untrusted-client`.
- [ ] `/api/healthcheck` returns 200 through the tunnel — external probe (UptimeRobot / BetterStack) confirms both the tunnel and the origin are healthy end-to-end.

## App-layer assumptions this runbook relies on

- [`src/lib/ratelimit.ts`](../../src/lib/ratelimit.ts) honours `TRUST_PROXY_HEADERS=true` to parse `x-forwarded-for`. `src/lib/env.ts` refuses to boot in production without it (see #538).
- The Sentry scrubber already strips PII before events leave the origin, so no extra Cloudflare log-egress scrubbing is required.
- `/api/healthcheck` is un-auth'd and safe to expose for synthetic probes.
