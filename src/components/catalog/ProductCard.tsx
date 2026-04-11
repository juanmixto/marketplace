import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { formatPrice } from '@/lib/utils'
import { AddToCartButton } from '@/components/catalog/AddToCartButton'
import type { BadgeVariant, ProductWithVendor } from '@/domains/catalog/types'
import { MapPinIcon } from '@heroicons/react/24/outline'
import { CERTIFICATION_INFO } from '@/lib/certification-info'

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
    <article
      className={[
        'group flex h-full flex-col overflow-hidden rounded-2xl',
        'border border-[var(--border)] bg-[var(--surface)]',
        'shadow-sm hover:border-[var(--border-strong)] hover:shadow-md hover:-translate-y-1',
        'transition-all duration-200',
      ].join(' ')}
    >
      <Link
        href={`/productos/${product.slug}`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
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
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
              <span className="rounded-full border border-white/20 bg-white/95 px-3 py-1 text-xs font-semibold text-gray-700 shadow dark:border-white/10 dark:bg-black/80 dark:text-gray-200">
                Sin stock
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col p-4">
          {product.certifications.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {product.certifications.slice(0, 3).map(cert => (
                <Tooltip
                  key={cert}
                  content={CERTIFICATION_INFO[cert as keyof typeof CERTIFICATION_INFO]?.description || cert}
                  side="top"
                >
                  <Badge
                    variant={CERT_COLORS[cert] ?? 'default'}
                    className="text-[11px] px-2 py-0.5 font-semibold cursor-pointer transition-all hover:shadow-md hover:scale-105"
                  >
                    {cert}
                  </Badge>
                </Tooltip>
              ))}
              {product.certifications.length > 3 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                  +{product.certifications.length - 3}
                </span>
              )}
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
                Quedan {product.stock} uds.
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/productos/${product.slug}`}
            className="hidden h-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] sm:inline-flex"
          >
            Ver detalle
          </Link>
          <AddToCartButton
            productId={product.id}
            productName={product.name}
            disabled={isOutOfStock}
            disabledLabel="Sin stock"
            price={price}
            slug={product.slug}
            image={product.images?.[0]}
            unit={product.unit}
            vendorId={product.vendorId}
            vendorName={product.vendor?.displayName ?? ''}
            compact
            size="md"
            className="flex-1 shadow-sm"
          />
        </div>
      </div>
    </article>
  )
}
