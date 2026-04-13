export interface SendcloudConfig {
  baseUrl: string
  publicKey: string
  secretKey: string
  defaultSenderId: number | null
  webhookSecret: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

export function loadSendcloudConfig(): SendcloudConfig {
  return {
    baseUrl: process.env.SENDCLOUD_BASE_URL ?? 'https://panel.sendcloud.sc/api/v2',
    publicKey: requireEnv('SENDCLOUD_PUBLIC_KEY'),
    secretKey: requireEnv('SENDCLOUD_SECRET_KEY'),
    defaultSenderId: process.env.SENDCLOUD_SENDER_ID
      ? Number(process.env.SENDCLOUD_SENDER_ID)
      : null,
    webhookSecret: requireEnv('SENDCLOUD_WEBHOOK_SECRET'),
  }
}

export function isSendcloudConfigured(): boolean {
  return Boolean(
    process.env.SENDCLOUD_PUBLIC_KEY &&
      process.env.SENDCLOUD_SECRET_KEY &&
      process.env.SENDCLOUD_WEBHOOK_SECRET,
  )
}
