// Client-side helper to recognize an idempotent-replay error coming
// back from a server action. Server actions serialize Error instances
// across the boundary as plain objects with `name` and `message`, so we
// match by message prefix (the `name` is sometimes preserved, sometimes
// not, depending on Next.js internals). The message is canonical:
// `Idempotent replay detected: {scope}/{token}` — see src/lib/idempotency.ts.

const REPLAY_MARKER = 'Idempotent replay detected'

/**
 * True when the server action threw an AlreadyProcessedError. Use to
 * branch the catch handler into a "tu cambio ya se guardó" toast
 * instead of a generic error message — the user double-tapped on a
 * flaky network and the server correctly deduped.
 */
export function isAlreadyProcessedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AlreadyProcessedError') return true
  return error.message.startsWith(REPLAY_MARKER)
}
