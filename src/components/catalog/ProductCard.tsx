import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import type { BadgeVariant, ProductWithVendor } from '@/domains/catalog/types'
import { MapPinIcon } from '@heroicons/react/24/outline'

const CERT_COLORS: Record<string, BadgeVariant> = {
  'ECO-ES': 'green',
  'DOP':    'blue',
  'KM0':    'purple',
  'BIO':    'green',
  'IGP':    'amber',
}

interface ProductCardProps {
  product: ProductWithVendor
}

export function ProductCard({ product }: ProductCardProps) {
  const price      = Number(product.basePrice)
  const compareAt  = product.compareAtPrice ? Number(product.compareAtPrice) : null
  const hasDiscount = compareAt !== null && compareAt > price
  const discount    = hasDiscount ? Math.round(((compareAt! - price) / compareAt!) * 100) : 0
  const isLowStock  = product.trackStock && product.stock > 0 && product.stock <= 5
  const isOutOfStock = product.trackStock && product.stock === 0

  return (
    <Link
      href={`/productos/${product.slug}`}
      className={[
        'group flex flex-col overflow-hidden rounded-2xl',
        'border border-[var(--border)] bg-[var(--surface)]',
        'shadow-sm hover:shadow-md hover:-translate-y-1',
        'transition-all duration-200',
      ].join(' ')}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-[var(--surface-raised)]">
        {product.images?.[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl opacity-30">🌿</div>
        )}

        {hasDiscount && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            -{discount}%
          </span>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[1px]">
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-gray-700 shadow">
              Sin stock
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        {product.certifications.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {product.certifications.slice(0, 2).map(cert => (
              <Badge key={cert} variant={CERT_COLORS[cert] ?? 'default'} className="text-[10px] px-1.5 py-0">
                {cert}
              </Badge>
            ))}
          </div>
        )}

        <p className="line-clamp-2 text-sm font-semibold text-[var(--foreground)] leading-snug">
          {product.name}
        </p>

        {product.vendor && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-[var(--muted)]">
            {product.originRegion && (
              <>
                <MapPinIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{product.originRegion}</span>
                <span className="text-[var(--muted-light)]">·</span>
              </>
            )}
            <span className="truncate">{product.vendor.displayName}</span>
          </div>
        )}

        <div className="mt-auto pt-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-base font-bold text-[var(--foreground)]">{formatPrice(price)}</span>
              <span className="text-xs text-[var(--muted)]">/ {product.unit}</span>
            </div>
            {hasDiscount && (
              <span className="text-xs text-[var(--muted-light)] line-through">{formatPrice(compareAt!)}</span>
            )}
          </div>
          {isLowStock && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              ¡{product.stock} left!
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
