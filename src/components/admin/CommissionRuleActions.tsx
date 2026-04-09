'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteCommissionRule, toggleCommissionRule } from '@/domains/admin/actions'

interface Props {
  ruleId: string
  isActive: boolean
}

export function CommissionRuleActions({ ruleId, isActive }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>, key: string) {
    setLoading(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
      <Button
        size="sm"
        variant="secondary"
        isLoading={loading === 'toggle'}
        onClick={() => run(() => toggleCommissionRule(ruleId), 'toggle')}
      >
        {isActive ? 'Desactivar' : 'Activar'}
      </Button>
      <Button
        size="sm"
        variant="danger"
        isLoading={loading === 'delete'}
        onClick={() => run(() => deleteCommissionRule(ruleId), 'delete')}
      >
        Eliminar
      </Button>
    </div>
  )
}
