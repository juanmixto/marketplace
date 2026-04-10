import { Metadata } from 'next'
import { requireVendor } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { VendorReviewsSection } from '@/app/(public)/productores/[slug]/VendorReviewsSection'

export const metadata: Metadata = {
  title: 'Mis Valoraciones | Portal Productor',
  description: 'Gestiona y revisa las valoraciones de tus productos',
}

export default async function Valoraciones() {
  const { user } = await requireVendor()

  const vendor = await db.vendor.findUnique({
    where: { userId: user.id },
    select: { id: true, displayName: true },
  })

  if (!vendor) {
    return (
      <main className="space-y-6">
        <div className="rounded-lg bg-yellow-50 p-4 text-yellow-800">
          No se encontró información del productor
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
        <h1 className="text-3xl font-bold text-gray-900">Mis valoraciones</h1>
        <p className="mt-2 text-gray-600">
          Reseñas de clientes sobre tus productos
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-lg text-gray-600">
            Aún no tienes valoraciones. Cuando tus clientes reciban sus pedidos y compren de nuevo, podrán dejarte reseñas.
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-white p-6 shadow">
          <VendorReviewsSection
            reviews={reviews}
            avgRating={aggregate._avg.rating ? Number(aggregate._avg.rating) : null}
            totalReviews={aggregate._count._all}
          />
        </div>
      )}
    </main>
  )
}
