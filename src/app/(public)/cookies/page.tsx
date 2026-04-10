import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Cookies | Mercado Productor',
  description: 'Información sobre el uso de cookies en Mercado Productor.',
}

export default function Cookies() {
  return (
    <main className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-4xl font-bold text-gray-900">Política de Cookies</h1>

        <div className="prose prose-emerald max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">1. ¿Qué son las cookies?</h2>
            <p>
              Las cookies son pequeños archivos de texto que se guardan en tu navegador al visitar
              un sitio web. Se utilizan para recordar información sobre ti, como tus preferencias o
              datos de sesión.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">2. Cookies que utilizamos</h2>
            <p>En Mercado Productor utilizamos:</p>

            <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-emerald-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Nombre</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Tipo</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Finalidad</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">next-auth.session-token</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        Necesaria
                      </span>
                    </td>
                    <td className="px-4 py-2">Mantener tu sesión de usuario</td>
                    <td className="px-4 py-2">Sesión</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">__Secure-next-auth</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        Necesaria
                      </span>
                    </td>
                    <td className="px-4 py-2">Seguridad de autenticación</td>
                    <td className="px-4 py-2">30 días</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">theme-preference</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                        Preferencia
                      </span>
                    </td>
                    <td className="px-4 py-2">Recordar modo claro/oscuro</td>
                    <td className="px-4 py-2">1 año</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">__stripe_sid</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        Necesaria
                      </span>
                    </td>
                    <td className="px-4 py-2">Procesamiento seguro de pagos</td>
                    <td className="px-4 py-2">Sesión</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">3. Categorías de cookies</h2>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">
              Cookies estrictamente necesarias (No requieren consentimiento)
            </h3>
            <p>
              Son esenciales para el funcionamiento básico de la plataforma (autenticación, seguridad,
              pagos). No se pueden desactivar.
            </p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Cookies de preferencias</h3>
            <p>Guardan tus preferencias (tema, idioma, etc.) para mejorar tu experiencia.</p>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Cookies de terceros</h3>
            <p>
              Stripe integra sus propias cookies para procesamiento seguro de pagos. Consulta la{' '}
              <a
                href="https://stripe.com/cookies-policy/legal"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-600 hover:underline"
              >
                Política de Stripe
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">
              4. Cómo gestionar o desactivar cookies
            </h2>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Google Chrome</h3>
            <ol className="space-y-2 pl-6">
              <li>1. Abre el menú (⋮) &gt; Configuración</li>
              <li>2. Ve a Privacidad y seguridad</li>
              <li>3. Haz clic en Cookies y otros datos de sitios</li>
              <li>4. Personaliza según tu preferencia</li>
            </ol>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Mozilla Firefox</h3>
            <ol className="space-y-2 pl-6">
              <li>1. Abre el menú (☰) &gt; Configuración</li>
              <li>2. Ve a Privacidad y seguridad</li>
              <li>3. Busca la sección "Cookies y datos del sitio"</li>
              <li>4. Ajusta tus preferencias</li>
            </ol>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Apple Safari</h3>
            <ol className="space-y-2 pl-6">
              <li>1. Ve a Safari &gt; Preferencias</li>
              <li>2. Haz clic en la pestaña Privacidad</li>
              <li>3. Elige tu política de cookies</li>
            </ol>

            <h3 className="mt-6 text-lg font-semibold text-gray-900">Microsoft Edge</h3>
            <ol className="space-y-2 pl-6">
              <li>1. Abre el menú (⋯) &gt; Configuración</li>
              <li>2. Ve a Privacidad, búsqueda y servicios</li>
              <li>3. Gestiona las cookies</li>
            </ol>
          </section>

          <section className="rounded-lg bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              <strong>⚠️ Advertencia:</strong> Desactivar cookies estrictamente necesarias puede
              afectar a la funcionalidad de la plataforma (no podrás iniciar sesión, procesar pagos,
              etc.).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">5. Más información</h2>
            <p>
              Para más detalles sobre cómo gestionamos tus datos, consulta nuestra{' '}
              <Link href="/privacidad" className="font-semibold text-emerald-600 hover:underline">
                Política de Privacidad
              </Link>
              .
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
