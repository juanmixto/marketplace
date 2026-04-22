'use server'

import { signIn } from '@/lib/auth'
import { STOREFRONT_PATH, sanitizeCallbackUrl } from '@/lib/portals'

function getStringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export async function submitCredentialsLogin(formData: FormData) {
  const callbackUrl = sanitizeCallbackUrl(getStringField(formData, 'callbackUrl')) ?? STOREFRONT_PATH

  const payload: Record<string, string> = {
    redirectTo: callbackUrl,
  }

  const email = getStringField(formData, 'email')
  if (email) payload.email = email

  const password = getStringField(formData, 'password')
  if (password) payload.password = password

  const totpCode = getStringField(formData, 'totpCode')
  if (totpCode) payload.totpCode = totpCode

  const rememberDevice = getStringField(formData, 'rememberDevice')
  if (rememberDevice) payload.rememberDevice = rememberDevice

  await signIn('credentials', payload)
}
