'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { reprocessChatPending } from '@/domains/ingestion/telegram/actions'

interface Props {
  chatId: string
  pending: number
}

type Result = { kind: 'ok'; enqueued: number } | { kind: 'err'; message: string } | null

export function TelegramReprocessButton({ chatId, pending }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Result>(null)

  useEffect(() => {
    if (!result || result.kind !== 'ok') return
    const t = setTimeout(() => setResult(null), 5000)
    return () => clearTimeout(t)
  }, [result])

  const handleClick = () => {
    setResult(null)
    startTransition(async () => {
      try {
        const res = await reprocessChatPending({ chatId })
        setResult({ kind: 'ok', enqueued: res.enqueued })
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
      <Button size="sm" variant="secondary" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Encolando…' : `Reprocesar ${pending}`}
      </Button>
      {result?.kind === 'ok' && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
          {result.enqueued} encolado(s)
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
