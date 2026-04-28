'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { triggerChatSync } from '@/domains/ingestion/telegram/actions'

interface Props {
  chatId: string
  chatTitle: string
}

type Result = { kind: 'ok' } | { kind: 'err'; message: string } | null

export function TelegramSyncButton({ chatId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Result>(null)

  useEffect(() => {
    if (!result || result.kind !== 'ok') return
    const t = setTimeout(() => setResult(null), 4000)
    return () => clearTimeout(t)
  }, [result])

  const handleSync = () => {
    setResult(null)
    startTransition(async () => {
      try {
        await triggerChatSync({ chatId })
        setResult({ kind: 'ok' })
        router.refresh()
      } catch (err) {
        setResult({
          kind: 'err',
          message: err instanceof Error ? err.message : 'Error',
        })
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleSync} disabled={isPending}>
        {isPending ? 'Encolando…' : 'Sincronizar'}
      </Button>
      {result?.kind === 'ok' && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
          Sync encolado · refrescando…
        </p>
      )}
      {result?.kind === 'err' && (
        <p
          className="max-w-[14rem] text-right text-xs text-red-600 dark:text-red-400"
          title={result.message}
        >
          {result.message}
        </p>
      )}
    </div>
  )
}
