import { getServerEnv } from '@/lib/env'

export interface SendcloudConfig {
  baseUrl: string
  publicKey: string
  secretKey: string
  defaultSenderId: number | null
  webhookSecret: string
}

export function loadSendcloudConfig(): SendcloudConfig {
  const env = getServerEnv()
  if (!env.sendcloudConfigured) {
    throw new Error('Sendcloud is not configured; set SENDCLOUD_PUBLIC_KEY, SENDCLOUD_SECRET_KEY and SENDCLOUD_WEBHOOK_SECRET')
  }
  return {
    baseUrl: env.sendcloudBaseUrl,
    publicKey: env.sendcloudPublicKey!,
    secretKey: env.sendcloudSecretKey!,
    defaultSenderId: env.sendcloudSenderId,
    webhookSecret: env.sendcloudWebhookSecret!,
  }
}

export function isSendcloudConfigured(): boolean {
  return getServerEnv().sendcloudConfigured
}
