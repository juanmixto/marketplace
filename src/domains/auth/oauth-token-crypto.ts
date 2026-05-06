/**
 * AES-256-GCM at-rest encryption for OAuth tokens stored in `Account`
 * (#1349, epic #1346).
 *
 * Three columns are sensitive:
 *   - `refresh_token` — long-lived; lets the holder mint access tokens
 *     until the user revokes the app at the provider.
 *   - `id_token` — JWT proving identity; useful for impersonation in
 *     systems that accept it.
 *   - `access_token` — short-lived but immediately usable.
 *
 * Decision (issue #1349 acceptance §1): we don't currently use any of
 * these tokens after sign-in (JWT session strategy, no offline access,
 * no per-provider API calls). `access_token` is therefore stored as
 * `null` to remove an entire class of leak. `refresh_token` and
 * `id_token` are encrypted in case future flows need them.
 *
 * Domain-keyed (`oauth-token:v1`) so a leaked Account-token ciphertext
 * cannot decrypt 2FA secrets or vendor IBANs even if the same row
 * format appears across all three.
 */

import { encryptForStorage, decryptFromStorage } from '@/lib/at-rest-crypto'

const KEY_DOMAIN = 'oauth-token:v1'

export function encryptOauthToken(plaintext: string): string {
  return encryptForStorage(plaintext, KEY_DOMAIN)
}

export function decryptOauthToken(wire: string): string {
  return decryptFromStorage(wire, KEY_DOMAIN)
}

/**
 * Translates the raw `linkAccount` payload from NextAuth into the
 * shape we actually persist:
 *   - `access_token` is dropped (set to null)
 *   - `refresh_token` / `id_token` are encrypted in place
 *   - everything else is forwarded verbatim
 *
 * Defensive about `null` / `undefined` separately so an upstream
 * change in the NextAuth payload shape can't accidentally turn an
 * encrypted column into the literal string `"undefined"`.
 */
export function encryptLinkAccountPayload<T extends {
  refresh_token?: string | null
  access_token?: string | null
  id_token?: string | null
}>(data: T): T {
  return {
    ...data,
    access_token: null,
    refresh_token:
      typeof data.refresh_token === 'string' && data.refresh_token.length > 0
        ? encryptOauthToken(data.refresh_token)
        : data.refresh_token ?? null,
    id_token:
      typeof data.id_token === 'string' && data.id_token.length > 0
        ? encryptOauthToken(data.id_token)
        : data.id_token ?? null,
  }
}
