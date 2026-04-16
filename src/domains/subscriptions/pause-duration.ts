/**
 * Pause-duration helpers shared between buyer and vendor actions.
 * Lives in its own file (not a 'use server' module) so the exported
 * utility function doesn't trip the "Server Actions must be async"
 * rule that Next 16 enforces on every export from a 'use server' file.
 */

export type PauseDuration = '1w' | '2w' | '1m' | 'indefinite'

export function computePausedUntil(duration: PauseDuration): Date | null {
  if (duration === 'indefinite') return null
  const now = new Date()
  const days = duration === '1w' ? 7 : duration === '2w' ? 14 : 30
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}
