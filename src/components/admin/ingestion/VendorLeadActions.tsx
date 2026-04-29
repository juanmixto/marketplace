'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  approveVendorLead,
  discardVendorLead,
} from '@/domains/ingestion/processing/admin/actions'

interface Props {
  vendorDraftId: string
  /** Disabled when the lead is already resolved (state != ENQUEUED). */
  disabled?: boolean
}

type Result =
  | { kind: 'approved'; vendorId: string; claimCode: string }
  | { kind: 'discarded' }
  | { kind: 'err'; message: string }
  | null

export function VendorLeadActions({ vendorDraftId, disabled }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Result>(null)

  useEffect(() => {
    if (!result || result.kind === 'err') return
    // After a successful action the page revalidates; clear the
    // local toast after a few seconds so a stale render doesn't keep
    // shouting "Aprobado" indefinitely.
    const t = setTimeout(() => setResult(null), 6000)
    return () => clearTimeout(t)
  }, [result])

  const handleApprove = () => {
    setResult(null)
    startTransition(async () => {
      try {
        const res = await approveVendorLead({ vendorDraftId })
        setResult({ kind: 'approved', ...res })
        router.refresh()
      } catch (err) {
        setResult({
          kind: 'err',
          message: err instanceof Error ? err.message : 'Error',
        })
      }
    })
  }

  const handleDiscard = () => {
    if (!confirm('¿Descartar este lead? El draft pasa a REJECTED y no se crea ningún Vendor.')) {
      return
    }
    setResult(null)
    startTransition(async () => {
      try {
        await discardVendorLead({ vendorDraftId })
        setResult({ kind: 'discarded' })
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
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleApprove} disabled={disabled || isPending}>
          {isPending ? 'Procesando…' : 'Aprobar como productor'}
        </Button>
        <Button variant="secondary" onClick={handleDiscard} disabled={disabled || isPending}>
          Descartar
        </Button>
      </div>
      {result?.kind === 'approved' && (
        <p className="max-w-xs text-right text-xs text-emerald-600 dark:text-emerald-400">
          Productor creado. Código de claim:{' '}
          <span className="font-mono">{result.claimCode}</span>
        </p>
      )}
      {result?.kind === 'discarded' && (
        <p className="text-xs text-[var(--muted-foreground)]">Lead descartado.</p>
      )}
      {result?.kind === 'err' && (
        <p
          className="max-w-xs text-right text-xs text-red-600 dark:text-red-400"
          title={result.message}
        >
          {result.message}
        </p>
      )}
    </div>
  )
}
