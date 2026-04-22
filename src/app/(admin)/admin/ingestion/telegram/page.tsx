import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import {
  requireIngestionAdmin,
} from '@/domains/ingestion/authz'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TelegramAuthForm } from '@/components/admin/ingestion/TelegramAuthForm'
import { TelegramChatPicker } from '@/components/admin/ingestion/TelegramChatPicker'
import { TelegramSyncButton } from '@/components/admin/ingestion/TelegramSyncButton'
import { cn, formatMadridDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Ingestión · Telegram | Admin' }
export const dynamic = 'force-dynamic'

export default async function IngestionTelegramPage() {
  await requireIngestionAdmin()

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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/ingestion"
          className="text-xs text-[var(--muted-foreground)] hover:underline"
        >
          ← Volver a la cola de ingestión
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
          Ingestión · Telegram
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
          Conexiones a cuentas de Telegram, chats registrados para sincronización
          y disparo manual del sync. Toda la actividad pasa por el sidecar
          Telethon — si no está corriendo, las acciones fallan con un error
          claro.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            1 · Conectar cuenta de Telegram
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Primera vez: introduce el número de teléfono. Telegram mandará un
            código por SMS o por la app. Si la cuenta tiene 2FA (contraseña
            adicional), el sistema te la pedirá en un segundo paso.
          </p>
        </CardHeader>
        <CardBody>
          <TelegramAuthForm pendingConnections={pendingConnections} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            2 · Conexiones activas ({activeConnections.length})
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Cada conexión representa una sesión de Telegram autenticada que
            persiste entre reinicios del sidecar.
          </p>
        </CardHeader>
        <CardBody className="p-0">
          <div className="divide-y divide-[var(--border)]">
            {activeConnections.length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-[var(--muted-foreground)]">
                No hay conexiones activas todavía.
              </p>
            )}
            {activeConnections.map((conn) => (
              <div key={conn.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {conn.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Creada {formatMadridDate(conn.createdAt)} · {conn._count.chats} chat(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="green">ACTIVA</Badge>
                  <TelegramChatPicker
                    connectionId={conn.id}
                    connectionLabel={conn.label}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            3 · Chats sincronizables ({chats.length})
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Dispara una sincronización manual para traer los mensajes que no
            estén ya en la DB. El sync avanza un cursor por chat; no re-ingesta
            mensajes ya vistos.
          </p>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)]/40 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Chat</th>
                  <th className="px-4 py-3 font-medium">Conexión</th>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 font-medium">Mensajes</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {chats.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                      No hay chats registrados todavía.
                    </td>
                  </tr>
                )}
                {chats.map((chat) => (
                  <tr key={chat.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--foreground)]">{chat.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        tg: {chat.tgChatId.toString()}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                      {chat.connection.label}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{chat.kind}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {chat._count.messages}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={chat.isEnabled ? 'green' : 'red'}>
                        {chat.isEnabled ? 'HABILITADO' : 'DESHABILITADO'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {chat.isEnabled && (
                        <TelegramSyncButton chatId={chat.id} chatTitle={chat.title} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

// Keep cn import from utils for possible future highlighting.
void cn
