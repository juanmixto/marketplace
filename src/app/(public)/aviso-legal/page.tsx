import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Aviso Legal',
  description: 'Aviso legal y condiciones de uso de Mercado Productor.',
  robots: { index: false, follow: true },
}

export default function AvisoLegalPage() {
  return (
    <div className="min-h-screen bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground mb-4">Aviso Legal</h1>
        <p className="text-foreground-soft text-sm mb-8">
          Última actualización: {new Date().toLocaleDateString('es-ES')}
        </p>

        <div className="prose prose-sm max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Identificación del titular</h2>
            <p className="text-foreground-soft">
              En cumplimiento de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y del Comercio Electrónico (LSSICE), se informa que el titular de este sitio web es <strong>Mercado Productor</strong>.
            </p>
            <div className="bg-surface-raised p-4 rounded-lg mt-4">
              <p className="text-foreground-soft text-sm">Email de contacto: legal@marketplace.local</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. Objeto y ámbito de aplicación</h2>
            <p className="text-foreground-soft">
              El presente aviso legal regula el acceso y uso del sitio web, así como las condiciones aplicables a los usuarios que accedan a él. El acceso al sitio web atribuye la condición de usuario e implica la aceptación plena y sin reservas de las presentes condiciones.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. Propiedad intelectual e industrial</h2>
            <p className="text-foreground-soft">
              Los contenidos del sitio web (textos, imágenes, logotipos, marcas, nombres comerciales, etc.) son propiedad de Mercado Productor o de sus licenciantes y están protegidos por las leyes de propiedad intelectual e industrial vigentes. Queda prohibida su reproducción total o parcial sin autorización expresa.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Responsabilidad</h2>
            <p className="text-foreground-soft">
              Mercado Productor no se responsabiliza de los daños y perjuicios derivados del uso incorrecto del sitio web, de la imposibilidad de acceso, ni de eventuales errores en los contenidos publicados. Los contenidos generados por vendedores son responsabilidad de estos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">5. Legislación aplicable y jurisdicción</h2>
            <p className="text-foreground-soft">
              Las relaciones entre Mercado Productor y el usuario se regirán por la legislación española vigente. Para la resolución de cualquier controversia serán competentes los Juzgados y Tribunales del domicilio del usuario consumidor, de conformidad con la normativa aplicable de consumidores.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
