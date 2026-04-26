'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { UserCircleIcon } from '@heroicons/react/24/outline'
import { formatDate } from '@/lib/utils'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

// Mirror the Prisma IncidentResolution enum values
const RESOLUTION_KEYS: Array<{ value: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REPLACEMENT' | 'STORE_CREDIT' | 'REJECTED'; key: TranslationKeys }> = [
  { value: 'REFUND_FULL',    key: 'admin.incidentDetail.resolutionType.refundFull' },
  { value: 'REFUND_PARTIAL', key: 'admin.incidentDetail.resolutionType.refundPartial' },
  { value: 'REPLACEMENT',    key: 'admin.incidentDetail.resolutionType.replacement' },
  { value: 'STORE_CREDIT',   key: 'admin.incidentDetail.resolutionType.storeCredit' },
  { value: 'REJECTED',       key: 'admin.incidentDetail.resolutionType.rejected' },
]

const messageSchema = z.object({
  body: z.string().min(1).max(5000),
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
  const t = useT()

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
      if (!res.ok) throw new Error((await res.json()).message ?? t('admin.incidentDetail.errorSend'))
      const msg: Message = await res.json()
      setMessages(prev => [...prev, msg])
      msgForm.reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.incidentDetail.errorSendMessage'))
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
      if (!res.ok) throw new Error((await res.json()).message ?? t('admin.incidentDetail.errorResolve'))
      setResolved(true)
      setShowResolve(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.incidentDetail.errorResolveIncident'))
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
          {t('admin.incidentDetail.conversationTitle').replace('{count}', String(messages.length))}
        </h2>

        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">
            {t('admin.incidentDetail.empty')}
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
                            {t('admin.incidentDetail.adminBadge')}
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
            {t('admin.incidentDetail.addCommentLabel')}
          </label>
          <textarea
            {...msgForm.register('body')}
            rows={3}
            spellCheck
            autoCapitalize="sentences"
            placeholder={t('admin.incidentDetail.addCommentPlaceholder')}
            className={inputCls}
          />
          {msgForm.formState.errors.body && (
            <p className="text-xs text-red-600 dark:text-red-400">{t('admin.incidentDetail.errorMessageEmpty')}</p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? t('admin.incidentDetail.sending') : t('admin.incidentDetail.sendMessage')}
          </Button>
        </form>
      </div>

      {/* ── Resolve panel ──────────────────────────────────────── */}
      {!resolved ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-[var(--foreground)]">{t('admin.incidentDetail.resolvePanelTitle')}</h2>

          {!showResolve ? (
            <Button onClick={() => setShowResolve(true)}>{t('incident.markResolved')}</Button>
          ) : (
            <form onSubmit={resForm.handleSubmit(onResolve)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">
                  {t('admin.incidentDetail.resolutionTypeLabel')}
                </label>
                <select {...resForm.register('resolution')} className={inputCls}>
                  <option value="">{t('incident.selectOption')}</option>
                  {RESOLUTION_KEYS.map(o => (
                    <option key={o.value} value={o.value}>{t(o.key)}</option>
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
                  {t('admin.incidentDetail.internalNoteLabel')}
                </label>
                <textarea
                  {...resForm.register('internalNote')}
                  rows={3}
                  spellCheck
                  autoCapitalize="sentences"
                  placeholder={t('admin.incidentDetail.internalNotePlaceholder')}
                  className={inputCls}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? t('admin.incidentDetail.resolving') : t('admin.incidentDetail.confirmResolution')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowResolve(false)}
                  disabled={busy}
                >
                  {t('admin.actions.cancel')}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {t('admin.incidentDetail.resolvedNotice')}
        </div>
      )}
    </div>
  )
}
