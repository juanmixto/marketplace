import type { Metadata } from 'next'
import { requireVendor } from '@/lib/auth-guard'
import { getServerT } from '@/i18n/server'
import { getMyPreferences } from '@/domains/notifications'
import { getTelegramConfig } from '@/domains/notifications/telegram/config'
import { getTelegramLinkForUser } from '@/domains/notifications/telegram/queries'
import { NotificationPreferencesForm } from './NotificationPreferencesForm'

export const metadata: Metadata = { title: 'Notificaciones' }

export default async function VendorNotificationsPage() {
  const session = await requireVendor()
  const t = await getServerT()
  const config = getTelegramConfig()

  if (!config) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.notifications.title')}</h1>
        <p className="text-sm text-[var(--muted)]">{t('vendor.notifications.comingSoon')}</p>
      </div>
    )
  }

  const [preferences, link] = await Promise.all([
    getMyPreferences(),
    getTelegramLinkForUser(session.user.id),
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.notifications.title')}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{t('vendor.notifications.subtitle')}</p>
      </div>
      <NotificationPreferencesForm
        preferences={preferences}
        telegramLinked={link.linked}
      />
    </div>
  )
}
