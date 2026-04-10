import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Mercado Productor',
  description: 'Términos y condiciones de uso de la plataforma Mercado Productor.',
}

export default function Terminos() {
  return (
    <main className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-4xl font-bold text-gray-900">Términos y Condiciones</h1>

        <div className="prose prose-emerald max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900">1. Aceptación de términos</h2>
            <p>
              Al registrarte y usar Mercado Productor, aceptas estos términos y condiciones en su
              totalidad. Si no aceptas, no debes utilizar la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">2. Descripción del servicio</h2>
            <p>
              Mercado Productor es una plataforma que conecta productores agrícolas locales
              verificados con consumidores finales. Operamos como intermediario facilitador, no como
              vendedor ni comprador directo.
            </p>
            <p>
              Todos los productores deben ser verificados por nuestro equipo antes de ofertar
              productos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">3. Registro de usuarios</h2>
            <p>Existen dos tipos de cuenta:</p>
            <ul className="space-y-2 pl-6">
              <li>
                <strong>Comprador (CUSTOMER):</strong> Para adquirir productos. Requiere nombre,
                email y contraseña.
              </li>
              <li>
                <strong>Productor (VENDOR):</strong> Para vender. Requiere verificación de identidad y
                conexión de cuenta bancaria vía Stripe Connect.
              </li>
            </ul>
            <p className="mt-4">
              Eres responsable de mantener la confidencialidad de tu contraseña y de toda actividad
              en tu cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">4. Condiciones para compradores</h2>

            <h3 className="mt-4 text-lg font-semibold text-gray-900">Proceso de compra</h3>
            <p>
              Una compra es vinculante una vez completado el pago. Recibirás una confirmación por
              email con el número de pedido y detalles del envío.
            </p>

            <h3 className="mt-4 text-lg font-semibold text-gray-900">Métodos de pago</h3>
            <p>
              Aceptamos tarjetas bancarias (Visa, Mastercard, etc.) procesadas seguramente a través
              de Stripe. No almacenamos datos de tarjeta en nuestros servidores.
            </p>

            <h3 className="mt-4 text-lg font-semibold text-gray-900">Devoluciones y reembolsos</h3>
            <p>
              Los productos pueden ser devueltos dentro de 14 días naturales desde la recepción si:
            </p>
            <ul className="space-y-2 pl-6">
              <li>• Llegan dañados o defectuosos.</li>
              <li>• No coinciden significativamente con la descripción (excepto productos perecederos).</li>
            </ul>
            <p className="mt-4">
              Productos perecederos: únicamente si llegan claramente dañados. Los compradores son
              responsables de verificar el estado al recibir.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">5. Condiciones para productores</h2>

            <h3 className="mt-4 text-lg font-semibold text-gray-900">Requisitos para ser productor</h3>
            <ul className="space-y-2 pl-6">
              <li>• Edad mínima 18 años.</li>
              <li>• Identidad verificada mediante documento oficial.</li>
              <li>• Titularidad de los productos que ofrece (o autorización legal).</li>
              <li>• Cuenta bancaria española (IBAN) para Stripe Connect.</li>
              <li>• Cumplimiento de normativas sanitarias y de etiquetado.</li>
            </ul>

            <h3 className="mt-4 text-lg font-semibold text-gray-900">Comisiones de la plataforma</h3>
            <p>
              Mercado Productor cobra una comisión del <strong>12%</strong> sobre el precio final de
              cada venta (producto + IVA). El productor recibe el 88% restante.
            </p>
            <p className="mt-2">
              Ejemplo: Vendes un producto por €10,00 → Recibes €8,80 (después de comisión).
            </p>

            <h3 className="mt-4 text-lg font-semibold text-gray-900">Responsabilidades del productor</h3>
            <ul className="space-y-2 pl-6">
              <li>• Garantizar la veracidad de fotos, descripciones y precios.</li>
              <li>• Cumplir pedidos dentro de 48 horas tras recibir la orden.</li>
              <li>• Usar embalaje adecuado para evitar daños durante el envío.</li>
              <li>• Cumplir plazos de entrega comprometidos.</li>
              <li>• Responder a consultas de compradores en máximo 24 horas.</li>
            </ul>

            <h3 className="mt-4 text-lg font-semibold text-gray-900">Liquidación de pagos</h3>
            <p>
              Los pagos se liquidan cada lunes. Recibirás la transferencia a tu cuenta bancaria en
              2-3 días hábiles.
            </p>
            <p className="mt-2">
              Stripe retiene fondos pendientes de resolución de incidencias según sus políticas.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">6. Gestión de incidencias</h2>
            <p>
              Cualquier dispute (calidad del producto, no llegada, retraso) será gestionado por
              nuestro equipo de soporte.
            </p>
            <p className="mt-2">
              Ambas partes deben colaborar en la resolución. Las decisiones de nuestro equipo son
              vinculantes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">7. Suspensión de cuenta</h2>
            <p>Mercado Productor puede suspender o cerrar cuentas por:</p>
            <ul className="space-y-2 pl-6">
              <li>• Violación de estos términos.</li>
              <li>• Actividad fraudulenta.</li>
              <li>• Incumplimiento reiterado de compromisos.</li>
              <li>• Revisión de datos personales falsos.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">8. Limitación de responsabilidad</h2>
            <p>
              Mercado Productor facilita la plataforma "tal cual". No somos responsables de
              productos defectuosos, retrasos de envío o daños causados por transportistas.
            </p>
            <p className="mt-2">
              La responsabilidad sobre calidad, seguridad alimentaria y cumplimiento normativo recae
              en el productor.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900">9. Ley aplicable y jurisdicción</h2>
            <p>
              Estos términos se rigen por la ley española. Cualquier litigio será resuelto por los
              Juzgados de Madrid (España).
            </p>
          </section>

          <section className="rounded-lg bg-emerald-50 p-4">
            <p className="text-sm text-gray-700">
              <strong>Última actualización:</strong> {new Date().toLocaleDateString('es-ES')}
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Para dudas o consultas: legal@mercadoproductor.es
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
