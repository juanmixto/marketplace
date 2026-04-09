import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <p className="text-lg font-bold text-emerald-600">{SITE_NAME}</p>
            <p className="mt-2 text-sm text-gray-500">
              Conectamos pequeños productores con consumidores que valoran la calidad y la proximidad.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Comprar</h3>
            <ul className="mt-3 space-y-2">
              {[
                { href: '/productos', label: 'Todos los productos' },
                { href: '/productores', label: 'Productores' },
                { href: '/productos?cert=ECO-ES', label: 'Ecológico' },
                { href: '/productos?cert=KM0', label: 'Km0' },
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-gray-500 hover:text-gray-900">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Vender</h3>
            <ul className="mt-3 space-y-2">
              {[
                { href: '/register?rol=productor', label: 'Hazte productor' },
                { href: '/vendor/dashboard', label: 'Portal productor' },
                { href: '#', label: 'Cómo funciona' },
                { href: '#', label: 'Comisiones' },
              ].map(l => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-gray-500 hover:text-gray-900">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Ayuda</h3>
            <ul className="mt-3 space-y-2">
              {[
                { href: '#', label: 'Preguntas frecuentes' },
                { href: '#', label: 'Política de devoluciones' },
                { href: '#', label: 'Envíos' },
                { href: '#', label: 'Contacto' },
              ].map(l => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-gray-500 hover:text-gray-900">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-100 pt-6 flex flex-col sm:flex-row justify-between gap-3">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} {SITE_NAME}. Todos los derechos reservados.</p>
          <div className="flex gap-4">
            <Link href="#" className="text-xs text-gray-400 hover:text-gray-600">Aviso legal</Link>
            <Link href="#" className="text-xs text-gray-400 hover:text-gray-600">Privacidad</Link>
            <Link href="#" className="text-xs text-gray-400 hover:text-gray-600">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
