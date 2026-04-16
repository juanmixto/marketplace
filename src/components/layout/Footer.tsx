'use client'

import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n'

export function Footer() {
  const t = useT()

  const links = {
    comprar: [
      { href: '/productos',             labelKey: 'allProducts' },
      { href: '/productores',           labelKey: 'producers' },
      { href: '/productos?cert=ECO-ES', labelKey: 'organic' },
      { href: '/productos?cert=KM0',    labelKey: 'km0' },
    ],
    vender: [
      { href: '/register?rol=productor', labelKey: 'becomeProducer' },
      { href: '/vendor/dashboard',       labelKey: 'producerPortal' },
      { href: '/como-funciona',          labelKey: 'howItWorks' },
      { href: '/como-vender',            labelKey: 'whyWithUs' },
    ],
    ayuda: [
      { href: '/faq',            labelKey: 'faq' },
      { href: '/contacto',       labelKey: 'contact' },
      { href: '/sobre-nosotros', labelKey: 'aboutUs' },
      { href: '/contacto',       labelKey: 'support' },
    ],
  } as const satisfies Record<string, { href: string; labelKey: TranslationKeys }[]>

  return (
    <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{SITE_NAME}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {t('tagline')}
            </p>
          </div>

          {/* Comprar */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('buy')}</h3>
            <ul className="mt-3 space-y-2">
              {links.comprar.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 py-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                    {t(l.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Vender */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('sell')}</h3>
            <ul className="mt-3 space-y-2">
              {links.vender.map(l => (
                <li key={l.labelKey}>
                  <Link href={l.href} className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 py-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                    {t(l.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Ayuda */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('help')}</h3>
            <ul className="mt-3 space-y-2">
              {links.ayuda.map(l => (
                <li key={l.labelKey}>
                  <Link href={l.href} className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 py-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                    {t(l.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--muted)]">
            © {new Date().getFullYear()} {SITE_NAME}. {t('allRights')}
          </p>
          <div className="-mx-2 flex flex-wrap gap-x-2 gap-y-1">
            {[
              { labelKey: 'legal'   as TranslationKeys,  href: '/aviso-legal' },
              { labelKey: 'privacy' as TranslationKeys, href: '/privacidad' },
              { labelKey: 'cookies' as TranslationKeys, href: '/cookies' },
              { labelKey: 'terms'   as TranslationKeys, href: '/terminos' },
            ].map(link => (
              <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center rounded-md px-2 py-2 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                {t(link.labelKey)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
