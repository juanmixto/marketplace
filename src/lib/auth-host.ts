function isPrivateNetworkHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  )
}

function isDynamicDevAuthUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || isPrivateNetworkHost(parsed.hostname)
  } catch {
    return false
  }
}

function getPreferredDevAuthUrl(env: NodeJS.ProcessEnv) {
  const candidate = env.NEXT_PUBLIC_APP_URL

  if (typeof candidate !== 'string') return null

  try {
    const parsed = new URL(candidate)
    if (parsed.hostname === '0.0.0.0') return null
    // A private-network candidate is just as likely to be stale as AUTH_URL
    // (dev port drifts when 3000 is taken). Prefer request-host resolution via
    // `trustHost: true` in auth.ts instead of pinning a possibly wrong port.
    if (isPrivateNetworkHost(parsed.hostname)) return null
    return candidate
  } catch {
    return null
  }
}

export function shouldUseDynamicAuthUrl(env: NodeJS.ProcessEnv) {
  const authUrl = env.AUTH_URL ?? env.NEXTAUTH_URL

  return (
    env.NODE_ENV !== 'production' &&
    typeof authUrl === 'string' &&
    isDynamicDevAuthUrl(authUrl)
  )
}

export function normalizeAuthHostEnv(env: NodeJS.ProcessEnv) {
  const nextEnv = { ...env }

  if (shouldUseDynamicAuthUrl(env)) {
    const preferredAuthUrl = getPreferredDevAuthUrl(env)

    if (preferredAuthUrl) {
      nextEnv.AUTH_URL = preferredAuthUrl
      nextEnv.NEXTAUTH_URL = preferredAuthUrl
    } else {
      delete nextEnv.AUTH_URL
      delete nextEnv.NEXTAUTH_URL
    }
  }

  return nextEnv
}

export function applyNormalizedAuthHostEnv(env: NodeJS.ProcessEnv) {
  const normalizedEnv = normalizeAuthHostEnv(env)

  if (!('AUTH_URL' in normalizedEnv)) {
    delete env.AUTH_URL
  }

  if (!('NEXTAUTH_URL' in normalizedEnv)) {
    delete env.NEXTAUTH_URL
  }

  for (const [key, value] of Object.entries(normalizedEnv)) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
}
