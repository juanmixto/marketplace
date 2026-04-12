import { Metadata } from 'next'
import { requireAuth } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { DireccionesClient } from './DireccionesClient'
import { getServerT } from '@/i18n/server'
import { SITE_NAME } from '@/lib/constants'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return {
    title: `${t('account.addressesTitle')} | ${SITE_NAME}`,
    description: t('account.addressesSubtitle'),
  }
}

export default async function Direcciones() {
  const session = await requireAuth()
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true },
  })
  const t = await getServerT()

  return (
    <main className="space-y-6 max-w-3xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">{t('account.addressesTitle')}</h1>
        <p className="mt-2 text-[var(--muted)]">
          {t('account.addressesSubtitle')}
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <DireccionesClient
          userFirstName={user?.firstName ?? ''}
          userLastName={user?.lastName ?? ''}
        />
      </div>
    </main>
  )
}
