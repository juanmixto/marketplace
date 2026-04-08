import Link from 'next/link'
import Image from 'next/image'
import { getFeaturedProducts, getCategories, getVendors } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import type { ProductWithVendor } from '@/domains/catalog/types'
import { publicPortalLinks } from '@/lib/portals'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import { CheckBadgeIcon, TruckIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'

export const revalidate = 60

export default async function HomePage() {
  const [featured, categories, vendors] = await Promise.all([
    getFeaturedProducts(8),
    getCategories(),
    getVendors(6),
  ])

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700/50 px-3 py-1 text-xs font-medium text-emerald-200 mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Del campo a tu mesa
              </span>
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                Compra directo<br />
                <span className="text-emerald-300">al productor</span>
              </h1>
              <p className="mt-4 text-lg text-emerald-100 leading-relaxed">
                Productos frescos, ecológicos y de proximidad. Sin intermediarios.
                Conoces quién cultiva lo que comes.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/productos"
                  className="rounded-xl bg-white px-6 py-3 font-semibold text-emerald-900 hover:bg-emerald-50 transition"
                >
                  Explorar productos
                </Link>
                <Link
                  href="/productores"
                  className="rounded-xl border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10 transition"
                >
                  Conocer productores
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-3 gap-4">
                {[
                  { value: '150+', label: 'Productores' },
                  { value: '2.400+', label: 'Productos' },
                  { value: '4.8★', label: 'Valoración media' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                    <p className="text-sm text-emerald-300">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden lg:grid grid-cols-2 gap-4">
              {[
                'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400',
                'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
                'https://images.unsplash.com/photo-1560493676-04071c5f467b?w=400',
                'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400',
              ].map((src, i) => (
                <div key={i} className={`relative overflow-hidden rounded-2xl ${i === 1 ? 'mt-6' : ''}`}>
                  <Image src={src} alt="" width={200} height={200} className="w-full object-cover aspect-square" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              { icon: TruckIcon, text: 'Envío a toda la península' },
              { icon: ShieldCheckIcon, text: 'Pago seguro garantizado' },
              { icon: CheckBadgeIcon, text: 'Productores verificados' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-sm text-gray-600">
                <Icon className="h-5 w-5 shrink-0 text-emerald-600" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-emerald-100 bg-gradient-to-r from-white via-emerald-50/70 to-lime-50/80 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Accesos rápidos</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">Entrar según tu perfil</h2>
              <p className="mt-1 text-sm text-gray-600">
                Si estás probando la plataforma, desde aquí puedes ir directo al área de cliente, productor o admin.
              </p>
            </div>
            <Link href="/login" className="text-sm font-medium text-emerald-700 hover:underline">
              Ver credenciales de demo →
            </Link>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {publicPortalLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-white/90 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <p className="font-semibold text-gray-900">{link.label}</p>
                <p className="mt-1 text-sm text-gray-600">{link.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900">Explorar por categoría</h2>
        <div className="mt-6 grid grid-cols-4 gap-3 sm:grid-cols-8">
          {categories.map(cat => (
            <Link
              key={cat.slug}
              href={`/productos?categoria=${cat.slug}`}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center hover:border-emerald-300 hover:shadow-sm transition"
            >
              <span className="text-3xl">{cat.icon ?? '🌿'}</span>
              <span className="text-xs font-medium text-gray-700 leading-tight">{cat.name}</span>
              {cat._count.products > 0 && (
                <span className="text-xs text-gray-400">{cat._count.products}</span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Productos destacados</h2>
          <Link href="/productos" className="text-sm font-medium text-emerald-600 hover:underline">
            Ver todos →
          </Link>
        </div>
        {featured.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map(p => (
              <ProductCard key={p.id} product={p as ProductWithVendor} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Próximamente...</p>
        )}
      </section>

      {/* How it works */}
      <section className="bg-gray-50 border-y border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold text-gray-900">Cómo funciona</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-4">
            {[
              { step: '01', title: 'Explora', desc: 'Navega por categorías o busca directamente lo que necesitas.' },
              { step: '02', title: 'Elige', desc: 'Añade al carrito productos de uno o varios productores.' },
              { step: '03', title: 'Paga', desc: 'Checkout seguro con tarjeta. Pago único, reparto automático.' },
              { step: '04', title: 'Recibe', desc: 'Cada productor envía su parte. Recibes todo en casa.' },
            ].map((s, i) => (
              <div key={s.step} className="relative">
                {i < 3 && (
                  <div className="absolute left-6 top-6 hidden h-0.5 w-full bg-gray-200 sm:block" />
                )}
                <div className="relative flex flex-col items-start">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                    {s.step}
                  </span>
                  <h3 className="mt-4 font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured vendors */}
      {vendors.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Productores destacados</h2>
            <Link href="/productores" className="text-sm font-medium text-emerald-600 hover:underline">
              Ver todos →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map(v => (
              <Link
                key={v.slug}
                href={`/productores/${v.slug}`}
                className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
                  🌾
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{v.displayName}</p>
                  {v.location && (
                    <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                      <MapPinIcon className="h-3 w-3" /> {v.location}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {v.avgRating && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600">
                        <StarIcon className="h-3 w-3" /> {Number(v.avgRating).toFixed(1)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{v._count.products} productos</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA productor */}
      <section className="bg-emerald-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold">¿Eres productor?</h2>
          <p className="mt-3 text-emerald-200 max-w-xl mx-auto">
            Vende directamente a consumidores. Sin intermediarios. Gestiona tu catálogo, pedidos y cobros desde un panel sencillo.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/register?rol=productor"
              className="rounded-xl bg-white px-6 py-3 font-semibold text-emerald-900 hover:bg-emerald-50 transition"
            >
              Empieza gratis
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
