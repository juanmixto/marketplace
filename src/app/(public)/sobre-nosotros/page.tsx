import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sobre Nosotros | Mercado Productor',
  description: 'Conoce la historia de Mercado Productor, la plataforma que conecta productores locales con consumidores conscientes.',
}

export default function SobreNosotros() {
  return (
    <main className="bg-surface">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-accent-soft to-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-bold text-foreground">
            Sobre Mercado Productor
          </h1>
          <p className="mb-8 text-xl text-foreground-soft">
            Una plataforma española dedicada a conectar productores agrícolas locales con consumidores que valoran la calidad, sostenibilidad y proximidad.
          </p>
        </div>
      </section>

      {/* Misión */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="mb-4 text-3xl font-bold text-foreground">
                Nuestra misión
              </h2>
              <p className="mb-4 text-lg text-foreground-soft">
                Eliminar intermediarios innecesarios entre productores y consumidores. Creemos que la venta directa beneficia a todos: los productores reciben mejores precios, los consumidores acceden a productos frescos y locales, y el medio ambiente se beneficia de menores transportes.
              </p>
              <p className="text-lg text-foreground-soft">
                Cada compra en Mercado Productor es un acto de apoyo a la agricultura local y la sostenibilidad.
              </p>
            </div>
            <div className="rounded-lg bg-surface-raised p-8">
              <p className="mb-6 text-5xl">🌍</p>
              <p className="text-foreground font-semibold">
                "Conectamos productores con consumidores, sin intermediarios."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Valores */}
      <section className="bg-surface-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">
            Nuestros valores
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: '🌱',
                title: 'Sostenibilidad',
                description: 'Apostamos por prácticas agrícolas responsables y reducción de la huella de carbono.',
              },
              {
                icon: '💪',
                title: 'Empoderamiento',
                description: 'Capacitamos a pequeños productores para llegar directamente a sus clientes.',
              },
              {
                icon: '🤝',
                title: 'Confianza',
                description: 'Transparencia total en precios, origen y calidad de los productos.',
              },
              {
                icon: '⚡',
                title: 'Eficiencia',
                description: 'Tecnología simple y accesible para facilitar la venta directa.',
              },
              {
                icon: '❤️',
                title: 'Calidad',
                description: 'Nos comprometemos con productos frescos y de excelente calidad.',
              },
              {
                icon: '🏠',
                title: 'Comunidad',
                description: 'Fortalecemos lazos entre vecinos y apoyamos la economía local.',
              },
            ].map((valor, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border bg-surface p-6 text-center"
              >
                <p className="mb-3 text-4xl">{valor.icon}</p>
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {valor.title}
                </h3>
                <p className="text-sm text-foreground-soft">{valor.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Historia */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-3xl font-bold text-foreground">
            Nuestra historia
          </h2>

          <div className="space-y-6 text-lg text-foreground-soft">
            <p>
              Mercado Productor nace con la convicción de que existe una mejor forma de comercializar productos locales. Observamos cómo los intermediarios se llevaban la mayor parte del margen, mientras productores y consumidores no estaban completamente satisfechos.
            </p>

            <p>
              Decidimos crear una plataforma simple, transparente y fácil de usar que permitiera a productores vender directamente a consumidores. Sin capas de intermediarios, sin complicaciones innecesarias, solo conexión real.
            </p>

            <p>
              Hoy, Mercado Productor conecta a más de 150 productores con miles de consumidores en España. Cada compra es un voto de confianza en la agricultura local y sostenible.
            </p>

            <p>
              Continuamos innovando para hacer las cosas más fáciles para productores y consumidores. Porque creemos que si simplificamos, todos ganamos.
            </p>
          </div>
        </div>
      </section>

      {/* Números */}
      <section className="bg-accent px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="grid gap-8 text-center md:grid-cols-3">
            <div>
              <p className="mb-2 text-4xl font-bold text-white">150+</p>
              <p className="text-accent-soft">Productores</p>
            </div>
            <div>
              <p className="mb-2 text-4xl font-bold text-white">10k+</p>
              <p className="text-accent-soft">Clientes activos</p>
            </div>
            <div>
              <p className="mb-2 text-4xl font-bold text-white">€2M+</p>
              <p className="text-accent-soft">Volumen anual</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-6 text-4xl font-bold text-foreground">
            Únete a nuestra comunidad
          </h2>
          <p className="mb-8 text-xl text-foreground-soft">
            Ya sea como comprador o productor, sé parte del movimiento hacia una alimentación más local y sostenible.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/productos"
              className="inline-block rounded-lg bg-accent px-8 py-4 font-semibold text-white hover:bg-accent-hover"
            >
              Descubre productos
            </Link>
            <Link
              href="/como-vender"
              className="inline-block rounded-lg border-2 border-accent px-8 py-4 font-semibold text-accent hover:bg-accent-soft"
            >
              Vende con nosotros
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
