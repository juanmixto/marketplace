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
  const searchPlaceholder = isEn
    ? 'Search for a product, producer, or category…'
    : 'Busca un producto, productor o categoría…'
  const searchLabel = isEn ? 'Search the marketplace' : 'Buscar en el mercado'
  const searchButton = isEn ? 'Search' : 'Buscar'

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
            <form
              action="/buscar"
              role="search"
              aria-label={searchLabel}
              className="mt-6 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/30"
            >
              <MagnifyingGlassIcon className="ml-2 h-5 w-5 shrink-0 text-[var(--muted)]" aria-hidden="true" />
              <input
                type="search"
                name="q"
                autoFocus
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              >
                {searchButton}
              </button>
            </form>
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
