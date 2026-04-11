import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircleIcon, SparklesIcon, BanknotesIcon, UserGroupIcon, ShieldCheckIcon, ClockIcon } from '@heroicons/react/24/outline'
import { buildPageMetadata } from '@/lib/seo'
import { DEFAULT_COMMISSION_RATE } from '@/lib/constants'
import { BRAND_CLAIMS } from '@/lib/brand-claims'

export const metadata: Metadata = buildPageMetadata({
  title: 'Vende tus productos',
  description: 'Únete a Mercado Productor y vende tus productos directamente a consumidores locales. Sin intermediarios, cobro semanal, gestión sencilla.',
  path: '/como-vender',
})

const benefits = [
  {
    icon: BanknotesIcon,
    title: 'Cobra más por tu trabajo',
    description: `Sin intermediarios, el precio lo pones tú. Comisión base del ${Math.round(DEFAULT_COMMISSION_RATE * 100)}% por venta.`,
  },
  {
    icon: SparklesIcon,
    title: 'Controla tu stock',
    description: 'Gestiona tus productos y disponibilidad en tiempo real desde tu panel.',
  },
  {
    icon: ClockIcon,
    title: 'Cobro semanal programado',
    description: 'Liquidaciones semanales según el calendario operativo publicado.',
  },
  {
    icon: UserGroupIcon,
    title: 'Alcance nacional',
    description: 'Llega a compradores de todo el país según la cobertura de cada productor.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Soporte incluido',
    description: 'Equipo disponible para resolver tus consultas y problemas.',
  },
  {
    icon: CheckCircleIcon,
    title: 'Sin cuotas mensuales',
    description: 'Solo pagas comisión cuando vendes. Cero costes fijos.',
  },
]

const steps = [
  {
    num: 1,
    title: 'Regístrate gratis',
    desc: 'Sin cuota de alta, sin datos de tarjeta requerida',
  },
  {
    num: 2,
    title: 'Verificación rápida',
    desc: 'Nuestro equipo revisa tu solicitud en el siguiente ciclo operativo.',
  },
  {
    num: 3,
    title: 'Configura tus pagos',
    desc: 'Vincula tu cuenta bancaria vía Stripe Connect de forma segura',
  },
  {
    num: 4,
    title: 'Publica productos',
    desc: 'Sube fotos, precios, stock y descripción de tus productos',
  },
  {
    num: 5,
    title: 'Recibe pedidos',
    desc: 'Notificaciones de nuevos pedidos, gestiona envíos',
  },
  {
    num: 6,
    title: 'Cobra confiadamente',
    description: 'Liquidaciones automáticas cada semana',
  },
]

export default function ComoVender() {
  return (
    <main className="bg-surface">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 to-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-bold text-foreground">
            Vende tus productos directamente
          </h1>
          <p className="mb-8 text-xl text-foreground-soft">
            Únete al marketplace de productores locales y vende directamente a clientes finales. En Mercado Productor, tú fijas los precios.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/register?rol=productor"
              className="rounded-lg bg-accent px-8 py-4 font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Empezar a vender gratis
            </Link>
            <Link
              href="/como-funciona"
              className="rounded-lg border-2 border-accent px-8 py-4 font-semibold text-accent transition-colors hover:bg-accent-soft"
            >
              Ver cómo funciona
            </Link>
          </div>
        </div>
      </section>

      {/* Por qué */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">
            ¿Por qué Mercado Productor?
          </h2>
          <p className="mb-12 text-center text-lg text-foreground-soft">
            6 razones para vender con un flujo claro, sin cuotas mensuales y con reglas operativas transparentes
          </p>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, i) => {
              const Icon = benefit.icon
              return (
                <div
                  key={i}
                  className="rounded-lg border border-accent-soft bg-accent-soft p-6"
                >
                  <Icon className="mb-4 h-8 w-8 text-accent" />
                  <h3 className="mb-2 font-semibold text-foreground">{benefit.title}</h3>
                  <p className="text-sm text-foreground-soft">{benefit.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Precios */}
      <section className="bg-surface-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">
            Precios y comisiones
          </h2>
          <p className="mb-8 text-center text-[var(--muted)]">
            Transparentes y justos. Solo pagas cuando vendes.
          </p>

          <div className="rounded-lg border-2 border-accent bg-surface p-8 text-center">
            <p className="mb-4 text-foreground-soft">Comisión de plataforma:</p>
            <p className="mb-8 text-5xl font-bold text-accent">12%</p>
            <h3 className="mb-6 text-lg font-semibold text-foreground">Ejemplo</h3>
            <div className="space-y-2 text-left">
              <div className="flex justify-between">
                <span>Vendes un producto por</span>
                <strong className="text-accent">€10,00</strong>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex justify-between text-foreground-soft">
                  <span>Comisión 12%</span>
                  <span>-€1,20</span>
                </div>
              </div>
              <div className="border-t-2 border-[var(--foreground)] pt-2">
                <div className="flex justify-between">
                  <strong>Tú recibes</strong>
                  <strong className="text-accent">€8,80</strong>
                </div>
              </div>
            </div>
            <p className="mt-6 text-sm text-[var(--muted)]">
              Sin cuotas mensuales. Sin costes ocultos.
            </p>
          </div>
        </div>
      </section>

      {/* Pasos */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">
            Así de sencillo. 6 pasos.
          </h2>

          <div className="space-y-6">
            {steps.map((step) => (
              <div key={step.num} className="flex gap-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white font-bold">
                  {step.num}
                </div>
                <div className="flex flex-col justify-center">
                  <h3 className="font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm text-[var(--muted)]">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requisitos */}
      <section className="bg-surface-raised px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-3xl font-bold text-foreground">
            Requisitos para unirse
          </h2>

          <div className="space-y-4">
            <div className="flex gap-4">
              <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-accent" />
              <p className="text-[var(--foreground-soft)]">Ser productor/agricultor registrado en España</p>
            </div>
            <div className="flex gap-4">
              <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-accent" />
              <p className="text-[var(--foreground-soft)]">Tener cuenta bancaria española (IBAN) para cobrar</p>
            </div>
            <div className="flex gap-4">
              <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-accent" />
              <p className="text-[var(--foreground-soft)]">Productos alimentarios con origen verificable</p>
            </div>
            <div className="flex gap-4">
              <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-accent" />
              <p className="text-[var(--foreground-soft)]">Cumplimiento de normativa sanitaria aplicable</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-6 text-4xl font-bold text-foreground">
            ¿Listo para empezar?
          </h2>
          <p className="mb-8 text-xl text-foreground-soft">
            Regístrate hoy, sin compromisos. La revisión de tu solicitud sigue el proceso manual publicado.
          </p>
          <Link
            href="/register?rol=productor"
            className="rounded-lg bg-accent px-10 py-4 text-lg font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Crear cuenta de productor
          </Link>
          <p className="mt-6 text-sm text-[var(--muted)]">
            ¿Dudas? Consulta nuestro <Link href="/faq" className="font-semibold text-accent hover:underline">FAQ</Link> o{' '}
            <Link href="/contacto" className="font-semibold text-accent hover:underline">
              contacta
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
