import { Metadata } from 'next'
import Link from 'next/link'
import { requireVendor } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { VendorReviewsManager } from '@/components/vendor/VendorReviewsManager'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = {
  title: 'Mis Valoraciones | Portal Productor',
  description: 'Gestiona y revisa las valoraciones de tus productos',
}

const PAGE_SIZE = 20

type SearchParams = { cursor?: string }

export default async function Valoraciones({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const { user } = await requireVendor()
  const t = await getServerT()
  const params = (await searchParams) ?? {}
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined

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

  // DB audit P1.2-A (#963): cursor pagination so a vendor with many
  // reviews does not hydrate the whole table on every dashboard load.
  // `take: PAGE_SIZE + 1` is the standard "is there a next page?"
  // probe — the extra row is sliced off before render. Stable sort
  // adds `id desc` as tiebreaker so reviews with identical createdAt
  // never duplicate or skip across pages.
  const [pageReviews, aggregate] = await Promise.all([
    db.review.findMany({
      where: { vendorId: vendor.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
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

  const hasNextPage = pageReviews.length > PAGE_SIZE
  const reviews = hasNextPage ? pageReviews.slice(0, PAGE_SIZE) : pageReviews
  const nextCursor = hasNextPage ? reviews[reviews.length - 1]?.id : null
  const isFirstPage = !cursor

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
        <>
          <VendorReviewsManager
            reviews={reviews}
            avgRating={aggregate._avg.rating ? Number(aggregate._avg.rating) : null}
            totalReviews={aggregate._count._all}
          />
          {(hasNextPage || !isFirstPage) && (
            <nav
              aria-label={t('reviews.vendorPage.paginationLabel')}
              className="flex items-center justify-between border-t border-[var(--border)] pt-4"
            >
              {isFirstPage ? (
                <span aria-hidden="true" />
              ) : (
                <Link
                  href="/vendor/valoraciones"
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
                >
                  {t('reviews.vendorPage.paginationFirst')}
                </Link>
              )}
              {hasNextPage && nextCursor ? (
                <Link
                  href={{
                    pathname: '/vendor/valoraciones',
                    query: { cursor: nextCursor },
                  }}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
                >
                  {t('reviews.vendorPage.paginationOlder')}
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>
          )}
        </>
      )}
    </main>
  )
}
