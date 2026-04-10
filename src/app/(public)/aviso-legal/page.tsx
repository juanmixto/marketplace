import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Aviso Legal | Mercado Productor',
  description: 'Información legal sobre Mercado Productor conforme a la LSSI-CE.',
}

export default function AvisoLegal() {
  return (
    <main className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-4xl font-bold text-gray-900">Aviso Legal</h1>

        <div className="prose prose-emerald max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">1. Titular del sitio web</h2>
            <p>
              <strong>Razón social:</strong> Mercado Productor S.L.
            </p>
            <p>
              <strong>NIF:</strong> B-12345678
            </p>
            <p>
              <strong>Domicilio social:</strong> Calle Ejemplo, 1 - 28001 Madrid, España
            </p>
            <p>
              <strong>Correo electrónico:</strong> legal@mercadoproductor.es
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">2. Objeto y actividad</h2>
            <p>
              Mercado Productor es un marketplace online que facilita la compra y venta directa de
              productos agrícolas y alimentarios entre productores locales certificados y
              consumidores finales en España, sin intermediarios.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">3. Condiciones de acceso y uso</h2>
            <p>El acceso a este sitio web está sujeto a las siguientes condiciones:</p>
            <ul className="space-y-2 pl-6">
              <li>• El Usuario se compromete a utilizar el sitio web de forma lícita y conforme a la ley.</li>
              <li>• Se prohíbe expresamente el acceso no autorizado a los sistemas informáticos.</li>
              <li>
                • No se permiten actividades ilícitas, fraudulentas o que violen derechos de terceros.
              </li>
              <li>• Mercado Productor se reserva el derecho a suspender acceso incumplidor.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">4. Propiedad intelectual</h2>
            <p>
              Todos los contenidos de este sitio web (textos, imágenes, logos, marcas registradas)
              son propiedad exclusiva de Mercado Productor S.L. o de terceros con autorización
              expresa.
            </p>
            <p>
              Queda expresamente prohibida la reproducción, distribución, modificación o explotación
              de los contenidos sin autorización previa y escrita.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">5. Responsabilidad</h2>
            <p>
              Mercado Productor actúa como plataforma intermediaria. Los productores son
              responsables de:
            </p>
            <ul className="space-y-2 pl-6">
              <li>• La veracidad y legalidad de los productos que ofrecen.</li>
              <li>• La cumplimentación de pedidos y del servicio de envío.</li>
              <li>• El cumplimiento de normativas sanitarias y de etiquetado.</li>
            </ul>
            <p className="mt-4">
              Mercado Productor no se responsabiliza del contenido de los productos ni de disputes
              entre partes, aunque facilita un sistema de resolución de incidencias.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">6. Limitación de responsabilidad</h2>
            <p>
              Salvo por disposición legal de imposible exclusión, Mercado Productor no será
              responsable por:
            </p>
            <ul className="space-y-2 pl-6">
              <li>• Daños y perjuicios derivados del uso del sitio web o de la plataforma.</li>
              <li>• Interrupciones del servicio o fallos técnicos.</li>
              <li>• Pérdida de datos o transacciones.</li>
              <li>• Daños indirectos, incidentales o consecuentes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">7. Contacto y reclamaciones</h2>
            <p>
              Para consultas, reclamaciones u objetos sobre el contenido de este aviso legal,
              contactar a:
            </p>
            <p className="font-semibold">legal@mercadoproductor.es</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">8. Legislación aplicable</h2>
            <p>
              Este sitio web está regido por la Ley 34/2002, de 11 de julio, de servicios de la
              sociedad de la información y de comercio electrónico (LSSI-CE), la Ley 3/1991, de
              competencia desleal, y demás leyes españolas aplicables.
            </p>
            <p>
              Los Juzgados y Tribunales competentes serán los de la Comunidad de Madrid (España).
            </p>
          </section>

          <section className="rounded-lg bg-emerald-50 p-4">
            <p className="text-sm text-gray-700">
              <strong>Última actualización:</strong> {new Date().toLocaleDateString('es-ES')}
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
