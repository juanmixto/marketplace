'use client'

import { StarIcon } from '@heroicons/react/24/solid'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface Review {
  id: string
  rating: number
  body: string | null
  createdAt: Date
  customer: {
    firstName: string
    lastName: string
  }
  product: {
    name: string
  }
}

interface VendorReviewsSectionProps {
  reviews: Review[]
  avgRating: number | null
  totalReviews: number
}

export function VendorReviewsSection({
  reviews,
  avgRating,
  totalReviews,
}: VendorReviewsSectionProps) {
  if (totalReviews === 0 && !avgRating) {
    return (
      <div className="text-center py-8 text-gray-600">
        Aún no hay reseñas. ¡Sé el primero en reseñar!
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      <div className="flex items-center gap-6 pb-6 border-b border-gray-200">
        <div>
          <div className="text-4xl font-bold text-emerald-600">
            {avgRating ? avgRating.toFixed(1) : 'N/A'}
          </div>
          <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4, 5].map(i => (
              <StarIcon
                key={i}
                className={`h-5 w-5 ${
                  avgRating && i <= Math.round(avgRating)
                    ? 'text-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {totalReviews} reseña{totalReviews !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.map(review => (
          <div
            key={review.id}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900">
                  {review.customer.firstName} {review.customer.lastName}
                </p>
                <p className="text-xs text-gray-600">
                  {review.product.name} · hace{' '}
                  {formatDistanceToNow(new Date(review.createdAt), {
                    locale: es,
                    addSuffix: false,
                  })}
                </p>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <StarIcon
                    key={i}
                    className={`h-4 w-4 ${
                      i <= review.rating
                        ? 'text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>
            {review.body && (
              <p className="text-sm text-gray-700">{review.body}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
