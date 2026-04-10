import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRightIcon, ShoppingBagIcon, TruckIcon, CheckCircleIcon, CreditCardIcon, SparklesIcon } from '@heroicons/react/24/outline'

export const metadata: Metadata = {
  title: 'Cómo Funciona | Mercado Productor',
  description: 'Descubre cómo funciona Mercado Productor, la plataforma de venta directa de productos locales.',
}

const steps = [
  {
    num: 1,
    icon: SparklesIcon,
    title: 'Descubre productores locales',
    description: 'Navega nuestro catálogo y encuentra productores de tu región. Ve sus ofertas, certificaciones y reseñas de otros clientes.',
  },
  {
    num: 2,
    icon: ShoppingBagIcon,
    title: 'Selecciona tus productos',
    description: 'Elige los productos que quieres, gestiona cantidades y añade a carrito. Sin intermediarios, directamente del productor.',
  },
  {
    num: 3,
    icon: CreditCardIcon,
    title: 'Paga de forma segura',
    description: 'Completa el pago de manera segura con tarjeta de crédito. Todos los pagos están protegidos por Stripe.',
  },
  {
    num: 4,
    icon: TruckIcon,
    title: 'Recibe tu pedido',
    description: 'El productor recibe tu pedido, prepara tus productos y los envía. Recibirás notificaciones en tiempo real.',
  },
  {
    num: 5,
    icon: CheckCircleIcon,
    title: 'Valora tu experiencia',
    description: 'Recibe tu pedido y deja una reseña. Tus comentarios ayudan a otros compradores y a los productores a mejorar.',
  },
]

export default function ComoFunciona() {
  return (
    <main className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 to-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-bold text-gray-900">
            Cómo funciona
          </h1>
          <p className="mb-8 text-xl text-gray-600">
            Conectamos productores locales con consumidores que valoran la calidad y la proximidad. Sin intermediarios, sin sorpresas.
          </p>
        </div>
      </section>

      {/* Pasos */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="space-y-12">
            {steps.map((step, idx) => {
              const Icon = step.icon
              const isLast = idx === steps.length - 1

              return (
                <div key={step.num}>
                  <div className="flex gap-6">
                    {/* Número */}
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-2xl font-bold text-white">
                      {step.num}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 pt-1">
                      <div className="flex items-start gap-3 mb-2">
                        <Icon className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-1" />
                        <h3 className="text-2xl font-bold text-gray-900">{step.title}</h3>
                      </div>
                      <p className="text-lg text-gray-600">{step.description}</p>
                    </div>
                  </div>

                  {/* Flecha */}
                  {!isLast && (
                    <div className="ml-8 mt-6 flex justify-center">
                      <ArrowRightIcon className="h-6 w-6 text-emerald-200 rotate-90" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Ventajas */}
      <section className="bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
            Ventajas de comprar con nosotros
          </h2>

          <div className="grid gap-8 md:grid-cols-2">
            {[
              {
                icon: '🌱',
                title: 'Sostenibilidad',
                description: 'Reduce la huella de carbono comprando localmente. Sin largos transportes, productos frescos.',
              },
              {
                icon: '💰',
                title: 'Mejores precios',
                description: 'Sin intermediarios, el dinero va directo al productor. Tú ahorras, ellos ganan más.',
              },
              {
                icon: '✅',
                title: 'Calidad garantizada',
                description: 'Conoce quién produce tus alimentos. Transparencia total desde origen hasta tu mesa.',
              },
              {
                icon: '⭐',
                title: 'Reseñas reales',
                description: 'Lee experiencias de otros clientes. Decisiones informadas basadas en opiniones verificadas.',
              },
              {
                icon: '🚚',
                title: 'Entrega rápida',
                description: 'Recibe tus productos frescos en días, no en semanas. Seguimiento en tiempo real.',
              },
              {
                icon: '🤝',
                title: 'Apoyo local',
                description: 'Contribuye al desarrollo de tu comunidad. Cada compra impulsa productores locales.',
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-emerald-100 bg-white p-6"
              >
                <p className="mb-3 text-4xl">{item.icon}</p>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  {item.title}
                </h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-6 text-4xl font-bold text-gray-900">
            ¿Listo para empezar?
          </h2>
          <p className="mb-8 text-xl text-gray-600">
            Explora nuestro catálogo y descubre productores locales de calidad
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/productos"
              className="inline-block rounded-lg bg-emerald-600 px-8 py-4 font-semibold text-white hover:bg-emerald-700"
            >
              Ver productos
            </Link>
            <Link
              href="/productores"
              className="inline-block rounded-lg border-2 border-emerald-600 px-8 py-4 font-semibold text-emerald-600 hover:bg-emerald-50"
            >
              Ver productores
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
