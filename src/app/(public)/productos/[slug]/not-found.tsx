import Link from 'next/link'
import { ArrowRightIcon, ShoppingBagIcon, HomeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { getProducts } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import type { ProductWithVendor } from '@/domains/catalog/types'
import { getCatalogCopy } from '@/i18n/catalog-copy'
import { getServerLocale } from '@/i18n/server'

export default async function ProductNotFound() {
  const locale = await getServerLocale()
  const copy = getCatalogCopy(locale)

  const { products } = await getProducts({ limit: 4 })

  const isEn = locale === 'en'
  const title = isEn
    ? 'This product is no longer available'
    : 'Este producto ya no está disponible'
  const description = isEn
    ? 'It might have been sold out, taken down by its producer, or the link you followed is out of date. Here are some other fresh picks you can take home today.'
    : 'Puede que se haya agotado, que el productor lo haya retirado o que el enlace esté desactualizado. Te dejamos algunas alternativas frescas que sí están disponibles hoy.'
  const ctaCatalog = isEn ? 'Browse the catalog' : 'Ver el catálogo'
  const ctaHome = isEn ? 'Back to home' : 'Volver al inicio'
  const suggestionsTitle = isEn ? 'You might like' : 'Quizá te interesen'
  const searchHint = isEn
    ? 'Use the search bar above to find a specific producer, category, or product in seconds.'
    : 'Usa el buscador superior para encontrar un productor, categoría o producto en segundos.'

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_45%)]" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
              {isEn ? 'Product unavailable' : 'Producto no disponible'}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--foreground-soft)]">
              {description}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/productos"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
              >
                <ShoppingBagIcon className="h-4 w-4" />
                {ctaCatalog}
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
              >
                <HomeIcon className="h-4 w-4" />
                {ctaHome}
              </Link>
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] px-4 py-3">
              <MagnifyingGlassIcon className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm text-[var(--muted)]">{searchHint}</p>
            </div>
          </div>
        </div>

        {products.length > 0 && (
          <div className="border-t border-[var(--border)] bg-[var(--surface-raised)] p-6 sm:p-8 lg:p-10">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{suggestionsTitle}</h2>
              <Link
                href="/productos"
                className="text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                {copy.reviews.relatedProducts}
                <span aria-hidden="true"> →</span>
              </Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {products.map(p => (
                <ProductCard key={p.id} product={p as ProductWithVendor} locale={locale} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
