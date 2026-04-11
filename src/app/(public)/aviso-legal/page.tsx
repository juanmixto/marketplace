import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'
import { LegalPage } from '@/components/legal/LegalPage'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Aviso legal',
  description: `Aviso legal y condiciones de uso de ${SITE_NAME}.`,
  path: '/aviso-legal',
})

export default function AvisoLegalPage() {
  return (
    <LegalPage
      title="Aviso legal"
      updatedAt="11 de abril de 2026"
      intro={`Este aviso legal regula el acceso y uso del sitio de ${SITE_NAME}, así como las responsabilidades generales de la plataforma y de las personas usuarias.`}
    >
      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">1. Titularidad del sitio</h2>
        <p className="mt-3">
          {SITE_NAME} opera como un marketplace que conecta productores, compradores y equipos operativos.
          La información de contacto para soporte y consultas está disponible en la página de{' '}
          <Link href="/contacto" className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
            contacto
          </Link>.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">2. Condiciones de uso</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>No se permite usar la plataforma para actividades ilícitas o fraudulentas.</li>
          <li>Las personas usuarias deben proporcionar información veraz y mantener sus credenciales seguras.</li>
          <li>El acceso a áreas privadas puede requerir registro y autenticación.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">3. Propiedad intelectual</h2>
        <p className="mt-3">
          Los contenidos de marca, diseño, textos y estructura del sitio están protegidos por la normativa
          aplicable de propiedad intelectual e industrial. Los contenidos aportados por vendedores o terceros
          siguen siendo de su titularidad, salvo que se indique lo contrario.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">4. Responsabilidad</h2>
        <p className="mt-3">
          La plataforma actúa como intermediaria técnica entre compradores y vendedores. Cada parte es
          responsable de cumplir sus obligaciones legales, comerciales y fiscales en el marco de sus operaciones.
        </p>
      </section>
    </LegalPage>
  )
}
