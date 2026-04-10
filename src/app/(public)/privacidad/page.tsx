import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Privacidad | Mercado Productor',
  description: 'Cómo recopilamos, usamos y protegemos tus datos personales en Mercado Productor.',
}

export default function Privacidad() {
  return (
    <main className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-4xl font-bold text-gray-900">Política de Privacidad</h1>

        <div className="prose prose-emerald max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">1. Responsable del tratamiento</h2>
            <p>
              <strong>Razón social:</strong> Mercado Productor S.L.
            </p>
            <p>
              <strong>Domicilio:</strong> Calle Ejemplo, 1 - 28001 Madrid, España
            </p>
            <p>
              <strong>Email de privacidad:</strong> privacidad@mercadoproductor.es
            </p>
            <p>
              <strong>Delegado de Protección de Datos (DPD):</strong> dpo@mercadoproductor.es
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">2. Datos que recopilamos</h2>
            <p>Recopilamos la siguiente información personal:</p>
            <ul className="space-y-2 pl-6">
              <li>• Nombre, apellidos y email</li>
              <li>• Teléfono de contacto</li>
              <li>• Dirección de envío (nacional e internacional en algunos casos)</li>
              <li>• Datos bancarios / IBAN (solo para productores, a través de Stripe)</li>
              <li>• Historial de pedidos y preferencias de compra</li>
              <li>• Datos de navegación (cookies, IP, dispositivo)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">3. Finalidad del tratamiento</h2>
            <p>Utilizamos tus datos para:</p>
            <ul className="space-y-2 pl-6">
              <li>• Ejecutar y gestionar tu compra o venta dentro de la plataforma</li>
              <li>• Procesar pagos a través de Stripe</li>
              <li>• Enviar confirmaciones de pedidos y actualizaciones de envío</li>
              <li>• Comunicaciones sobre tu cuenta y el servicio</li>
              <li>• Análisis y mejora continua del servicio</li>
              <li>• Cumplimiento de obligaciones legales y fiscales</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">4. Base legal del tratamiento</h2>
            <p>El tratamiento se basa en:</p>
            <ul className="space-y-2 pl-6">
              <li>
                • <strong>Contrato:</strong> Ejecución del contrato de compra/venta (Art. 6.1.b RGPD)
              </li>
              <li>
                • <strong>Consentimiento:</strong> Tu consentimiento explícito (Art. 6.1.a RGPD)
              </li>
              <li>
                • <strong>Obligación legal:</strong> Cumplimiento de leyes fiscales y contables
                (Art. 6.1.c RGPD)
              </li>
              <li>
                • <strong>Interés legítimo:</strong> Seguridad, análisis y mejora del servicio
                (Art. 6.1.f RGPD)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">5. Destinatarios de los datos</h2>
            <p>Compartimos tus datos con:</p>
            <ul className="space-y-2 pl-6">
              <li>
                • <strong>Stripe Inc.:</strong> Procesador de pagos (datos de tarjeta NO se
                almacenan en nuestros servidores)
              </li>
              <li>
                • <strong>Productores locales:</strong> Tu nombre y dirección de envío para cumplir
                pedidos
              </li>
              <li>
                • <strong>Proveedores de hosting:</strong> Alojamiento de datos en servidores
                seguros
              </li>
              <li>
                • <strong>Autoridades públicas:</strong> Cuando sea requerido por ley (Hacienda,
                Policía, etc.)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">6. Conservación de datos</h2>
            <p>Conservamos tus datos durante:</p>
            <ul className="space-y-2 pl-6">
              <li>• <strong>Usuarios activos:</strong> Mientras mantengas tu cuenta abierta</li>
              <li>• <strong>Datos de pedidos:</strong> 5 años (por obligación fiscal)</li>
              <li>• <strong>Tras eliminación de cuenta:</strong> Los datos se anonimizarán</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">7. Tus derechos como titular</h2>
            <p>Tienes derecho a:</p>
            <ul className="space-y-2 pl-6">
              <li>
                • <strong>Acceso (Art. 15):</strong> Solicitar copia de tus datos personales
              </li>
              <li>
                • <strong>Rectificación (Art. 16):</strong> Corregir datos inexactos
              </li>
              <li>
                • <strong>Supresión (Art. 17 - "Derecho al olvido"):</strong> Solicitar eliminación
                (excepto datos con obligación legal de retención)
              </li>
              <li>
                • <strong>Limitación (Art. 18):</strong> Limitar el uso de tus datos
              </li>
              <li>
                • <strong>Portabilidad (Art. 20):</strong> Recibir tus datos en formato portable
              </li>
              <li>
                • <strong>Oposición (Art. 21):</strong> Oponerse a tratamientos específicos
              </li>
            </ul>
            <p className="mt-4">
              Para ejercer estos derechos, escribe a:{' '}
              <strong>privacidad@mercadoproductor.es</strong>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">8. Transferencias internacionales</h2>
            <p>
              Stripe opera en Estados Unidos bajo mecanismos de protección como{' '}
              <strong>Cláusulas Contractuales Estándar (SCCs)</strong>. Tus datos de pago se procesan
              con los más altos estándares de encriptación (TLS 1.2+).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">9. Cookies y tecnologías similares</h2>
            <p>
              Utilizamos cookies para mejorar tu experiencia. Para más detalles, consulta nuestra{' '}
              <Link href="/cookies" className="font-semibold text-emerald-600 hover:underline">
                Política de Cookies
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">10. Cambios en esta política</h2>
            <p>
              Nos reservamos el derecho a actualizar esta política. Te notificaremos de cambios
              significativos mediante email o aviso en el sitio web.
            </p>
          </section>

          <section className="rounded-lg bg-emerald-50 p-4">
            <p className="text-sm text-gray-700">
              <strong>Última actualización:</strong> {new Date().toLocaleDateString('es-ES')}
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Si tienes dudas, escribe a dpo@mercadoproductor.es
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
