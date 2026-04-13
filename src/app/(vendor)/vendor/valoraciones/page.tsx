import { Metadata } from 'next'
import { requireVendor } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { VendorReviewsManager } from '@/components/vendor/VendorReviewsManager'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = {
  title: 'Mis Valoraciones | Portal Productor',
  description: 'Gestiona y revisa las valoraciones de tus productos',
}

export default async function Valoraciones() {
  const { user } = await requireVendor()
  const t = await getServerT()

  const vendor = await db.vendor.findUnique({
    where: { userId: user.id },
    select: { id: true, displayName: true },
  })

  if (!vendor) {
    return (
      <main className="space-y-6">
        <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800 dark:bg-amber-950/40 dark:text-amber-300">
          {t('reviews.vendorPage.noVendor')}
        </div>
      </main>
    )
  }

  const [reviews, aggregate] = await Promise.all([
    db.review.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        vendorResponse: true,
        vendorResponseAt: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        product: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    }),
    db.review.aggregate({
      where: { vendorId: vendor.id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">{t('reviews.vendorPage.title')}</h1>
        <p className="mt-2 text-[var(--muted)]">{t('reviews.vendorPage.subtitle')}</p>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--surface-raised)] p-8 text-center">
          <p className="text-lg text-[var(--muted)]">{t('reviews.vendorPage.empty')}</p>
        </div>
      ) : (
        <VendorReviewsManager
          reviews={reviews}
          avgRating={aggregate._avg.rating ? Number(aggregate._avg.rating) : null}
          totalReviews={aggregate._count._all}
        />
      )}
    </main>
  )
}
