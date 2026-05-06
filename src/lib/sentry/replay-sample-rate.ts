/**
 * UA-aware Sentry replay sample-rate selector (#1222).
 *
 * Mobile-first: per AGENTS.md, the mobile UX is the priority surface,
 * so we replay errors there at a higher rate than desktop. Pure
 * function — testable without spinning up a browser.
 *
 * Defaults match the issue acceptance:
 *   mobile  on-error sample = 0.50
 *   desktop on-error sample = 0.25
 *   session sample (any UA) = 0.00 (cost + privacy)
 *
 * Both on-error rates are independently env-controllable so an
 * incident response can dial either one to 1.0 ("replay every
 * mobile error today") without a redeploy.
 */

/**
 * Cheap UA classifier. We do NOT need full UA parsing — the only
 * decision is "small touch device or not". The standard `Mobi`
 * substring is the official Mozilla recommendation:
 *   https://developer.mozilla.org/docs/Web/HTTP/Browser_detection_using_the_user_agent#mobile_tablet_or_desktop
 *
 * Tablets (iPad, Android tablet) get treated as mobile too — they
 * share the touch UX surface that the higher sample rate is for.
 */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  // Mobi: every spec-compliant mobile UA has it.
  // Android: covers Android tablets + WebViews that omit Mobi.
  // iPad: Safari 13+ on iPad reports as "Macintosh; Mac OS X" with
  //   touch — handle the explicit `iPad` legacy + the iPadOS 13+
  //   shape via the `Mac` + (`AppleWebKit` AND no Windows/Linux) +
  //   touch hint. We approximate with a broader iPadOS check.
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)) return true
  // iPadOS 13+ desktop-mode: "Macintosh; Intel Mac OS X" + WebKit +
  // mobile-only frameworks. Cheap heuristic: a Mac UA that ALSO
  // mentions Mobile or has explicit iPadOS hint.
  if (/Macintosh.*Mobile/i.test(userAgent)) return true
  return false
}

export interface ReplayRateConfig {
  /** Sample rate for mobile + tablet UAs. Default 0.5. */
  mobile: number
  /** Sample rate for desktop UAs. Default 0.25. */
  desktop: number
}

/**
 * Picks the on-error replay rate for the current UA.
 */
export function pickOnErrorSampleRate(
  userAgent: string | null | undefined,
  config: ReplayRateConfig,
): number {
  return isMobileUserAgent(userAgent) ? config.mobile : config.desktop
}

/**
 * Reads both rates from env, with sensible defaults. Both are
 * clamped to [0, 1] so a typo in `.env` ("50" instead of "0.5")
 * cannot accidentally request 5000% sampling.
 */
export function loadReplayRateConfig(
  env: Record<string, string | undefined>,
): ReplayRateConfig {
  const rawMobile = env.SENTRY_REPLAYS_ONERROR_SAMPLE_RATE_MOBILE
    ?? env.SENTRY_REPLAYS_ONERROR_SAMPLE_RATE
    ?? '0.5'
  const rawDesktop = env.SENTRY_REPLAYS_ONERROR_SAMPLE_RATE_DESKTOP ?? '0.25'
  return {
    mobile: clamp01(Number(rawMobile)),
    desktop: clamp01(Number(rawDesktop)),
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return 1
  return n
}
