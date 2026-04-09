import Link from 'next/link'
import Image from 'next/image'
import { getHomeSnapshot } from '@/domains/catalog/queries'
import { buildHomeStats } from '@/domains/catalog/home'
import { ProductCard } from '@/components/catalog/ProductCard'
import type { ProductWithVendor } from '@/domains/catalog/types'
import { publicPortalLinks } from '@/lib/portals'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import { CheckBadgeIcon, TruckIcon, ShieldCheckIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { getPublicMarketplaceConfig } from '@/lib/config'

export const revalidate = 60

export default async function HomePage() {
  const { featured, categories, vendors, stats } = await getHomeSnapshot()
  const heroStats = buildHomeStats(stats)
  const publicConfig = await getPublicMarketplaceConfig()

  return (
    <div>
      {/* Banners */}
      {publicConfig.MAINTENANCE_MODE && (
        <div className="border-b border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/50">
          <div className="mx-auto max-w-7xl px-4 py-3 text-sm font-medium text-rose-800 dark:text-rose-300 sm:px-6 lg:px-8">
            Estamos realizando tareas de mantenimiento. Algunas funciones pueden tardar más de lo habitual.
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
                Del campo a tu mesa · Sin intermediarios
              </div>

              <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Compra directo<br />
                <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
                  al productor
                </span>
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-emerald-100/80">
                Un marketplace de proximidad para descubrir alimentos frescos, productores verificados y compra directa.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/productos"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-emerald-950 shadow-md transition-all hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
                >
                  Explorar productos
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <Link
                  href="/productores"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
                >
                  Conocer productores
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
            {[
              { icon: TruckIcon,        text: 'Envío a toda la península' },
              { icon: ShieldCheckIcon,  text: 'Pago seguro garantizado' },
              { icon: CheckBadgeIcon,   text: 'Productores verificados' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 text-sm text-[var(--foreground-soft)]">
                <Icon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick access ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-emerald-50/40 to-teal-50/30 p-6 shadow-sm dark:from-[var(--surface)] dark:via-emerald-950/20 dark:to-teal-950/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Accesos rápidos</p>
              <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">Entra según tu perfil</h2>
            </div>
            <Link href="/login" className="rounded-md text-sm font-medium text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
              Ver credenciales demo →
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {publicPortalLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                <p className="font-semibold text-[var(--foreground)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{link.label}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{link.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Categories ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Catálogo</p>
            <h2 className="text-2xl font-bold text-[var(--foreground)]">Explorar por categoría</h2>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-8">
          {categories.map(cat => (
            <Link
              key={cat.slug}
              href={`/productos?categoria=${cat.slug}`}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              <span className="text-2xl">{cat.icon ?? '🌿'}</span>
              <span className="text-[11px] font-medium leading-tight text-[var(--foreground-soft)] group-hover:text-emerald-700 dark:group-hover:text-emerald-300">{cat.name}</span>
              {cat._count.products > 0 && (
                <span className="text-[10px] text-[var(--muted)]">{cat._count.products}</span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Featured products ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Selección</p>
            <h2 className="text-2xl font-bold text-[var(--foreground)]">Productos destacados</h2>
          </div>
          <Link href="/productos" className="rounded-md text-sm font-medium text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            Ver todos <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
        {featured.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map(p => (
              <ProductCard key={p.id} product={p as ProductWithVendor} />
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-[var(--muted)]">Próximamente...</p>
        )}
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">El proceso</p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--foreground)]">Cómo funciona</h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-4">
            {[
              { step: '01', title: 'Explora', desc: 'Navega por categorías o busca directamente lo que necesitas.' },
              { step: '02', title: 'Elige',   desc: 'Añade al carrito productos de uno o varios productores.' },
              { step: '03', title: 'Paga',    desc: 'Checkout seguro con tarjeta. Pago único, reparto automático.' },
              { step: '04', title: 'Recibe',  desc: 'Cada productor envía su parte. Recibes todo en casa.' },
            ].map((s, i) => (
              <div key={s.step} className="relative">
                {i < 3 && (
                  <div className="absolute left-6 top-6 hidden h-px w-full bg-gradient-to-r from-emerald-300/60 to-transparent dark:from-emerald-700/60 sm:block" />
                )}
                <div className="relative flex flex-col items-start">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-bold text-white shadow-md dark:bg-emerald-500 dark:text-gray-950">
                    {s.step}
                  </span>
                  <h3 className="mt-4 font-semibold text-[var(--foreground)]">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured vendors ─────────────────────────────────────────────── */}
      {vendors.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Origen</p>
              <h2 className="text-2xl font-bold text-[var(--foreground)]">Productores destacados</h2>
            </div>
            <Link href="/productores" className="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline underline-offset-4">
              Ver todos <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map(v => (
              <Link
                key={v.slug}
                href={`/productores/${v.slug}`}
                className="group flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-2xl">
                  🌾
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--foreground)] truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                    {v.displayName}
                  </p>
                  {v.location && (
                    <p className="flex items-center gap-1 text-xs text-[var(--muted)] mt-0.5">
                      <MapPinIcon className="h-3 w-3 shrink-0" /> {v.location}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {v.avgRating && (
                      <span className="flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <StarIcon className="h-3 w-3" /> {Number(v.avgRating).toFixed(1)}
                      </span>
                    )}
                    <span className="text-xs text-[var(--muted)]">{v._count.products} productos</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── CTA productor ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 to-teal-800 dark:from-gray-950 dark:to-emerald-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(52,211,153,0.15),transparent_50%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3">Para productores</p>
          <h2 className="text-3xl font-bold text-white sm:text-4xl">¿Eres productor?</h2>
          <p className="mt-4 text-lg text-emerald-100/80 max-w-xl mx-auto leading-relaxed">
            Vende directamente a consumidores. Sin intermediarios. Gestiona tu catálogo, pedidos y cobros desde un panel sencillo.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/register?rol=productor"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-semibold text-emerald-950 shadow-md transition-all hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900"
            >
              Empieza gratis
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
