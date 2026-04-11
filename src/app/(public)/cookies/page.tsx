import type { Metadata } from 'next'
import { SITE_NAME } from '@/lib/constants'
import { LegalPage } from '@/components/legal/LegalPage'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Política de cookies',
  description: `Información sobre el uso de cookies en ${SITE_NAME}.`,
  path: '/cookies',
})

export default function CookiesPage() {
  return (
    <LegalPage
      title="Política de cookies"
      updatedAt="11 de abril de 2026"
      intro={`Esta política explica qué tipos de cookies puede usar ${SITE_NAME} y para qué se emplean.`}
    >
      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">1. Qué son las cookies</h2>
        <p className="mt-3">
          Las cookies son pequeños archivos que el navegador almacena para recordar preferencias, mantener
          la sesión y mejorar el funcionamiento del sitio.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">2. Tipos de cookies que usamos</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><strong>Técnicas:</strong> necesarias para iniciar sesión, mantener el carrito y proteger formularios.</li>
          <li><strong>Preferencias:</strong> recuerdan idioma, tema visual y otras opciones de experiencia.</li>
          <li><strong>Analíticas:</strong> se usan para medir el uso del sitio cuando están habilitadas en la configuración de la plataforma.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">3. Gestión del consentimiento</h2>
        <p className="mt-3">
          Cuando el sitio active cookies no esenciales, el consentimiento deberá gestionarse de forma clara
          antes de su uso. También puedes bloquear o eliminar cookies desde la configuración de tu navegador.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">4. Cómo desactivarlas</h2>
        <p className="mt-3">
          Puedes restringir, bloquear o eliminar cookies desde las preferencias de tu navegador. Ten en cuenta
          que deshabilitar cookies técnicas puede afectar al inicio de sesión y al carrito.
        </p>
      </section>
    </LegalPage>
  )
}
