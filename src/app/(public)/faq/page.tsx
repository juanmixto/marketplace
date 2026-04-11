import type { Metadata } from 'next'
import Link from 'next/link'
import { buildPageMetadata } from '@/lib/seo'
import { DEFAULT_COMMISSION_RATE } from '@/lib/constants'
import { BRAND_CLAIMS } from '@/lib/brand-claims'

export const metadata: Metadata = buildPageMetadata({
  title: 'Preguntas frecuentes',
  description: 'Resuelve tus dudas sobre cómo funciona Mercado Productor, pagos, entregas y más.',
  path: '/faq',
})

const faqs = [
  {
    category: 'Compras',
    questions: [
      {
        q: '¿Cómo puedo comprar en Mercado Productor?',
        a: 'Es sencillo: crea una cuenta, navega nuestro catálogo, selecciona productos, añade al carrito y completa el pago. Recibirás tu pedido en pocos días.',
      },
      {
        q: '¿Necesito crear una cuenta?',
        a: 'Sí, necesitas una cuenta para realizar compras y seguimiento de pedidos. Es rápido y gratuito. Puedes crear una aquí.',
      },
      {
        q: '¿Puedo cambiar mi pedido después de realizar la compra?',
        a: 'Depende del estado del pedido. Si aún no ha sido preparado, contacta a nuestro equipo de soporte. Una vez enviado, no es posible modificarlo.',
      },
      {
        q: '¿Qué métodos de pago aceptan?',
        a: 'Aceptamos tarjetas de crédito y débito (Visa, Mastercard, American Express) a través de Stripe. Los pagos son seguros y encriptados.',
      },
    ],
  },
  {
    category: 'Entregas',
    questions: [
      {
        q: '¿Cuál es el tiempo de entrega?',
        a: 'Los tiempos varían según el productor y la ubicación. La mayoría de entregas ocurren entre 2-5 días laborables. Recibirás actualizaciones en tiempo real.',
      },
      {
        q: '¿A qué zonas entregan?',
        a: 'La cobertura depende de cada productor. Comprueba la disponibilidad en el carrito antes de finalizar la compra.',
      },
      {
        q: '¿Hay costes de envío?',
        a: 'Cada productor define sus costes de envío. Los verás claramente antes de finalizar la compra. Algunos ofrecen envío gratis a partir de cierta cantidad.',
      },
      {
        q: '¿Qué pasa si mi pedido llega dañado?',
        a: `Contacta a nuestro equipo de soporte dentro del plazo indicado en la página de contacto. Gestionaremos un reembolso o reenvío.`,
      },
    ],
  },
  {
    category: 'Devoluciones y Reembolsos',
    questions: [
      {
        q: '¿Puedo devolver un producto?',
        a: 'Los productos agrícolas frescos no se devuelven una vez entregados por cuestiones de higiene. Si el producto llega dañado o defectuoso, gestionaremos un reembolso completo.',
      },
      {
        q: '¿Cuál es la política de reembolsos?',
        a: 'Si hay un problema con tu pedido (no coincide con la descripción, está dañado), contacta dentro del plazo indicado en la página de contacto. Procesaremos un reembolso o reenvío.',
      },
      {
        q: '¿Cuánto tiempo tarda el reembolso?',
        a: 'Los reembolsos se procesan en 5-10 días laborables después de la aprobación. Tu banco tardará 2-3 días en reflejar el dinero.',
      },
    ],
  },
  {
    category: 'Cuenta y Seguridad',
    questions: [
      {
        q: '¿Mi información está segura?',
        a: 'Sí. Utilizamos encriptación SSL y todas las transacciones pasan por Stripe, que cumple con estándares de seguridad internacionales (PCI DSS).',
      },
      {
        q: '¿Olvidé mi contraseña. Cómo la recupero?',
        a: 'Ve a la página de login y haz clic en "¿Olvidaste tu contraseña?". Recibirás un email con instrucciones para establecer una nueva.',
      },
      {
        q: '¿Cómo elimino mi cuenta?',
        a: 'Puedes solicitar la eliminación de tu cuenta en cualquier momento. Contacta a nuestro equipo de soporte para más detalles sobre la política de eliminación de datos.',
      },
    ],
  },
  {
    category: 'Productores',
    questions: [
      {
        q: '¿Cuales son los requisitos para vender?',
        a: 'Ser productor/agricultor registrado en España, tener cuenta bancaria española (IBAN), productos alimentarios con origen verificable y cumplimiento de normativa sanitaria.',
      },
      {
        q: '¿Cuál es la comisión?',
        a: `La comisión base es del ${Math.round(DEFAULT_COMMISSION_RATE * 100)}% sobre el precio de venta. Sin costes ocultos ni cuotas mensuales.`,
      },
      {
        q: '¿Cuándo recibo mis pagos?',
        a: 'Recibirás liquidaciones semanales según el calendario operativo publicado en la plataforma.',
      },
      {
        q: '¿Cómo empiezo a vender?',
        a: `Regístrate en nuestro portal de productores, completa la ${BRAND_CLAIMS.verificationProcess.text.toLowerCase()}, vincula tu cuenta bancaria y comienza a subir productos.`,
      },
    ],
  },
  {
    category: 'General',
    questions: [
      {
        q: '¿Cómo contacto con soporte?',
        a: 'Puedes contactarnos a través del formulario de contacto en nuestra web o en las direcciones publicadas en la página de contacto. Respondemos en horario laboral.',
      },
      {
        q: '¿Ofrecen experiencias o talleres?',
        a: 'De momento no ofrecemos talleres, pero es algo que nos gustaría explorar en el futuro. Mantente atento a nuestras novedades.',
      },
    ],
  },
]

export default function FAQ() {
  return (
    <main className="bg-surface">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-accent-soft to-surface px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-bold text-foreground">
            Preguntas frecuentes
          </h1>
          <p className="mb-8 text-xl text-foreground-soft">
            Encuentra respuestas a las preguntas más comunes sobre Mercado Productor.
          </p>
        </div>
      </section>

      {/* FAQs */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="space-y-12">
            {faqs.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                <h2 className="mb-6 text-2xl font-bold text-foreground">
                  {section.category}
                </h2>

                <div className="space-y-4">
                  {section.questions.map((faq, qIdx) => (
                    <details
                      key={qIdx}
                      className="group rounded-lg border border-border bg-surface p-6 hover:shadow-md transition-shadow"
                    >
                      <summary className="flex cursor-pointer items-center justify-between font-semibold text-foreground hover:text-accent">
                        <span>{faq.q}</span>
                        <span className="text-accent transition-transform group-open:rotate-180">
                          ▼
                        </span>
                      </summary>
                      <p className="mt-4 text-foreground-soft">{faq.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Still have questions */}
      <section className="bg-accent-soft px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground">
            ¿Aún tienes preguntas?
          </h2>
          <p className="mb-6 text-lg text-foreground-soft">
            Nuestro equipo de soporte está aquí para ayudarte
          </p>
          <Link
            href="/contacto"
            className="inline-block rounded-lg bg-accent px-8 py-4 font-semibold text-white hover:bg-accent-hover"
          >
            Contacta con nosotros
          </Link>
        </div>
      </section>
    </main>
  )
}
