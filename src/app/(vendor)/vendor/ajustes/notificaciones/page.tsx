import type { Metadata } from 'next'
import { requireVendor } from '@/lib/auth-guard'
import { getServerT } from '@/i18n/server'
import { getMyPreferences } from '@/domains/notifications'
import { getTelegramConfig } from '@/domains/notifications/telegram/config'
import { getTelegramLinkForUser } from '@/domains/notifications/telegram/queries'
import { generateLinkToken } from '@/domains/notifications/telegram/link-token'
import { db } from '@/lib/db'
import { NotificationPreferencesForm } from './NotificationPreferencesForm'
import { TelegramConnectPanel } from './TelegramConnectPanel'
import { WebPushConnectPanel } from './WebPushConnectPanel'

export const metadata: Metadata = { title: 'Notificaciones' }
export const dynamic = 'force-dynamic'

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

  const [preferences, link, pushSubscriptionCount] = await Promise.all([
    getMyPreferences(),
    getTelegramLinkForUser(session.user.id),
    db.pushSubscription.count({ where: { userId: session.user.id } }),
  ])
  const webPushSubscribed = pushSubscriptionCount > 0

  const initialLinkUrl = link.linked
    ? null
    : `https://t.me/${config.botUsername}?start=${await generateLinkToken(session.user.id)}`

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.notifications.title')}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{t('vendor.notifications.subtitle')}</p>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <TelegramConnectPanel initialLink={link} initialLinkUrl={initialLinkUrl} />
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <WebPushConnectPanel />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('vendor.notifications.preferencesTitle')}</h2>
        <NotificationPreferencesForm
          preferences={preferences}
          telegramLinked={link.linked}
          webPushSubscribed={webPushSubscribed}
        />
      </section>
    </div>
  )
}
