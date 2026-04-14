import { TagIcon } from '@heroicons/react/24/outline'
import type { PublicPromotion } from '@/domains/promotions/public'
import { formatPrice } from '@/lib/utils'
import type { Locale } from '@/i18n/locales'

interface Props {
  promotions: PublicPromotion[]
  locale: Locale
}

export function ProductPromotions({ promotions, locale }: Props) {
  if (promotions.length === 0) return null

  return (
    <section
      aria-label={locale === 'en' ? 'Active offers' : 'Ofertas activas'}
      className="mt-5 space-y-2"
    >
      {promotions.map(promo => (
        <PromotionBanner key={promo.id} promo={promo} locale={locale} />
      ))}
    </section>
  )
}

function PromotionBanner({ promo, locale }: { promo: PublicPromotion; locale: Locale }) {
  const headline = formatHeadline(promo, locale)
  const scopeLabel = formatScopeLabel(promo.scope, locale)
  const validUntil = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', {
    dateStyle: 'medium',
  }).format(new Date(promo.endsAt))
  const minSubtotalLabel =
    promo.minSubtotal && promo.minSubtotal > 0
      ? locale === 'en'
        ? `Min. order ${formatPrice(promo.minSubtotal)}`
        : `Pedido mínimo ${formatPrice(promo.minSubtotal)}`
      : null
  const validLabel = locale === 'en' ? `Valid until ${validUntil}` : `Válido hasta ${validUntil}`

  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/30">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950">
        <TagIcon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">{headline}</p>
          <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
            {scopeLabel}
          </span>
          {promo.code && (
            <span className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-mono text-xs font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
              {promo.code}
            </span>
          )}
        </div>
        {promo.name && (
          <p className="mt-0.5 text-sm text-emerald-800/90 dark:text-emerald-300">{promo.name}</p>
        )}
        <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400">
          {validLabel}
          {minSubtotalLabel ? ` · ${minSubtotalLabel}` : ''}
        </p>
      </div>
    </div>
  )
}

function formatHeadline(promo: PublicPromotion, locale: Locale): string {
  if (promo.kind === 'FREE_SHIPPING') {
    return locale === 'en' ? 'Free shipping' : 'Envío gratis'
  }
  if (promo.kind === 'PERCENTAGE') {
    return `-${Number(promo.value).toFixed(0)}%`
  }
  return `-${formatPrice(Number(promo.value))}`
}

function formatScopeLabel(
  scope: PublicPromotion['scope'],
  locale: Locale,
): string {
  if (locale === 'en') {
    if (scope === 'PRODUCT') return 'This product'
    if (scope === 'CATEGORY') return 'Category'
    return 'Whole store'
  }
  if (scope === 'PRODUCT') return 'Este producto'
  if (scope === 'CATEGORY') return 'Categoría'
  return 'Toda la tienda'
}
