import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Cookies',
  description: 'Información sobre el uso de cookies en Mercado Productor.',
  robots: { index: false, follow: true },
}

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground mb-4">Política de Cookies</h1>
        <p className="text-foreground-soft text-sm mb-8">
          Última actualización: {new Date().toLocaleDateString('es-ES')}
        </p>

        <div className="prose prose-sm max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. ¿Qué son las cookies?</h2>
            <p className="text-foreground-soft">
              Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas un sitio web. Nos permiten recordar tus preferencias, mantener tu sesión iniciada y mejorar tu experiencia de usuario.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. Cookies que utilizamos</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-surface-raised">
                    <th className="border border-[var(--border)] px-4 py-2 text-left text-foreground">Cookie</th>
                    <th className="border border-[var(--border)] px-4 py-2 text-left text-foreground">Tipo</th>
                    <th className="border border-[var(--border)] px-4 py-2 text-left text-foreground">Finalidad</th>
                    <th className="border border-[var(--border)] px-4 py-2 text-left text-foreground">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">authjs.session-token</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">Estrictamente necesaria</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">Mantiene la sesión del usuario autenticado</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">Sesión</td>
                  </tr>
                  <tr>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">marketplace-theme</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">Preferencias</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">Guarda la preferencia de tema (claro/oscuro)</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">1 año</td>
                  </tr>
                  <tr>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">cart-storage</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">Funcional</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">Persiste el contenido del carrito (localStorage)</td>
                    <td className="border border-[var(--border)] px-4 py-2 text-foreground-soft">Persistente</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. Gestión de cookies</h2>
            <p className="text-foreground-soft">
              Puedes configurar tu navegador para rechazar o eliminar cookies. Ten en cuenta que desactivar las cookies estrictamente necesarias puede afectar al funcionamiento del sitio web (por ejemplo, no podrás mantener la sesión iniciada).
            </p>
            <ul className="mt-4 space-y-2 text-foreground-soft list-disc pl-5">
              <li><strong>Chrome:</strong> Configuración → Privacidad y seguridad → Cookies</li>
              <li><strong>Firefox:</strong> Opciones → Privacidad y seguridad → Cookies</li>
              <li><strong>Safari:</strong> Preferencias → Privacidad → Cookies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Contacto</h2>
            <p className="text-foreground-soft">
              Para cualquier duda sobre el uso de cookies, puedes contactarnos en: <strong>privacy@marketplace.local</strong>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
