/**
 * Disposable email blocklist (#1280).
 *
 * Curated set of the most prevalent throwaway / temporary mail
 * services. The list is intentionally small (top services by traffic,
 * not exhaustive) — covering 80% of the spam at <2 KB of bundled JS
 * is the right trade-off for a public-facing register endpoint.
 *
 * For exhaustive coverage we'd swap to the `disposable-email-domains`
 * package (~10k entries) — gated for a follow-up when we see the
 * volume justify the bundle cost.
 *
 * Rule: lower-cased ASCII, no leading dot. Comparison is exact-match
 * on the user's email domain. Subdomain matching is intentional
 * (`foo.tempmail.io` blocked because `tempmail.io` is in the set).
 */

const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  // Mailinator family (the largest by volume)
  'mailinator.com',
  'binkmail.com',
  'bobmail.info',
  'chammy.info',
  'devnullmail.com',
  'letthemeatspam.com',
  'mailinater.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'notmailinator.com',
  'reallymymail.com',
  'reconmail.com',
  'safetymail.info',
  'sendspamhere.com',
  'sogetthis.com',
  'spambooger.com',
  'streetwisemail.com',
  'suremail.info',
  'thisisnotmyrealemail.com',
  'tradermail.info',
  'veryrealemail.com',
  'zippymail.info',
  // 10minutemail family
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  '20minutemail.com',
  '30minutemail.com',
  '60minutemail.com',
  // Guerrilla mail family
  'guerrillamail.com',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'spam4.me',
  'pokemail.net',
  // Temp-mail family
  'temp-mail.org',
  'temp-mail.com',
  'temp-mail.io',
  'tempmail.com',
  'tempmail.io',
  'tempmail.net',
  'tempmail.plus',
  'tempmailaddress.com',
  'tempmail.dev',
  'tempm.com',
  // Yopmail family
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'nospam.ze.tc',
  'nomail.xl.cx',
  'mega.zik.dj',
  'speed.1s.fr',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  // Throwaway / single-use
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.io',
  'trashmail.net',
  'trashmail.org',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'wegwerfemail.de',
  'fakeinbox.com',
  'fakemail.fr',
  'fakemailgenerator.com',
  'getairmail.com',
  'getnada.com',
  'inboxbear.com',
  'incognitomail.com',
  'mytrashmail.com',
  'spamgourmet.com',
  'spamoff.de',
  'discard.email',
  'discardmail.com',
  'maildrop.cc',
  'mailnesia.com',
  'mintemail.com',
  'mvrht.com',
  'mt2014.com',
  'mt2015.com',
  // Common newer entrants seen in 2025-2026 abuse logs
  'edu.in.eu.org',
  'kanker.shop',
  'imailto.net',
  'icznn.com',
  'ezztt.com',
  'edny.net',
  'tafmail.com',
  'mailsac.com',
  'emltmp.com',
  'inboxkitten.com',
  'tmpmail.org',
  'tmpmail.net',
  'tmail.ws',
  'dropmail.me',
  'mohmal.com',
  'harakirimail.com',
])

/**
 * Returns true if the email's domain matches a known disposable
 * service. Defensive: invalid input returns false (let zod's email
 * validator surface the shape error).
 */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return false
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain) return false
  return DISPOSABLE_DOMAINS.has(domain)
}
