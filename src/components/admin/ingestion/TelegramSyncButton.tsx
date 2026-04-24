'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { triggerChatSync } from '@/domains/ingestion/telegram/actions'

interface Props {
  chatId: string
  chatTitle: string
}

export function TelegramSyncButton({ chatId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lastJobId, setLastJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSync = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await triggerChatSync({ chatId })
        setLastJobId(res.jobId)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleSync} disabled={isPending}>
        {isPending ? 'Encolando…' : 'Sincronizar ahora'}
      </Button>
      {lastJobId && !error && (
        <p className="text-[10px] font-mono text-[var(--muted-foreground)]" title={lastJobId}>
          job: {lastJobId.slice(0, 10)}…
        </p>
      )}
      {error && (
        <p className="max-w-[14rem] text-right text-xs text-red-600 dark:text-red-400" title={error}>
          {error}
        </p>
      )}
    </div>
  )
}
