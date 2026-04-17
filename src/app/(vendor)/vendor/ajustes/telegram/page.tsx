import type { Metadata } from 'next'
import { requireVendor } from '@/lib/auth-guard'
import { getServerT } from '@/i18n/server'
import { getTelegramConfig } from '@/domains/notifications/telegram/config'
import { getTelegramLinkForUser } from '@/domains/notifications/telegram/queries'
import { TelegramConnectPanel } from './TelegramConnectPanel'

export const metadata: Metadata = { title: 'Telegram' }

export default async function VendorTelegramPage() {
  const session = await requireVendor()
  const t = await getServerT()
  const config = getTelegramConfig()

  if (!config) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.telegram.title')}</h1>
        <p className="text-sm text-[var(--muted)]">{t('vendor.telegram.comingSoon')}</p>
      </div>
    )
  }

  const link = await getTelegramLinkForUser(session.user.id)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.telegram.title')}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{t('vendor.telegram.subtitle')}</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <TelegramConnectPanel initialLink={link} botUsername={config.botUsername} />
      </section>
    </div>
  )
}
