import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type TelegramProviderCode = 'mock' | 'telethon'
export type TelegramSyncRunStatus = 'RUNNING' | 'OK' | 'FAILED' | 'CANCELLED'

export interface TelegramSyncRunSummary {
  chatTitle: string
  status: TelegramSyncRunStatus
  startedAt: Date
  finishedAt: Date | null
  fromMessageId: bigint | null
  toMessageId: bigint | null
  messagesFetched: number
  mediaFetched: number
  errorMessage: string | null
}

export interface TelegramIngestionStatusInput {
  providerCode: TelegramProviderCode
  sidecarConfigured: boolean
  killSwitchActive: boolean
  activeConnectionCount: number
  enabledChatCount: number
  messageCount: number
  syncRunCount: number
  latestSyncRun: TelegramSyncRunSummary | null
}

export interface TelegramIngestionStatusCard {
  tone: 'green' | 'amber' | 'red'
  title: string
  body: string
  bullets: string[]
}

export function buildTelegramIngestionStatus(
  input: TelegramIngestionStatusInput,
): TelegramIngestionStatusCard {
  const bullets = [
    `${input.activeConnectionCount} conexión(es) activa(s)`,
    `${input.enabledChatCount} chat(s) habilitado(s)`,
    `${input.syncRunCount} sync run(s)`,
  ]

  if (input.providerCode === 'mock') {
    return {
      tone: 'amber',
      title: 'Estás en mock: no llegarán mensajes reales',
      body: 'La UI puede funcionar, pero hasta cambiar a Telethon y conectar el sidecar nunca verás mensajes nuevos de Telegram.',
      bullets: [...bullets, 'Cambiar el proveedor a telethon es obligatorio para leer chats reales.'],
    }
  }

  if (!input.sidecarConfigured) {
    return {
      tone: 'red',
      title: 'Falta el sidecar de Telegram',
      body: 'El worker no puede leer mensajes reales sin TELEGRAM_SIDECAR_URL y TELEGRAM_SIDECAR_TOKEN.',
      bullets: [...bullets, 'El panel puede encolar jobs, pero el worker no podrá procesarlos.'],
    }
  }

  if (input.killSwitchActive) {
    return {
      tone: 'amber',
      title: 'Telegram está bloqueado por el kill switch',
      body: 'La infraestructura está lista, pero la ingesta sigue apagada hasta desactivar kill-ingestion-telegram.',
      bullets: [...bullets, 'Cuando lo apagues, los syncs empezarán a persistir mensajes reales.'],
    }
  }

  if (input.messageCount === 0 && input.syncRunCount === 0) {
    return {
      tone: 'amber',
      title: 'Aún no has lanzado ninguna sincronización',
      body: 'La configuración ya permite datos reales. Conecta un chat y pulsa Sincronizar ahora para empezar a ver mensajes.',
      bullets: [...bullets, 'No hay datos todavía porque el pipeline no ha hecho ningún pase.'],
    }
  }

  if (input.messageCount === 0) {
    return {
      tone: input.latestSyncRun?.status === 'FAILED' ? 'red' : 'amber',
      title:
        input.latestSyncRun?.status === 'FAILED'
          ? 'El último sync falló antes de guardar mensajes'
          : 'El último sync no encontró mensajes nuevos',
      body:
        input.latestSyncRun?.status === 'FAILED'
          ? 'Revisa el historial de syncs: el worker ha ejecutado el job, pero no pudo completar la lectura.'
          : 'Puede que ese chat ya esté al día o que el mensaje que esperabas todavía no se haya cursado en la ventana actual.',
      bullets: [
        ...bullets,
        input.latestSyncRun
          ? `Último sync: ${input.latestSyncRun.messagesFetched} mensaje(s) / ${input.latestSyncRun.mediaFetched} media`
          : 'No hay historial de syncs para contrastar qué pasó.',
      ],
    }
  }

  return {
    tone: 'green',
    title: 'Ya están entrando mensajes reales',
    body: 'La ingesta está guardando mensajes en raw tables. Si algo parece vacío, el historial de syncs te dirá si el worker está al día o si hay errores.',
    bullets: [
      ...bullets,
      input.latestSyncRun
        ? `Último sync: ${input.latestSyncRun.messagesFetched} mensaje(s) / ${input.latestSyncRun.mediaFetched} media`
        : 'Aún no hay un último sync visible.',
    ],
  }
}

interface Props {
  providerCode: TelegramProviderCode
  sidecarConfigured: boolean
  killSwitchActive: boolean
  primaryActionHref: string
  primaryActionLabel: string
  connectionCount: number
  activeConnectionCount: number
  enabledChatCount: number
  messageCount: number
  syncRunCount: number
  latestSyncRun: TelegramSyncRunSummary | null
}

const checklist = [
  {
    title: 'Sidecar y credenciales',
    body: 'Configura TELEGRAM_API_ID, TELEGRAM_API_HASH, SIDECAR_SHARED_SECRET y la sesión persistente del sidecar.',
  },
  {
    title: 'Proveedor real',
    body: 'Pon INGESTION_TELEGRAM_PROVIDER=telethon para que el worker lea Telegram real en vez de fixtures.',
  },
  {
    title: 'Kill switch apagado',
    body: 'Desactiva kill-ingestion-telegram y mantén el worker corriendo para que los jobs se ejecuten.',
  },
] as const

export function TelegramIngestionSetupCard({
  providerCode,
  sidecarConfigured,
  killSwitchActive,
  primaryActionHref,
  primaryActionLabel,
  connectionCount,
  activeConnectionCount,
  enabledChatCount,
  messageCount,
  syncRunCount,
  latestSyncRun,
}: Props) {
  const realDataReady = providerCode === 'telethon' && sidecarConfigured && !killSwitchActive
  const status = buildTelegramIngestionStatus({
    providerCode,
    sidecarConfigured,
    killSwitchActive,
    activeConnectionCount,
    enabledChatCount,
    messageCount,
    syncRunCount,
    latestSyncRun,
  })

  return (
    <Card className="rounded-2xl border border-[var(--border)] shadow-sm">
      <CardHeader className="flex flex-col gap-4 border-b border-[var(--border)] bg-[var(--surface)] lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
            Ingestión Telegram
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">
            Antes de ver datos reales, deja lista la configuración
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Un resumen corto de lo que falta y del estado actual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">Proveedor: {providerCode}</Badge>
          <Badge variant="default">Sidecar: {sidecarConfigured ? 'OK' : 'falta'}</Badge>
          <Badge variant="default">Kill switch: {killSwitchActive ? 'ON' : 'OFF'}</Badge>
          <Badge variant="default">
            {realDataReady ? 'Listo para datos reales' : 'Aún no está listo'}
          </Badge>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
          <section className="space-y-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">Preflight</p>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <ul className="space-y-3 text-sm text-[var(--muted-foreground)]">
                {checklist.map((item, index) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-medium text-[var(--foreground)]">
                      {index + 1}
                    </span>
                    <span>
                      <span className="font-medium text-[var(--foreground)]">{item.title}.</span>{' '}
                      {item.body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className={cn(
                'rounded-2xl border px-4 py-3 text-sm',
                status.tone === 'red'
                  ? 'border-red-500/20 bg-[var(--surface)] text-red-700 dark:text-red-300'
                  : status.tone === 'amber'
                    ? 'border-amber-500/20 bg-[var(--surface)] text-amber-700 dark:text-amber-300'
                    : 'border-emerald-500/20 bg-[var(--surface)] text-emerald-700 dark:text-emerald-300',
              )}
            >
              <p className="font-semibold text-[var(--foreground)]">{status.title}</p>
              <p className="mt-1 text-[var(--muted-foreground)]">{status.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {status.bullets.map((bullet) => (
                  <span
                    key={bullet}
                    className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]"
                  >
                    {bullet}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">Estado actual</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatPill label="Conexiones" value={String(connectionCount)} help={`${activeConnectionCount} activas`} />
              <StatPill label="Chats" value={String(enabledChatCount)} help="Habilitados para sync" />
              <StatPill label="Mensajes" value={String(messageCount)} help="Almacenados en raw tables" />
              <StatPill label="Sync runs" value={String(syncRunCount)} help={realDataReady ? 'Pipeline listo' : 'Aún en preparación'} />
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={primaryActionHref}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-raised)]"
                >
                  {primaryActionLabel}
                </Link>
                <Link
                  href="/admin/ingestion"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-raised)]"
                >
                  Cola de revisión
                </Link>
              </div>
            </div>

            {latestSyncRun && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">Último sync</p>
                  <Badge variant="default">{latestSyncRun.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  {latestSyncRun.chatTitle} · {latestSyncRun.messagesFetched} mensaje(s) · {latestSyncRun.mediaFetched} media
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Cursor {latestSyncRun.fromMessageId?.toString() ?? '—'} → {latestSyncRun.toMessageId?.toString() ?? '—'}
                </p>
              </div>
            )}
          </section>
        </div>
      </CardBody>
    </Card>
  )
}

function StatPill({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{help}</p>
    </div>
  )
}
