import { auth } from '@/lib/auth'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import AppBadgeSync from '@/components/pwa/AppBadgeSync'
import { getPendingReviewsCount } from '@/domains/reviews/pending'

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // Feed the installed-app badge with the number of delivered lines the
  // buyer still has to review. Cheap: reuses the existing helper already
  // called by the buyer dashboard, so we don't add a new N+1 query.
  const badgeCount = session?.user?.id
    ? await getPendingReviewsCount(session.user.id).catch(() => undefined)
    : undefined

  return (
    <>
      <Header user={session?.user} />
      <AppBadgeSync count={badgeCount} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  )
}
