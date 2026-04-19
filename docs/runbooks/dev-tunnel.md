# `dev.feldescloud.com` 502 — Cloudflare Tunnel runbook

`dev.feldescloud.com` is served by a **Cloudflare Tunnel** (`marketplace-dev`) that
forwards traffic to `http://localhost:3001` on the developer machine running
`cloudflared`. There is no remote host, no PaaS, no CI deploy — the "dev origin"
is literally a `next dev` process on a laptop.

`cloudflared` runs as a **systemd service** (`/etc/systemd/system/cloudflared.service`,
installed via `cloudflared service install <TOKEN>`). It starts automatically at
boot; no manual intervention needed after a reboot.

Two distinct failure modes:

- **Error 502** on the Cloudflare page → tunnel is connected, but nothing is
  listening on `localhost:3001`. Fix: start `next dev -p 3001` (see below).
- **Error 1033** ("Cloudflare Tunnel error") → the tunnel connector is not
  connected to Cloudflare's edge. Fix: `sudo systemctl status cloudflared` and
  restart if dead. In the dashboard (Networks → Tunnels → `marketplace-dev`),
  "Origin configurations: 0" confirms no connector is attached.

## Fix (30 seconds)

From the `marketplace` checkout:

```bash
npx next dev -p 3001
```

Leave it running. First request will take a few seconds while Turbopack
compiles. Reload the page.

If you want it detached:

```bash
nohup npx next dev -p 3001 > /tmp/dev-3001.log 2>&1 &
```

Check it's up:

```bash
ss -tlnp | grep 3001
```

## Why this happens

- The default `npm run dev` uses port **3000**, not 3001. If you only start the
  default dev server, the tunnel still 502s.
- Restarting the laptop, closing the terminal, or killing the dev server tears
  down the origin — Cloudflare keeps the tunnel up but has nowhere to forward.
- The tunnel route is configured in the Cloudflare Zero Trust dashboard
  (Networks → Tunnels → `marketplace-dev` → Published application routes).
  Catch-all is `http_status:404`; the only real route is
  `dev.feldescloud.com → http://localhost:3001`.

## Prevention

Two options, pick one:

1. **Always start dev on 3001** when you want the public URL to work:
   `npx next dev -p 3001`. Make it a shell alias if you forget.
2. **Re-point the tunnel to 3000** in the Cloudflare UI (Published application
   routes → edit → Service `http://localhost:3000`). Then plain `npm run dev`
   is enough. Do this if you never run two dev servers at once.

## Diagnostics checklist

If `dev.feldescloud.com` 502s:

1. `ss -tlnp | grep 3001` — is anything listening?
2. If not, start `next dev -p 3001` (see above).
3. If yes, check `cloudflared` is running: `sudo systemctl status cloudflared`.
   Restart with `sudo systemctl restart cloudflared` if dead.
4. Check the Cloudflare dashboard → Tunnels → `marketplace-dev` → Overview.
   Status should be **HEALTHY**. If **DOWN**, `cloudflared` on the laptop is
   not connected to Cloudflare's edge — usually a network issue, not a code
   issue.

None of this is fixable by editing code in the repo. The repo has no
deployment pipeline for `dev.feldescloud.com`.

## "The page loads but nothing is interactive"

Different failure mode from 502 — the HTML renders, but the cart button, theme
toggle, language switcher, and vendor-sidebar collapse all silently do nothing.

**Cause:** Next.js 16 blocks cross-origin requests to `/_next/*` dev resources
by default. When the page is reached via `dev.feldescloud.com` (not
`localhost`), the client JS chunks and HMR socket are refused, hydration dies,
and every interactive control becomes a no-op.

**Symptom in the dev-server log:**

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "dev.feldescloud.com".
```

**Fix:** the tunnel host must be in `allowedDevOrigins` in
[`next.config.ts`](../../next.config.ts). `*.feldescloud.com` is already listed
there — do not remove it. If you add a new tunnel host, add it to that list
and restart `next dev`.

After fixing, a **hard refresh** in the browser (Ctrl+Shift+R) is required to
drop the stale service worker and broken JS chunks.
