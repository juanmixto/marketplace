import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { applyAsVendorFromForm } from '@/domains/vendors/apply'
import { isVendorRole } from '@/lib/roles'
import { getServerT } from '@/i18n/server'
import { VendorApplicationForm } from './VendorApplicationForm'

export const metadata: Metadata = { title: 'Solicita invitación al marketplace' }

interface PageProps {
  searchParams?: Promise<{ enviada?: string }>
}

export default async function HazteVendedorPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session) redirect('/login?callbackUrl=/cuenta/hazte-vendedor')

  const t = await getServerT()
  const vendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, slug: true, status: true, displayName: true, createdAt: true },
  })
  const params = await searchParams
  const justSubmitted = params?.enviada === '1'

  if (vendor) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/cuenta" className="mb-4 inline-block text-sm text-[var(--muted)] hover:underline">
          {t('account.becomeVendor.back')}
        </Link>
        <h1 className="mb-2 text-3xl font-bold text-[var(--foreground)]">{vendor.displayName}</h1>
        <StatusPanel status={vendor.status} justSubmitted={justSubmitted} />

        {vendor.status === 'ACTIVE' && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
            <p className="mb-3 font-semibold">{t('account.becomeVendor.statusActiveTitle')}</p>
            <p>{t('account.becomeVendor.statusActiveBody')}</p>
            {isVendorRole(session.user.role) && (
              <Link
                href="/vendor/dashboard"
                className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
              >
                {t('account.becomeVendor.statusActiveCta')}
              </Link>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/cuenta" className="mb-4 inline-block text-sm text-[var(--muted)] hover:underline">
        {t('account.becomeVendor.back')}
      </Link>
      <h1 className="mb-2 text-3xl font-bold text-[var(--foreground)]">
        {t('account.becomeVendor.heading')}
      </h1>
      <p className="mb-6 text-[var(--muted)]">{t('account.becomeVendor.intro')}</p>
      <VendorApplicationForm
        action={applyAsVendorFromForm}
        labels={{
          name: t('account.becomeVendor.formName'),
          namePlaceholder: t('account.becomeVendor.formNamePlaceholder'),
          category: t('account.becomeVendor.formCategory'),
          location: t('account.becomeVendor.formLocation'),
          locationPlaceholder: t('account.becomeVendor.formLocationPlaceholder'),
          description: t('account.becomeVendor.formDescription'),
          descriptionPlaceholder: t('account.becomeVendor.formDescriptionPlaceholder'),
          submit: t('account.becomeVendor.formSubmit'),
          footer: t('account.becomeVendor.formFooter'),
          categoryOptions: [
            { value: '', label: t('account.becomeVendor.categoryUnspecified') },
            { value: 'BAKERY', label: t('account.becomeVendor.categoryBakery') },
            { value: 'CHEESE', label: t('account.becomeVendor.categoryCheese') },
            { value: 'WINERY', label: t('account.becomeVendor.categoryWinery') },
            { value: 'ORCHARD', label: t('account.becomeVendor.categoryOrchard') },
            { value: 'OLIVE_OIL', label: t('account.becomeVendor.categoryOliveOil') },
            { value: 'FARM', label: t('account.becomeVendor.categoryFarm') },
            { value: 'DRYLAND', label: t('account.becomeVendor.categoryDryland') },
            { value: 'LOCAL_PRODUCER', label: t('account.becomeVendor.categoryLocal') },
          ],
        }}
      />
    </div>
  )
}

async function StatusPanel({ status, justSubmitted }: { status: string; justSubmitted: boolean }) {
  const t = await getServerT()
  if (status === 'APPLYING' || status === 'PENDING_DOCS') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="mb-1 font-semibold">
          {justSubmitted
            ? t('account.becomeVendor.statusSubmittedTitle')
            : t('account.becomeVendor.statusReviewingTitle')}
        </p>
        <p>{t('account.becomeVendor.statusReviewingBody')}</p>
      </div>
    )
  }
  if (status === 'REJECTED') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
        <p className="mb-1 font-semibold">{t('account.becomeVendor.statusRejectedTitle')}</p>
        <p>{t('account.becomeVendor.statusRejectedBody')}</p>
      </div>
    )
  }
  if (status === 'SUSPENDED_TEMP' || status === 'SUSPENDED_PERM') {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-100">
        <p className="mb-1 font-semibold">{t('account.becomeVendor.statusSuspendedTitle')}</p>
        <p>{t('account.becomeVendor.statusSuspendedBody')}</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
      <p className="font-semibold">{t('account.becomeVendor.statusActiveHeadline')}</p>
    </div>
  )
}
