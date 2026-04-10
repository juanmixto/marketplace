'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { UserCircleIcon } from '@heroicons/react/24/outline'
import { formatDate } from '@/lib/utils'

// Mirror the Prisma IncidentResolution enum values
const RESOLUTION_OPTIONS = [
  { value: 'REFUND_FULL',    label: 'Reembolso total' },
  { value: 'REFUND_PARTIAL', label: 'Reembolso parcial' },
  { value: 'REPLACEMENT',   label: 'Reenvío / sustitución' },
  { value: 'STORE_CREDIT',  label: 'Crédito en tienda' },
  { value: 'REJECTED',      label: 'Rechazo de reclamación' },
] as const

const messageSchema = z.object({
  body: z.string().min(1, 'El mensaje no puede estar vacío').max(5000),
})

const resolutionSchema = z.object({
  resolution: z.enum(['REFUND_FULL', 'REFUND_PARTIAL', 'REPLACEMENT', 'STORE_CREDIT', 'REJECTED']),
  internalNote: z.string().max(2000).optional(),
})

type MessageInput   = z.infer<typeof messageSchema>
type ResolutionInput = z.infer<typeof resolutionSchema>

interface Message {
  id: string
  body: string
  authorName: string
  authorRole: string
  createdAt: Date | string
}

interface Props {
  incidentId: string
  status: string
  messages: Message[]
}

export function IncidentDetailClient({ incidentId, status, messages: initial }: Props) {
  const [messages, setMessages]           = useState<Message[]>(initial)
  const [showResolve, setShowResolve]     = useState(false)
  const [busy, setBusy]                   = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [resolved, setResolved]           = useState(status === 'RESOLVED' || status === 'CLOSED')

  const msgForm = useForm<MessageInput>({ resolver: zodResolver(messageSchema) })
  const resForm = useForm<ResolutionInput>({ resolver: zodResolver(resolutionSchema) })

  async function onAddMessage(data: MessageInput) {
    try {
      setError(null)
      setBusy(true)
      const res = await fetch(`/api/admin/incidents/${incidentId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).message ?? 'Error al enviar')
      const msg: Message = await res.json()
      setMessages(prev => [...prev, msg])
      msgForm.reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar mensaje')
    } finally {
      setBusy(false)
    }
  }

  async function onResolve(data: ResolutionInput) {
    try {
      setError(null)
      setBusy(true)
      const res = await fetch(`/api/admin/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).message ?? 'Error al resolver')
      setResolved(true)
      setShowResolve(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al resolver incidencia')
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20'

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Message thread ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-[var(--foreground)]">
          Conversación ({messages.length})
        </h2>

        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">
            Sin mensajes aún. Sé el primero en escribir.
          </p>
        ) : (
          <ul className="mb-6 max-h-96 space-y-3 overflow-y-auto">
            {messages.map(msg => (
              <li key={msg.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4">
                <div className="flex gap-3">
                  <UserCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--muted)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--foreground)]">
                        {msg.authorName}
                        {msg.authorRole === 'ADMIN' || msg.authorRole.startsWith('ADMIN') ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                            Admin
                          </span>
                        ) : null}
                      </span>
                      <time className="text-xs text-[var(--muted)]">{formatDate(msg.createdAt)}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--foreground-soft)]">
                      {msg.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add message */}
        <form onSubmit={msgForm.handleSubmit(onAddMessage)} className="space-y-3 border-t border-[var(--border)] pt-4">
          <label className="block text-sm font-medium text-[var(--foreground)]">
            Añadir comentario
          </label>
          <textarea
            {...msgForm.register('body')}
            rows={3}
            placeholder="Escribe tu respuesta o nota interna…"
            className={inputCls}
          />
          {msgForm.formState.errors.body && (
            <p className="text-xs text-red-600 dark:text-red-400">{msgForm.formState.errors.body.message}</p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar mensaje'}
          </Button>
        </form>
      </div>

      {/* ── Resolve panel ──────────────────────────────────────── */}
      {!resolved ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-[var(--foreground)]">Resolver incidencia</h2>

          {!showResolve ? (
            <Button onClick={() => setShowResolve(true)}>Marcar como resuelta</Button>
          ) : (
            <form onSubmit={resForm.handleSubmit(onResolve)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">
                  Tipo de resolución *
                </label>
                <select {...resForm.register('resolution')} className={inputCls}>
                  <option value="">Selecciona…</option>
                  {RESOLUTION_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {resForm.formState.errors.resolution && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {resForm.formState.errors.resolution.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">
                  Nota interna (opcional)
                </label>
                <textarea
                  {...resForm.register('internalNote')}
                  rows={3}
                  placeholder="Detalles adicionales para el equipo…"
                  className={inputCls}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Resolviendo…' : 'Confirmar resolución'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowResolve(false)}
                  disabled={busy}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          Esta incidencia está marcada como resuelta.
        </div>
      )}
    </div>
  )
}
