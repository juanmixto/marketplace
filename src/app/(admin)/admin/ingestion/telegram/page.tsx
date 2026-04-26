import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import {
  IngestionFeatureUnavailableError,
  requireIngestionAdmin,
} from '@/domains/ingestion/authz'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TelegramAuthForm } from '@/components/admin/ingestion/TelegramAuthForm'
import { TelegramChatPicker } from '@/components/admin/ingestion/TelegramChatPicker'
import { TelegramSyncButton } from '@/components/admin/ingestion/TelegramSyncButton'
import { TelegramReprocessButton } from '@/components/admin/ingestion/TelegramReprocessButton'
import { listChatIngestionStats } from '@/domains/ingestion/telegram/queries'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Ingestión · Telegram | Admin' }
export const dynamic = 'force-dynamic'

export default async function IngestionTelegramPage() {
  try {
    await requireIngestionAdmin()
  } catch (err) {
    if (err instanceof IngestionFeatureUnavailableError) notFound()
    throw err
  }

  const [connections, chats] = await Promise.all([
    db.telegramIngestionConnection.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        status: true,
        createdAt: true,
        _count: { select: { chats: true } },
      },
    }),
    db.telegramIngestionChat.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        connection: { select: { id: true, label: true, status: true } },
        _count: { select: { messages: true } },
      },
    }),
  ])

  const activeConnections = connections.filter((c) => c.status === 'ACTIVE')
  const pendingConnections = connections.filter((c) => c.status === 'PENDING')
  const stats = await listChatIngestionStats(chats.map((c) => c.id))
  const hasActiveConnection = activeConnections.length > 0
  const hasPendingFlow = pendingConnections.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">
            Ingestión · Telegram
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
            Conexiones a cuentas de Telegram, chats registrados para sincronización
            y disparo manual del sync. Toda la actividad pasa por el sidecar
            Telethon — si no está corriendo, las acciones fallan con un error
            claro.
          </p>
        </div>
        <Link
          href="/admin/ingestion"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          ← Cola de revisión
        </Link>
      </div>

      <Card>
        <details open={!hasActiveConnection || hasPendingFlow}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--muted)]/30">
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                Conectar cuenta de Telegram
              </h2>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {hasActiveConnection
                  ? `${activeConnections.length} conexión(es) activa(s) — pulsa para añadir otra`
                  : 'Introduce un teléfono y verifica con el código que recibas en Telegram.'}
              </p>
            </div>
            <span aria-hidden className="text-[var(--muted-foreground)]">▾</span>
          </summary>
          <div className="border-t border-[var(--border)] px-5 py-4">
            <TelegramAuthForm pendingConnections={pendingConnections} />
            {hasActiveConnection && (
              <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Conexiones existentes
                </p>
                <ul className="divide-y divide-[var(--border)]">
                  {activeConnections.map((conn) => (
                    <li key={conn.id} className="flex items-center justify-between gap-4 py-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{conn.label}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Creada {formatDate(conn.createdAt)} · {conn._count.chats} chat(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="green">ACTIVA</Badge>
                        <TelegramChatPicker connectionId={conn.id} connectionLabel={conn.label} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Chats sincronizables ({chats.length})
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            <strong>Crudo</strong> son los mensajes ingestados de Telegram.
            <strong className="ml-1">Procesado</strong> son los que el clasificador
            ya ha analizado. <strong className="ml-1">Drafts</strong> son los
            productos extraídos que llegan a la cola de revisión. Los pendientes
            son crudos sin procesar — pulsa <em>Reprocesar</em> si hay backlog.
          </p>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[var(--muted)]/40 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Chat</th>
                  <th className="px-4 py-3 font-medium text-right">Crudo</th>
                  <th className="px-4 py-3 font-medium text-right">Procesado</th>
                  <th className="px-4 py-3 font-medium text-right">Pendiente</th>
                  <th className="px-4 py-3 font-medium text-right">Drafts</th>
                  <th className="px-4 py-3 font-medium">Última sync</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {chats.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                      No hay chats registrados todavía. Lista los chats desde una
                      conexión activa para empezar.
                    </td>
                  </tr>
                )}
                {chats.map((chat) => {
                  const s = stats.get(chat.id)
                  const raw = s?.rawMessages ?? 0
                  const processed = s?.processed ?? 0
                  const pending = s?.pending ?? 0
                  const drafts = s?.drafts ?? 0
                  const ls = s?.lastSync ?? null
                  return (
                    <tr key={chat.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--foreground)]">{chat.title}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {chat.connection.label} · {chat.kind} ·{' '}
                          <span className="font-mono">{chat.tgChatId.toString()}</span>
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{raw}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--muted-foreground)]">
                        {processed}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {pending > 0 ? (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {pending}
                          </span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {drafts > 0 ? (
                          <span className="font-semibold text-[var(--foreground)]">{drafts}</span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                        {ls ? (
                          <>
                            <Badge
                              variant={ls.status === 'OK' ? 'green' : ls.status === 'FAILED' ? 'red' : 'outline'}
                            >
                              {ls.status}
                            </Badge>
                            <span className="ml-2">{formatDate(ls.startedAt)}</span>
                          </>
                        ) : (
                          'nunca'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {chat.isEnabled && (
                            <TelegramSyncButton chatId={chat.id} chatTitle={chat.title} />
                          )}
                          {pending > 0 && (
                            <TelegramReprocessButton chatId={chat.id} pending={pending} />
                          )}
                          {!chat.isEnabled && (
                            <Badge variant="red">DESHABILITADO</Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
