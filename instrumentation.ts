export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { registerTelegramHandlers } = await import(
    '@/domains/notifications/telegram/handlers/register'
  )
  registerTelegramHandlers()
}
