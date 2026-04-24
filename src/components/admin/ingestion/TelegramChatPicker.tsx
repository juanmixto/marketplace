'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  enableIngestionChat,
  listTelegramChats,
  type AvailableChat,
} from '@/domains/ingestion/telegram/actions'

interface Props {
  connectionId: string
  connectionLabel: string
}

export function TelegramChatPicker({ connectionId, connectionLabel }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [chats, setChats] = useState<AvailableChat[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set())

  const loadChats = () => {
    setError(null)
    setOpen(true)
    if (chats !== null) return // already loaded
    startTransition(async () => {
      try {
        const result = await listTelegramChats({ connectionId })
        setChats(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  const enable = (chat: AvailableChat) => {
    setError(null)
    startTransition(async () => {
      try {
        await enableIngestionChat({
          connectionId,
          tgChatId: chat.tgChatId,
          title: chat.title,
          kind: chat.kind,
        })
        setEnabledIds((prev) => new Set(prev).add(chat.tgChatId))
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={loadChats} disabled={isPending}>
        Listar chats…
      </Button>
    )
  }

  return (
    <div className="w-full max-w-xl">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Chats en {connectionLabel}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Cerrar
          </button>
        </div>
        {chats === null && !error && (
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Cargando chats desde Telegram…
          </p>
        )}
        {chats !== null && chats.length === 0 && (
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            La cuenta no es miembro de ningún grupo/canal visible.
          </p>
        )}
        {chats !== null && chats.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {chats.map((chat) => {
              const alreadyEnabled = enabledIds.has(chat.tgChatId)
              return (
                <li
                  key={chat.tgChatId}
                  className="flex items-center justify-between gap-3 rounded border border-[var(--border)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[var(--foreground)]">{chat.title}</p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {chat.kind} · tg {chat.tgChatId}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={alreadyEnabled ? 'secondary' : 'primary'}
                    disabled={alreadyEnabled || isPending}
                    onClick={() => enable(chat)}
                  >
                    {alreadyEnabled ? 'Habilitado' : 'Habilitar sync'}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-50/60 px-3 py-2 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
