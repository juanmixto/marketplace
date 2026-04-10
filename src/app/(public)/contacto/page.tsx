import { Metadata } from 'next'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'Contacto | Mercado Productor',
  description: 'Ponte en contacto con el equipo de Mercado Productor. Estamos aquí para ayudarte.',
}

export default function Contacto() {
  return (
    <main className="min-h-screen bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-foreground">Contacto</h1>
          <p className="text-lg text-foreground-soft">
            ¿Tienes dudas o necesitas ayuda? Nos encantaría saber de ti.
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          {/* Información de contacto */}
          <div className="space-y-8">
            <div>
              <h2 className="mb-6 text-2xl font-bold text-foreground">Información de contacto</h2>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground">Soporte general</h3>
                  <p className="mt-1 text-foreground-soft">
                    <a href="mailto:hola@mercadoproductor.es" className="text-accent hover:underline">
                      hola@mercadoproductor.es
                    </a>
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">Soporte con pedidos</h3>
                  <p className="mt-1 text-foreground-soft">
                    <a href="mailto:soporte@mercadoproductor.es" className="text-accent hover:underline">
                      soporte@mercadoproductor.es
                    </a>
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">Para productores</h3>
                  <p className="mt-1 text-foreground-soft">
                    <a href="mailto:productores@mercadoproductor.es" className="text-accent hover:underline">
                      productores@mercadoproductor.es
                    </a>
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">Asuntos legales</h3>
                  <p className="mt-1 text-foreground-soft">
                    <a href="mailto:legal@mercadoproductor.es" className="text-accent hover:underline">
                      legal@mercadoproductor.es
                    </a>
                  </p>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold text-foreground">Horario de atención</h3>
                  <p className="mt-1 text-foreground-soft">Lunes a viernes, 9:00 - 18:00 (hora peninsular)</p>
                  <p className="mt-1 text-sm text-muted">Tiempo de respuesta: 24-48 horas laborables</p>
                </div>
              </div>
            </div>
          </div>

          {/* Formulario */}
          <div className="rounded-lg border border-border bg-surface-raised p-8">
            <h2 className="mb-6 text-2xl font-bold text-foreground">Envíanos un mensaje</h2>
            <ContactForm />
          </div>
        </div>
      </div>
    </main>
  )
}
