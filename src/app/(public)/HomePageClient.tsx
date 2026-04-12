'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ProductCard } from '@/components/catalog/ProductCard'
import type { ProductWithVendor, CategoryWithCount, VendorWithCount } from '@/domains/catalog/types'
import type { HomeStat } from '@/domains/catalog/home'
import type { PublicMarketplaceSettings } from '@/lib/marketplace-settings'
import { getPublicPortalLinks, translateCategoryLabel } from '@/lib/portals'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import { CheckBadgeIcon, TruckIcon, ShieldCheckIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { useLocale, useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n'
import { getVendorHeroImage, getVendorVisualLabel } from '@/lib/vendor-visuals'

interface HomePageClientProps {
  featured: ProductWithVendor[]
  categories: CategoryWithCount[]
  vendors: VendorWithCount[]
  heroStats: HomeStat[]
  publicConfig: Pick<PublicMarketplaceSettings, 'MAINTENANCE_MODE' | 'HERO_BANNER_TEXT'>
}

export function HomePageClient({ featured, categories, vendors, heroStats, publicConfig }: HomePageClientProps) {
  const { locale } = useLocale()
  const t = useT()
  const portalLinks = getPublicPortalLinks(locale)

  const STEPS: { step: string; titleKey: TranslationKeys; descKey: TranslationKeys }[] = [
    { step: '01', titleKey: 'steps.01.title', descKey: 'steps.01.desc' },
    { step: '02', titleKey: 'steps.02.title', descKey: 'steps.02.desc' },
    { step: '03', titleKey: 'steps.03.title', descKey: 'steps.03.desc' },
    { step: '04', titleKey: 'steps.04.title', descKey: 'steps.04.desc' },
  ]

  return (
    <div>
      {/* Banners */}
      {publicConfig.MAINTENANCE_MODE && (
        <div className="border-b border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/50">
          <div className="mx-auto max-w-7xl px-4 py-3 text-sm font-medium text-rose-800 dark:text-rose-300 sm:px-6 lg:px-8">
            {t('maintenanceBanner')}
          </div>
        </div>
      )}
      {publicConfig.HERO_BANNER_TEXT && (
        <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/50">
          <div className="mx-auto max-w-7xl px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-300 sm:px-6 lg:px-8">
            {publicConfig.HERO_BANNER_TEXT}
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 dark:from-gray-950 dark:via-emerald-950 dark:to-teal-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(52,211,153,0.15),transparent_60%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Text */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-700/50 bg-emerald-800/40 px-4 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur-sm mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {t('hero.badge')}
              </div>

              <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
                {t('hero.title1')}<br />
                <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
                  {t('hero.title2')}
                </span>
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-emerald-100/80">
                {t('hero.subtitle')}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/productos"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-emerald-950 shadow-md transition-all hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
                >
                  {t('hero.cta1')}
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <Link
                  href="/productores"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
                >
                  {t('hero.cta2')}
                </Link>
              </div>

              {/* Stats */}
              <div className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
                {heroStats.map(s => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                    <p className="mt-0.5 text-sm text-emerald-300/80">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Image grid */}
            <div className="hidden lg:grid grid-cols-2 gap-3">
              {[
                'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400',
                'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400',
                'https://images.unsplash.com/photo-1560493676-04071c5f467b?w=400',
                'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
              ].map((src, i) => (
                <div
                  key={i}
                  className={[
                    'relative overflow-hidden rounded-2xl shadow-xl ring-1 ring-white/10',
                    i === 1 ? 'mt-8' : '',
                    i === 3 ? '-mt-8' : '',
                  ].join(' ')}
                >
                  <Image
                    src={src}
                    alt=""
                    width={200}
                    height={200}
                    className="w-full object-cover aspect-square"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ────────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {([
              { icon: TruckIcon,        textKey: 'trust.shipping' },
              { icon: ShieldCheckIcon,  textKey: 'trust.payment' },
              { icon: CheckBadgeIcon,   textKey: 'trust.verified' },
            ] as { icon: typeof TruckIcon; textKey: TranslationKeys }[]).map(({ icon: Icon, textKey }) => (
              <div key={textKey} className="flex items-center gap-2.5 text-sm text-[var(--foreground-soft)]">
                <Icon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {t(textKey)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick access ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-emerald-50/35 to-teal-50/20 p-6 shadow-sm dark:from-[var(--surface)] dark:via-emerald-950/20 dark:to-teal-950/10 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{t('hero.quickAccess')}</p>
              <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">{t('quickAccessTitle')}</h2>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{t('quickAccessDesc')}</p>
            </div>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground-soft)] transition hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-emerald-700 dark:hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
              {t('hero.loginCta')}
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {portalLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--foreground)] transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{link.label}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{link.description}</p>
                  </div>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--muted)] transition-colors group-hover:border-emerald-200 group-hover:text-emerald-700 dark:group-hover:border-emerald-800 dark:group-hover:text-emerald-300">
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Categories ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{t('categories')}</p>
            <h2 className="text-2xl font-bold text-[var(--foreground)]">{t('sections.browseByCat')}</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
              {t('sections.browseByCatDesc')}
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {categories.map(cat => {
            const label = translateCategoryLabel(cat.slug, cat.name, locale)
            const countLabel = cat._count.products > 0 ? `${cat._count.products} ${t('productsUnit')}` : t('comingSoon')

            return (
              <Link
                key={cat.slug}
                href={`/productos?categoria=${cat.slug}`}
                aria-label={`${label} · ${countLabel}`}
                className="group rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-lg shadow-inner dark:border-emerald-900/40 dark:bg-emerald-950/30">
                      {cat.icon ?? '🌿'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight text-[var(--foreground)] transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                        {label}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{countLabel}</p>
                    </div>
                  </div>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--muted)] transition-colors group-hover:border-emerald-200 group-hover:text-emerald-700 dark:group-hover:border-emerald-800 dark:group-hover:text-emerald-300">
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── Featured products ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{t('sectionLabelSelection')}</p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--foreground)]">{t('sections.featured')}</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{t('sections.featuredDesc')}</p>
          </div>
          <Link href="/productos" className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--foreground-soft)] transition hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-emerald-700 dark:hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            {t('sections.seeAll')} <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
        {featured.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map(p => (
              <ProductCard key={p.id} product={p} locale={locale} />
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-[var(--muted)]">{t('comingSoon')}</p>
        )}
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{t('sectionLabelProcess')}</p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--foreground)]">{t('sections.howItWorks')}</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-4 sm:gap-8">
            {STEPS.map((s, i) => (
              <div key={s.step} className="relative">
                {i < 3 && (
                  <div className="absolute left-6 top-6 hidden h-px w-full bg-gradient-to-r from-emerald-300/60 to-transparent dark:from-emerald-700/60 sm:block" />
                )}
                <div className="relative flex flex-row items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 sm:flex-col sm:gap-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md dark:bg-emerald-500 dark:text-gray-950 sm:h-12 sm:w-12 sm:rounded-2xl">
                    {s.step}
                  </span>
                  <div className="min-w-0 flex-1 sm:mt-4">
                    <h3 className="font-semibold text-[var(--foreground)]">{t(s.titleKey)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{t(s.descKey)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured vendors ─────────────────────────────────────────────── */}
      {vendors.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{t('sectionLabelOrigin')}</p>
              <h2 className="mt-1 text-2xl font-bold text-[var(--foreground)]">{t('sections.featuredVendors')}</h2>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{t('sections.featuredVendorsDesc')}</p>
            </div>
            <Link href="/productores" className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--foreground-soft)] transition hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-emerald-700 dark:hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
              {t('sections.seeAllVendors')} <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vendors.map(v => {
              const heroImage = getVendorHeroImage(v)
              const visualLabel = getVendorVisualLabel(v)

              return (
                <Link
                  key={v.slug}
                  href={`/productores/${v.slug}`}
                  className="group rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                >
                  <div className="relative mb-4 aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-900">
                    <Image
                      src={heroImage}
                      alt={`Foto de ${v.displayName}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />

                    <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm">
                      {visualLabel}
                    </span>

                    <span className="absolute bottom-3 right-3 rounded-full bg-emerald-400/90 px-2.5 py-1 text-[11px] font-semibold text-slate-950 shadow-sm">
                      {v._count.products} {t('productsUnit')}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--foreground)] transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                          {v.displayName}
                        </p>
                        {v.location && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]">
                            <MapPinIcon className="h-3 w-3 shrink-0" /> {v.location}
                          </p>
                        )}
                      </div>
                      {v.avgRating && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                          <StarIcon className="h-3 w-3" /> {Number(v.avgRating).toFixed(1)}
                        </span>
                      )}
                    </div>

                    {v.description && (
                      <p className="mt-3 line-clamp-2 text-sm text-[var(--foreground-soft)]">{v.description}</p>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-[var(--muted)]">{v._count.products} {t('productsUnit')}</span>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 transition-colors group-hover:text-emerald-800 dark:text-emerald-300 dark:group-hover:text-emerald-200">
                        {t('sections.vendorCardCta')}
                        <ArrowRightIcon className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── CTA productor ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 to-teal-800 dark:from-gray-950 dark:to-emerald-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(52,211,153,0.15),transparent_50%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3">{t('sectionLabelForProducers')}</p>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{t('sections.ctaTitle')}</h2>
          <p className="mt-4 mx-auto max-w-xl text-base leading-relaxed text-emerald-100/80 sm:text-lg">
            {t('sections.ctaSubtitle')}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-4">
            <Link
              href="/register?rol=productor"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-emerald-950 shadow-md transition-all hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
            >
              {t('sections.ctaBtn')}
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
