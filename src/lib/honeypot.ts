/**
 * Honeypot field for low-effort bot detection (#1271).
 *
 * The form renders a hidden text input named `website` (kept off-screen,
 * `tabIndex=-1`, `autoComplete=off`, `aria-hidden=true`). A human user
 * never sees nor interacts with it. A naive form-filling bot fills every
 * `<input>` it finds, so a non-empty value here is signal that the
 * submission is automated.
 *
 * Treatment is intentionally a *silent 200* on the server: we don't
 * reject with 4xx, we don't rate-limit it, we don't echo any error to
 * the client. The bot thinks it succeeded and moves on; we save the
 * mailbox / DB row and emit a metric so we can size the volume.
 */

export const HONEYPOT_FIELD_NAME = 'website'

export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
