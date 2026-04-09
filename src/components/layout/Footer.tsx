import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'

const LINKS = {
  comprar: [
    { href: '/productos',           label: 'Todos los productos' },
    { href: '/productores',         label: 'Productores' },
    { href: '/productos?cert=ECO-ES', label: 'Ecológico' },
    { href: '/productos?cert=KM0',  label: 'Km0' },
  ],
  vender: [
    { href: '/register?rol=productor', label: 'Hazte productor' },
    { href: '/vendor/dashboard',       label: 'Portal productor' },
    { href: '#',                       label: 'Cómo funciona' },
    { href: '#',                       label: 'Comisiones' },
  ],
  ayuda: [
    { href: '#', label: 'Preguntas frecuentes' },
    { href: '#', label: 'Política de devoluciones' },
    { href: '#', label: 'Envíos' },
    { href: '#', label: 'Contacto' },
  ],
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{SITE_NAME}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Conectamos pequeños productores con consumidores que valoran la calidad y la proximidad.
            </p>
          </div>

          {/* Comprar */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Comprar</h3>
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
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Vender</h3>
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
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Ayuda</h3>
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
            © {new Date().getFullYear()} {SITE_NAME}. Todos los derechos reservados.
          </p>
          <div className="flex gap-4">
            {['Aviso legal', 'Privacidad', 'Cookies'].map(label => (
              <Link key={label} href="#" className="rounded-md text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
