import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getServerT } from '@/i18n/server'
import { getMyBuyerPreferences } from '@/domains/notifications'
import { getTelegramConfig } from '@/domains/notifications/telegram/config'
import { getTelegramLinkForUser } from '@/domains/notifications/telegram/queries'
import { db } from '@/lib/db'
import { BuyerTelegramConnectPanel } from './BuyerTelegramConnectPanel'
import { BuyerNotificationPreferencesForm } from './BuyerNotificationPreferencesForm'

export const metadata: Metadata = { title: 'Notificaciones' }

export default async function BuyerNotificationsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const t = await getServerT()
  const config = getTelegramConfig()

  if (!config) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('account.notifications.title')}</h1>
        <p className="text-sm text-[var(--muted)]">{t('account.notifications.comingSoon')}</p>
      </div>
    )
  }

  const [preferences, link, pushSubscriptionCount] = await Promise.all([
    getMyBuyerPreferences(),
    getTelegramLinkForUser(session.user.id),
    db.pushSubscription.count({ where: { userId: session.user.id } }),
  ])
  const webPushSubscribed = pushSubscriptionCount > 0

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('account.notifications.title')}</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">{t('account.notifications.subtitle')}</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('account.telegram.title')}</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{t('account.telegram.subtitle')}</p>
        </div>
        <BuyerTelegramConnectPanel initialLink={link} botUsername={config.botUsername} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('account.notifications.preferencesTitle')}</h2>
        <BuyerNotificationPreferencesForm
          preferences={preferences}
          telegramLinked={link.linked}
          webPushSubscribed={webPushSubscribed}
        />
      </section>
    </div>
  )
}
