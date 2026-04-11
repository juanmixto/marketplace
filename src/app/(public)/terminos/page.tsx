import type { Metadata } from 'next'
import { SITE_NAME } from '@/lib/constants'
import { LegalPage } from '@/components/legal/LegalPage'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Términos de uso',
  description: `Términos y condiciones de uso de ${SITE_NAME}.`,
  path: '/terminos',
})

export default function TerminosPage() {
  return (
    <LegalPage
      title="Términos de uso"
      updatedAt="11 de abril de 2026"
      intro={`Estos términos describen cómo se usa ${SITE_NAME}, qué obligaciones tiene cada parte y cómo se gestiona la compra en la plataforma.`}
    >
      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">1. Registro y cuentas</h2>
        <p className="mt-3">
          Cuando una funcionalidad requiera cuenta, la persona usuaria debe aportar datos veraces, mantener
          su contraseña segura y avisar de cualquier uso no autorizado de su cuenta.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">2. Compras y disponibilidad</h2>
        <p className="mt-3">
          Los pedidos están sujetos a disponibilidad de stock, validación de pago y condiciones logísticas.
          Los precios y promociones pueden actualizarse antes de completar la compra.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">3. Envíos y devoluciones</h2>
        <p className="mt-3">
          Las condiciones de envío, plazos y posibles devoluciones se muestran en el proceso de compra y
          pueden variar según la zona o el producto.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">4. Uso aceptable</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>No se permite el uso automatizado abusivo ni la manipulación de precios o pedidos.</li>
          <li>Está prohibida la publicación de contenido engañoso, ilícito o que infrinja derechos de terceros.</li>
          <li>La plataforma puede restringir accesos si detecta uso indebido o riesgo para la operación.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">5. Cambios en los términos</h2>
        <p className="mt-3">
          {SITE_NAME} puede actualizar estos términos cuando cambien la operación, la normativa o la propia
          plataforma. La versión vigente será la publicada en esta página.
        </p>
      </section>
    </LegalPage>
  )
}
