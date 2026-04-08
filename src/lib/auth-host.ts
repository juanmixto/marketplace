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
