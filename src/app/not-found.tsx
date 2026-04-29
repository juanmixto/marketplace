import Link from 'next/link'
import {
  ArrowRightIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

const quickLinks = [
  { href: '/productos', label: 'Seguir comprando', icon: ShoppingBagIcon },
  { href: '/productores', label: 'Descubrir productores', icon: SparklesIcon },
  { href: '/', label: 'Volver al inicio', icon: HomeIcon },
]

const suggestedSearches = [
  { href: '/buscar?q=pan', label: 'Pan y bollería' },
  { href: '/buscar?q=miel', label: 'Miel artesanal' },
  { href: '/buscar?q=queso', label: 'Quesos locales' },
  { href: '/buscar?q=verduras', label: 'Verduras frescas' },
]

export default function NotFound() {
  return (
    <div className="min-h-[70vh] bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_45%)]" />

              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Raíz Directa
                </div>

                <p className="mt-6 text-sm font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                  Error 404
                </p>
                <h1 className="mt-3 text-4xl font-bold tracking-tight text-[var(--foreground)] sm:text-5xl">
                  Uy, esta página se ha perdido por el mercado.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--foreground-soft)] sm:text-lg">
                  No hemos encontrado lo que buscabas, pero aún estás a tiempo de llevarte algo rico a casa.
                  Explora productos locales, descubre productores verificados y sigue comprando sin salirte del camino.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/productos"
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
                  >
                    <ShoppingBagIcon className="h-4 w-4" />
                    Seguir comprando
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                  >
                    <HomeIcon className="h-4 w-4" />
                    Volver al inicio
                  </Link>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {[
                    'Compra directa al productor',
                    'Productos de temporada',
                    'Pago seguro y envío sencillo',
                  ].map(item => (
                    <div
                      key={item}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-medium text-[var(--foreground-soft)]"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside className="border-t border-[var(--border)] bg-[var(--surface-raised)] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <div className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
                <p className="text-sm font-semibold text-[var(--foreground)]">¿Qué te apetece hoy?</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestedSearches.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground-soft)] transition hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-emerald-700 dark:hover:text-emerald-300"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
                <p className="text-sm font-semibold text-[var(--foreground)]">Atajos útiles</p>
                <div className="mt-3 space-y-2">
                  {quickLinks.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {label}
                      </span>
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] px-4 py-4">
                <div className="flex items-start gap-3">
                  <MagnifyingGlassIcon className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">Consejo rápido</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Usa el buscador superior para encontrar productos, productores o categorías en segundos.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
