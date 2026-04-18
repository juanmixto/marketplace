import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdminRole } from '@/lib/roles'
import { getServerT } from '@/i18n/server'
import { EnrollClient } from './EnrollClient'

export async function generateMetadata() {
  const t = await getServerT()
  return { title: t('admin.2fa.title') }
}

// Forced-enrollment landing for admins without 2FA. The proxy
// redirects every /admin/* request here until the admin finishes
// setup. Layout is deliberately bare — full admin chrome is
// available once has2fa is on their JWT.
export default async function AdminEnrollPage() {
  const session = await auth()
  if (!session?.user?.id || !isAdminRole(session.user.role)) {
    redirect('/login')
  }

  // Already enrolled: nothing to do. Send them to the admin dashboard.
  const has2fa = (session.user as { has2fa?: boolean }).has2fa ?? false
  if (has2fa) redirect('/admin')

  const t = await getServerT()

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold mb-4">{t('admin.2fa.title')}</h1>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
        {t('admin.2fa.description')}
      </p>
      <EnrollClient />
    </main>
  )
}
