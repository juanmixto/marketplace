import crypto from 'node:crypto'

/**
 * Verifies the Sendcloud webhook signature (HMAC-SHA256 of the raw body
 * with the integration secret). Returns true if the signature matches.
 *
 * Kept in its own module so unit tests can import it without pulling in
 * the Prisma client or Next.js runtime.
 *
 * https://api.sendcloud.dev/docs/sendcloud-public-api/integrations
 */
export function verifySendcloudSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signatureHeader, 'hex'),
    )
  } catch {
    return false
  }
}
