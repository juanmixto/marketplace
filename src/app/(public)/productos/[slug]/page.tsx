import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getProductBySlug, getProducts } from '@/domains/catalog/queries'
import { Badge } from '@/components/ui/badge'
import { ProductPurchasePanel } from '@/components/catalog/ProductPurchasePanel'
import { StarRating } from '@/components/reviews/StarRating'
import type { ProductWithVendor } from '@/domains/catalog/types'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import { ProductCard } from '@/components/catalog/ProductCard'
import { getProductReviews } from '@/domains/reviews/actions'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return { title: 'Producto no encontrado' }
  return {
    title: product.name,
    description: product.description ?? undefined,
  }
}

const CERT_COLORS: Record<string, 'green' | 'blue' | 'purple' | 'amber'> = {
  'ECO-ES': 'green',
  'DOP': 'blue',
  'KM0': 'purple',
  'BIO': 'green',
  'IGP': 'amber',
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) notFound()

  const taxRate = Number(product.taxRate)

  const related = await getProducts({
    categorySlug: product.category?.slug,
    limit: 4,
  }).then(r => r.products.filter(p => p.id !== product.id).slice(0, 4))
  const reviewSummary = await getProductReviews(product.id)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--muted)]">
        <Link href="/" className="rounded-md hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">Inicio</Link>
        <span>/</span>
        <Link href="/productos" className="rounded-md hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">Productos</Link>
        {product.category && (
          <>
            <span>/</span>
            <Link href={`/productos?categoria=${product.category.slug}`} className="rounded-md hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
              {product.category.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-[var(--foreground)] truncate">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Gallery */}
        <div className="space-y-3">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm">
            {product.images?.[0] ? (
              <Image
                src={product.images[0]}
                alt={product.name}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-8xl">🌿</div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((img, i) => (
                <div key={i} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm">
                  <Image src={img} alt="" fill className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {/* Certs */}
          {product.certifications.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {product.certifications.map(cert => (
                <Badge key={cert} variant={CERT_COLORS[cert] ?? 'default'}>{cert}</Badge>
              ))}
            </div>
          )}

          <h1 className="text-3xl font-bold text-[var(--foreground)]">{product.name}</h1>

          {/* Vendor */}
          <Link
            href={`/productores/${product.vendor.slug}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md text-sm text-[var(--muted)] hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            {product.originRegion && (
              <>
                <MapPinIcon className="h-4 w-4" />
                <span>{product.originRegion}</span>
                <span>·</span>
              </>
            )}
            <span>{product.vendor.displayName}</span>
            {product.vendor.avgRating && (
              <>
                <span>·</span>
                <StarIcon className="h-3.5 w-3.5 text-amber-400" />
                <span>{Number(product.vendor.avgRating).toFixed(1)}</span>
              </>
            )}
          </Link>

          {/* Description */}
          {product.description && (
            <p className="mt-6 text-[var(--foreground-soft)] leading-relaxed">{product.description}</p>
          )}

          <ProductPurchasePanel
            productId={product.id}
            productName={product.name}
            slug={product.slug}
            image={product.images[0]}
            unit={product.unit}
            vendorId={product.vendorId}
            vendorName={product.vendor.displayName}
            basePrice={Number(product.basePrice)}
            compareAtPrice={product.compareAtPrice ? Number(product.compareAtPrice) : null}
            taxRate={taxRate}
            trackStock={product.trackStock}
            stock={product.stock}
            variants={product.variants.map(variant => ({
              id: variant.id,
              name: variant.name,
              priceModifier: Number(variant.priceModifier),
              stock: variant.stock,
              isActive: variant.isActive,
            }))}
          />

          {/* Vendor card */}
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-2xl">
                🌾
              </div>
              <div>
                <p className="font-semibold text-[var(--foreground)]">{product.vendor.displayName}</p>
                {product.vendor.location && (
                  <p className="text-sm text-[var(--muted)]">{product.vendor.location}</p>
                )}
                {product.vendor.description && (
                  <p className="mt-1 text-sm text-[var(--foreground-soft)] line-clamp-2">{product.vendor.description}</p>
                )}
                <Link
                  href={`/productores/${product.vendor.slug}`}
                  className="mt-2 inline-block rounded-md text-sm font-medium text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                >
                  Ver todos sus productos →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="mt-16 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--foreground)]">Reseñas del producto</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Opiniones verificadas de compradores que ya recibieron este producto.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/30">
            <div className="flex items-center gap-3">
              <StarRating rating={reviewSummary.averageRating ?? 0} />
              <div>
                <p className="text-lg font-bold text-[var(--foreground)]">
                  {reviewSummary.averageRating ? reviewSummary.averageRating.toFixed(1) : 'Sin nota'}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {reviewSummary.totalReviews} reseña{reviewSummary.totalReviews === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {reviewSummary.reviews.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">
            Aún no hay reseñas para este producto.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {reviewSummary.reviews.map(review => (
              <article key={review.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-[var(--foreground)]">
                        {review.customer.firstName} {review.customer.lastName.slice(0, 1)}.
                      </p>
                      <StarRating rating={review.rating} size="sm" />
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted-light)]">
                      {new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(review.createdAt)}
                    </p>
                  </div>
                </div>
                {review.body && (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-soft)]">{review.body}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">Productos relacionados</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map(p => (
              <ProductCard key={p.id} product={p as ProductWithVendor} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
