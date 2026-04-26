/**
 * HMAC-signed, short-lived token used by the OAuth `signIn` callback to
 * hand off a denied social login to `/login/link` (#854-lite). The token
 * is the only piece of state that crosses that boundary; the user's
 * OAuth credentials (id_token / access_token) are intentionally NOT
 * embedded — Phase 5 re-runs `signIn(provider)` after the password gate
 * with a short-lived `__Host-auth-link-confirmed` cookie that the
 * `signIn` callback consumes to permit the link.
 *
 * Edge-safe: uses Web Crypto only (no `node:crypto`). Importable from
 * middleware and server components alike.
 *
 * Format: `<base64url(payload)>.<base64url(sig)>`. Payload is JSON.
 */

const TOKEN_TTL_SECONDS = 5 * 60

export interface AuthLinkTokenPayload {
  /** Normalized email of the existing User row that collided. */
  email: string
  /** OAuth provider id (e.g. 'google'). */
  provider: string
  /** Provider-side stable account id. Recorded so the post-link
   *  re-`signIn` only proceeds for the same provider account. */
  providerAccountId: string
  /** Optional callback URL the user was originally heading to. Already
   *  sanitized by the caller — verify() does NOT re-validate it. */
  callbackUrl?: string
  /** Unix seconds. */
  exp: number
}

export class AuthLinkTokenError extends Error {
  constructor(public readonly code: 'expired' | 'malformed' | 'bad_signature') {
    super(`auth_link_token:${code}`)
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function signAuthLinkToken(
  payload: Omit<AuthLinkTokenPayload, 'exp'>,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  const full: AuthLinkTokenPayload = { ...payload, exp: nowSeconds + TOKEN_TTL_SECONDS }
  const body = encoder.encode(JSON.stringify(full))
  const key = await importHmacKey(secret)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, body))
  return `${base64UrlEncode(body)}.${base64UrlEncode(sig)}`
}

export async function verifyAuthLinkToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<AuthLinkTokenPayload> {
  const parts = token.split('.')
  if (parts.length !== 2) throw new AuthLinkTokenError('malformed')
  const [body64, sig64] = parts as [string, string]

  let body: Uint8Array
  let sig: Uint8Array
  try {
    body = base64UrlDecode(body64)
    sig = base64UrlDecode(sig64)
  } catch {
    throw new AuthLinkTokenError('malformed')
  }

  const key = await importHmacKey(secret)
  const expectedSig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, body as BufferSource)
  )
  if (!timingSafeEqual(sig, expectedSig)) throw new AuthLinkTokenError('bad_signature')

  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(body))
  } catch {
    throw new AuthLinkTokenError('malformed')
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as AuthLinkTokenPayload).email !== 'string' ||
    typeof (parsed as AuthLinkTokenPayload).provider !== 'string' ||
    typeof (parsed as AuthLinkTokenPayload).providerAccountId !== 'string' ||
    typeof (parsed as AuthLinkTokenPayload).exp !== 'number'
  ) {
    throw new AuthLinkTokenError('malformed')
  }

  const payload = parsed as AuthLinkTokenPayload
  if (payload.exp < nowSeconds) throw new AuthLinkTokenError('expired')

  return payload
}

export const AUTH_LINK_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS
