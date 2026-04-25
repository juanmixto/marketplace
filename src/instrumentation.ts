/**
 * Next.js runtime instrumentation hook. Fires once per process on the
 * server side at boot. We use it to initialize Sentry so server
 * exceptions, route handler throws, and server actions errors all get
 * captured without any wrapper code in the handlers themselves.
 *
 * Client-side Sentry init happens via sentry.client.config.ts (Next's
 * `@sentry/nextjs` plugin picks it up automatically).
 *
 * Degrades to a no-op when `SENTRY_DSN` is absent — safe for dev, CI,
 * and self-hosted deployments that don't want error tracking.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
    const [{ ensureTelegramHandlersRegistered }, { ensureWebPushHandlersRegistered }] = await Promise.all([
      import('./domains/notifications/telegram/ensure-registered'),
      import('./domains/notifications/web-push/ensure-registered'),
    ])
    ensureTelegramHandlersRegistered()
    ensureWebPushHandlersRegistered()
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}
