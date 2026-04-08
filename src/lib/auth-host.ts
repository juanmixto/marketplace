export function shouldUseDynamicAuthUrl(env: NodeJS.ProcessEnv) {
  const authUrl = env.AUTH_URL ?? env.NEXTAUTH_URL

  return (
    env.NODE_ENV !== 'production' &&
    typeof authUrl === 'string' &&
    authUrl.includes('localhost')
  )
}

export function normalizeAuthHostEnv(env: NodeJS.ProcessEnv) {
  const nextEnv = { ...env }

  if (shouldUseDynamicAuthUrl(env)) {
    delete nextEnv.AUTH_URL
    delete nextEnv.NEXTAUTH_URL
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
