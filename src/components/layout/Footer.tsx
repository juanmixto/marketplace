'use client'

import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'
import { useT } from '@/i18n'

export function Footer() {
  const t = useT()

  const LINKS = {
    comprar: [
      { href: '/productos',             label: t('all_products') },
      { href: '/productores',           label: t('producers') },
      { href: '/productos?cert=ECO-ES', label: t('ecological') },
      { href: '/productos?cert=KM0',    label: t('km0') },
    ],
    vender: [
      { href: '/register?rol=productor', label: t('become_producer') },
      { href: '/vendor/dashboard',       label: t('producer_portal') },
      { href: '/como-funciona',          label: t('how_it_works') },
      { href: '/como-vender',            label: t('why_sell') },
    ],
    ayuda: [
      { href: '/faq',          label: t('faq') },
      { href: '/contacto',     label: t('contact') },
      { href: '/sobre-nosotros', label: t('about_us') },
      { href: '/contacto',     label: t('support') },
    ],
  }
  return (
    <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{SITE_NAME}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {t('footer_tagline')}
            </p>
          </div>

          {/* Comprar */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('footer_buy')}</h3>
            <ul className="mt-3 space-y-2">
              {LINKS.comprar.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="rounded-md text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Vender */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('footer_sell')}</h3>
            <ul className="mt-3 space-y-2">
              {LINKS.vender.map(l => (
                <li key={l.label}>
                  <Link href={l.href} className="rounded-md text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Ayuda */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('footer_help')}</h3>
            <ul className="mt-3 space-y-2">
              {LINKS.ayuda.map(l => (
                <li key={l.label}>
                  <Link href={l.href} className="rounded-md text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--muted)]">
            © {new Date().getFullYear()} {SITE_NAME}. {t('footer_rights')}
          </p>
          <div className="flex gap-4">
            {[
              { label: t('legal_notice'), href: '/aviso-legal' },
              { label: t('privacy'),      href: '/privacidad' },
              { label: t('cookies'),      href: '/cookies' },
              { label: t('terms'),        href: '/terminos' },
            ].map(link => (
              <Link key={link.label} href={link.href} className="rounded-md text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
