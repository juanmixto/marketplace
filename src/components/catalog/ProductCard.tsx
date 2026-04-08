import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import type { BadgeVariant, ProductWithVendor } from '@/domains/catalog/types'
import { MapPinIcon } from '@heroicons/react/24/outline'

const CERT_COLORS: Record<string, BadgeVariant> = {
  'ECO-ES': 'green',
  'DOP': 'blue',
  'KM0': 'purple',
  'BIO': 'green',
  'IGP': 'amber',
}

interface ProductCardProps {
  product: ProductWithVendor
}

export function ProductCard({ product }: ProductCardProps) {
  const price = Number(product.basePrice)
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null
  const hasDiscount = compareAt !== null && compareAt > price
  const isLowStock = product.trackStock && product.stock > 0 && product.stock <= 5
  const isOutOfStock = product.trackStock && product.stock === 0

  return (
    <Link
      href={`/productos/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md hover:-translate-y-0.5"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        {product.images?.[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-gray-300">🌿</div>
        )}

        {hasDiscount && (
          <span className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
            -{Math.round(((compareAt! - price) / compareAt!) * 100)}%
          </span>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700">
              Sin stock
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        {/* Certifications */}
        {product.certifications.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {product.certifications.slice(0, 3).map(cert => (
              <Badge
                key={cert}
                variant={CERT_COLORS[cert] ?? 'default'}
                className="text-[10px] px-1.5 py-0"
              >
                {cert}
              </Badge>
            ))}
          </div>
        )}

        <p className="line-clamp-2 text-sm font-medium text-gray-900 leading-snug">
          {product.name}
        </p>

        {product.vendor && (
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
            {product.originRegion && (
              <>
                <MapPinIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{product.originRegion}</span>
                <span>·</span>
              </>
            )}
            <span className="truncate">{product.vendor.displayName}</span>
          </div>
        )}

        <div className="mt-auto pt-2 flex items-end justify-between">
          <div>
            <span className="font-bold text-gray-900">{formatPrice(price)}</span>
            <span className="ml-1 text-xs text-gray-400">/ {product.unit}</span>
            {hasDiscount && (
              <span className="ml-2 text-xs text-gray-400 line-through">
                {formatPrice(compareAt!)}
              </span>
            )}
          </div>
          {isLowStock && (
            <span className="text-xs font-medium text-amber-600">
              ¡Últimas {product.stock}!
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
