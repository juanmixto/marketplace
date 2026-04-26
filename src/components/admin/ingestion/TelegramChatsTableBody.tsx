'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { TelegramSyncButton } from './TelegramSyncButton'
import { TelegramReprocessButton } from './TelegramReprocessButton'

/**
 * Live tbody for the chats table on /admin/ingestion/telegram.
 *
 * The page server-renders the chat metadata (title, connection,
 * kind, tgChatId, isEnabled) and the initial stats snapshot. This
 * component then polls `/api/admin/ingestion/telegram/stats` every
 * 2 s while there is work in flight (pending > 0 OR a sync run that
 * looks recent), and computes a coarse ETA from the observed
 * processing velocity.
 *
 * Polling stops automatically when nothing has changed for a while,
 * so an idle page is not hammering the DB.
 */

export interface ChatMeta {
  id: string
  title: string
  kind: string
  tgChatId: string
  isEnabled: boolean
  connection: { id: string; label: string; status: string }
}

export interface ChatStatsSnapshot {
  chatId: string
  rawMessages: number
  processed: number
  pending: number
  drafts: number
  lastSync: { status: string; startedAt: string; finishedAt: string | null } | null
}

interface Props {
  chats: ChatMeta[]
  initialStats: ChatStatsSnapshot[]
}

interface VelocitySample {
  at: number
  processed: number
}

const POLL_INTERVAL_MS = 2_000
// If no row has changed for this long, back off polling. Saves DB
// when the operator parks the page on the screen overnight.
const IDLE_BACKOFF_MS = 60_000

export function TelegramChatsTableBody({ chats, initialStats }: Props) {
  const [stats, setStats] = useState<ChatStatsSnapshot[]>(initialStats)
  // Per-chat rolling sample of processed counts for ETA.
  const samplesRef = useRef<Map<string, VelocitySample[]>>(new Map())
  const lastChangeAtRef = useRef<number>(Date.now())

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const res = await fetch('/api/admin/ingestion/telegram/stats', {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { chats: ChatStatsSnapshot[] }
        if (cancelled) return
        const now = Date.now()
        // Detect change vs. previous render.
        setStats((prev) => {
          let changed = false
          if (prev.length !== body.chats.length) changed = true
          else {
            for (let i = 0; i < prev.length; i++) {
              const a = prev[i]!
              const b = body.chats.find((c) => c.chatId === a.chatId)
              if (!b) {
                changed = true
                break
              }
              if (
                a.rawMessages !== b.rawMessages ||
                a.processed !== b.processed ||
                a.pending !== b.pending ||
                a.drafts !== b.drafts
              ) {
                changed = true
                break
              }
            }
          }
          if (changed) lastChangeAtRef.current = now
          return body.chats
        })
        // Update velocity samples (keep last 10).
        for (const c of body.chats) {
          const arr = samplesRef.current.get(c.chatId) ?? []
          arr.push({ at: now, processed: c.processed })
          while (arr.length > 10) arr.shift()
          samplesRef.current.set(c.chatId, arr)
        }
      } catch {
        // Silent; the next tick will retry.
      } finally {
        if (cancelled) return
        const idleFor = Date.now() - lastChangeAtRef.current
        const next = idleFor > IDLE_BACKOFF_MS ? POLL_INTERVAL_MS * 5 : POLL_INTERVAL_MS
        timer = setTimeout(tick, next)
      }
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (chats.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={8} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
            No hay chats registrados todavía. Lista los chats desde una conexión
            activa para empezar.
          </td>
        </tr>
      </tbody>
    )
  }

  return (
    <tbody className="divide-y divide-[var(--border)]">
      {chats.map((chat) => {
        const s = stats.find((row) => row.chatId === chat.id)
        const raw = s?.rawMessages ?? 0
        const processed = s?.processed ?? 0
        const pending = s?.pending ?? 0
        const drafts = s?.drafts ?? 0
        const ls = s?.lastSync ?? null
        const eta = pending > 0 ? estimateEta(samplesRef.current.get(chat.id), pending) : null
        const extractionPct = processed > 0 ? (drafts / processed) * 100 : null
        return (
          <tr key={chat.id}>
            <td className="px-4 py-3">
              <p className="font-medium text-[var(--foreground)]">{chat.title}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {chat.connection.label} · {chat.kind} ·{' '}
                <span className="font-mono">{chat.tgChatId}</span>
              </p>
            </td>
            <td className="px-4 py-3 text-right align-top tabular-nums">{raw}</td>
            <td className="px-4 py-3 text-right align-top tabular-nums text-[var(--muted-foreground)]">
              {processed}
            </td>
            <td className="px-4 py-3 text-right align-top tabular-nums">
              {pending > 0 ? (
                <span className="inline-flex flex-col items-end leading-tight">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {pending}
                  </span>
                  {eta && (
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      ETA {eta}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[var(--muted-foreground)]">0</span>
              )}
            </td>
            <td className="px-4 py-3 text-right align-top tabular-nums">
              {drafts > 0 ? (
                <span className="font-semibold text-[var(--foreground)]">{drafts}</span>
              ) : (
                <span className="text-[var(--muted-foreground)]">0</span>
              )}
            </td>
            <td
              className="px-4 py-3 text-right align-top tabular-nums text-xs text-[var(--muted-foreground)]"
              title={
                extractionPct !== null && extractionPct < 1
                  ? 'Tasa baja es habitual en chats de discusión / foro. Phase 2 usa reglas conservadoras: solo extrae mensajes con un precio claramente formateado (p. ej. "5€/kg"). Un canal de ventas directas dará un % mucho más alto.'
                  : extractionPct !== null
                    ? 'Drafts extraídos sobre mensajes procesados.'
                    : undefined
              }
            >
              {extractionPct !== null ? formatPct(extractionPct) : '—'}
            </td>
            <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
              {ls ? (
                <>
                  <Badge
                    variant={
                      ls.status === 'OK'
                        ? 'green'
                        : ls.status === 'FAILED'
                          ? 'red'
                          : 'outline'
                    }
                  >
                    {ls.status}
                  </Badge>
                  <span className="ml-2">{formatRelative(ls.startedAt)}</span>
                </>
              ) : (
                'nunca'
              )}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {chat.isEnabled && <TelegramSyncButton chatId={chat.id} chatTitle={chat.title} />}
                {pending > 0 && <TelegramReprocessButton chatId={chat.id} pending={pending} />}
                {!chat.isEnabled && <Badge variant="red">DESHABILITADO</Badge>}
              </div>
            </td>
          </tr>
        )
      })}
    </tbody>
  )
}

/**
 * Coarse ETA: use the slope of `processed` over the last few samples
 * (jobs/second), divide pending by it. Returns null until we have at
 * least two samples spanning ≥ 4 s — anything tighter is too noisy
 * to display, and showing "ETA 2 min" that flips to "ETA 1 h" three
 * seconds later is worse than no ETA at all.
 */
function estimateEta(samples: VelocitySample[] | undefined, pending: number): string | null {
  if (!samples || samples.length < 2) return null
  const first = samples[0]!
  const last = samples[samples.length - 1]!
  const dt = (last.at - first.at) / 1000
  const dp = last.processed - first.processed
  if (dt < 4 || dp <= 0) return null
  const rate = dp / dt // jobs / second
  const seconds = pending / rate
  return formatDuration(seconds)
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return '0%'
  if (pct < 0.1) return '<0,1%'
  if (pct < 10) return `${pct.toFixed(1).replace('.', ',')}%`
  return `${Math.round(pct)}%`
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—'
  if (totalSeconds < 60) return `${Math.ceil(totalSeconds)}s`
  if (totalSeconds < 3600) {
    const m = Math.ceil(totalSeconds / 60)
    return `${m}m`
  }
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  })
}
