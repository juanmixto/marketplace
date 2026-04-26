import { auth } from '@/lib/auth'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import AppBadgeSync from '@/components/pwa/AppBadgeSync'
import { getPendingReviewsCount } from '@/domains/reviews/pending'
import { getVisibleCategorySlugs } from '@/domains/catalog/queries'

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // Feed the installed-app badge with the number of delivered lines the
  // buyer still has to review. Cheap: reuses the existing helper already
  // called by the buyer dashboard, so we don't add a new N+1 query.
  const [badgeCount, availableCategorySlugs] = await Promise.all([
    session?.user?.id
      ? getPendingReviewsCount(session.user.id).catch(() => undefined)
      : Promise.resolve(undefined),
    getVisibleCategorySlugs(),
  ])

  return (
    <>
      <Header user={session?.user} availableCategorySlugs={availableCategorySlugs} />
      <AppBadgeSync count={badgeCount} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  )
}
