import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'
import { buildPageMetadata } from '@/lib/seo'

const LEGAL_REVIEW_DATE = '11 de abril de 2026'

export const metadata: Metadata = buildPageMetadata({
  title: 'Política de privacidad',
  description: `Política de privacidad y protección de datos de ${SITE_NAME}.`,
  path: '/privacidad',
})

export default function PrivacyPage() {
  return (
    <div className="bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-8 shadow-sm sm:px-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-4">Política de Privacidad</h1>
        <p className="text-[var(--muted)] text-sm mb-8">
          Última actualización: {LEGAL_REVIEW_DATE}
        </p>

        <div className="space-y-8 text-sm leading-6 text-[var(--foreground-soft)]">
          {/* Introducción */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              1. Introducción
            </h2>
            <p className="text-foreground-soft">
              El Marketplace se compromete a proteger tus datos personales. Esta política explica
              cómo recopilamos, usamos y protegemos tu información de conformidad con el Reglamento
              General de Protección de Datos (RGPD).
            </p>
          </section>

          {/* Datos recopilados */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              2. Datos que Recopilamos
            </h2>
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-foreground">Datos proporcionados por ti:</h3>
                <ul className="list-disc pl-5 text-foreground-soft mt-2 space-y-1">
                  <li>Email y contraseña (autenticación)</li>
                  <li>Nombre y apellidos</li>
                  <li>Dirección de envío y facturación</li>
                  <li>Número de teléfono (opcional)</li>
                  <li>Reseñas y comentarios de productos</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Datos generados automáticamente:</h3>
                <ul className="list-disc pl-5 text-foreground-soft mt-2 space-y-1">
                  <li>Historial de pedidos y transacciones</li>
                  <li>Dirección IP y datos de navegación</li>
                  <li>Cookies y tecnologías similares</li>
                  <li>Datos de interacción con el sitio</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Base legal */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              3. Base Legal del Tratamiento
            </h2>
            <ul className="list-disc pl-5 text-[var(--foreground-soft)] space-y-1">
              <li>
                <strong>Consentimiento:</strong> Para marketing, uso de cookies no esenciales
              </li>
              <li>
                <strong>Contrato:</strong> Para procesar tu pedido y proporcionar servicios
              </li>
              <li>
                <strong>Obligación legal:</strong> Cumplimiento fiscal (Agencia Tributaria)
              </li>
              <li>
                <strong>Interés legítimo:</strong> Seguridad, fraude, análisis de datos
              </li>
            </ul>
          </section>

          {/* Derechos */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              4. Tus Derechos (RGPD Arts. 12-22)
            </h2>
            <ul className="list-disc pl-5 text-[var(--foreground-soft)] space-y-2">
              <li>
                <strong>Derecho de acceso (Art. 15):</strong> Obtener una copia de tus datos
                personales
              </li>
              <li>
                <strong>Derecho de rectificación (Art. 16):</strong> Corregir datos inexactos
              </li>
              <li>
                <strong>Derecho al olvido (Art. 17):</strong> Solicitar la eliminación de tus
                datos
              </li>
              <li>
                <strong>Derecho de limitación (Art. 18):</strong> Restringir el procesamiento
              </li>
              <li>
                <strong>Derecho de portabilidad (Art. 20):</strong> Obtener datos en formato
                legible
              </li>
              <li>
                <strong>Derecho de oposición (Art. 21):</strong> Optar por no recibir marketing
              </li>
            </ul>
            <p className="text-[var(--foreground-soft)] mt-4">
              Para ejercer cualquier derecho, accede a tu cuenta → Privacidad y Datos.
            </p>
          </section>

          {/* Retención de datos */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              5. Retención de Datos
            </h2>
            <ul className="list-disc pl-5 text-[var(--foreground-soft)] space-y-2">
              <li>
                <strong>Cuenta activa:</strong> Mientras tu cuenta esté activa
              </li>
              <li>
                <strong>Historial de pedidos:</strong> 5 años (obligación fiscal - Ley General
                Tributaria)
              </li>
              <li>
                <strong>Datos de contacto:</strong> Hasta que solicites su eliminar
              </li>
              <li>
                <strong>Cookies:</strong> Según configuración (máximo 2 años)
              </li>
            </ul>
          </section>

          {/* Seguridad */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              6. Seguridad
            </h2>
            <p className="text-foreground-soft">
              Implementamos medidas técnicas y organizativas para proteger tus datos:
            </p>
            <ul className="list-disc pl-5 text-[var(--foreground-soft)] mt-3 space-y-1">
              <li>Encriptación HTTPS en tránsito</li>
              <li>Hashing de contraseñas con bcryptjs (12 rondas)</li>
              <li>Bases de datos alojadas en servidores seguros</li>
              <li>Acceso restringido a personal autorizado</li>
              <li>Auditorías de seguridad periódicas</li>
            </ul>
          </section>

          {/* Terceros */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              7. Compartición de Datos con Terceros
            </h2>
            <p className="text-foreground-soft mb-3">
              Solo compartimos tus datos cuando es necesario:
            </p>
            <ul className="list-disc pl-5 text-[var(--foreground-soft)] space-y-1">
              <li>
                <strong>Proveedores de pago:</strong> Stripe (procesamiento de pagos)
              </li>
              <li>
                <strong>Vendedores:</strong> Información de envío para tu pedido
              </li>
              <li>
                <strong>Autoridades:</strong> Cuando lo requiera la ley
              </li>
              <li>
                <strong>No vendemos:</strong> Tus datos NO se venden a terceros
              </li>
            </ul>
          </section>

          {/* Cambios */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              8. Cambios en esta Política
            </h2>
            <p className="text-foreground-soft">
              Nos reservamos el derecho de actualizar esta política. Te notificaremos por email
              si hay cambios significativos.
            </p>
          </section>

          {/* Contacto */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              9. Contacto
            </h2>
            <p className="text-foreground-soft mb-3">
              Si tienes preguntas sobre privacidad o deseas ejercer tus derechos RGPD:
            </p>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4">
              <p className="font-semibold text-[var(--foreground)]">Responsable de Protección de Datos</p>
              <p className="mt-2 text-[var(--foreground-soft)]">
                Si necesitas ejercer tus derechos, usa el{' '}
                <Link href="/contacto" className="text-[var(--accent)] underline-offset-2 hover:underline">
                  formulario de contacto
                </Link>
                {' '}indicando que es una solicitud RGPD.
              </p>
              <p className="mt-2 text-[var(--foreground-soft)]">
                También puedes revisar tus datos desde la sección de privacidad de tu cuenta.
              </p>
            </div>
          </section>

          {/* Nota legal */}
          <section>
            <p className="border-t pt-6 mt-8 text-sm text-[var(--foreground-soft)]">
              Esta política está diseñada para cumplir con RGPD (UE), LOPDGDD (España) y otras
              regulaciones de protección de datos. Última revisión: {LEGAL_REVIEW_DATE}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
