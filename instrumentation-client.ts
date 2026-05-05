/**
 * Client-side instrumentation hook (Next.js 15+ convention).
 *
 * Next loads this file ONCE on the very first client navigation, before
 * any React hydration. Anything that needs to wrap the entire client
 * runtime (Sentry, OpenTelemetry, web vitals collectors) goes here.
 *
 * Per Sentry docs (@sentry/nextjs v8+): the SDK is no longer wired
 * automatically via `withSentryConfig` in next.config.ts. The
 * `sentry.client.config.ts` file at repo root only takes effect when
 * something imports it from the client runtime — `instrumentation-client.ts`
 * is that hook.
 *
 * Without this import the client SDK never initialized in prod even
 * with NEXT_PUBLIC_SENTRY_DSN inlined into the bundle (sentryConfig
 * was set, Sentry.init was a no-op because the file was tree-shaken
 * out of the bundle entirely). 2026-05-05 incident: every client React
 * error was invisible to oncall for the first ~24h after Sentry was
 * "configured", until this file was created.
 */

import './sentry.client.config'
