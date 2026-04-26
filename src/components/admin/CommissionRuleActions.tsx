'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteCommissionRule, toggleCommissionRule } from '@/domains/admin/actions'
import { useT } from '@/i18n'

interface Props {
  ruleId: string
  isActive: boolean
}

export function CommissionRuleActions({ ruleId, isActive }: Props) {
  const t = useT()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>, key: string) {
    setLoading(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.actions.trackingError'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
      <Button
        size="sm"
        variant="secondary"
        isLoading={loading === 'toggle'}
        onClick={() => run(() => toggleCommissionRule(ruleId), 'toggle')}
      >
        {isActive ? t('admin.actions.deactivate') : t('admin.actions.activate')}
      </Button>
      <Button
        size="sm"
        variant="danger"
        isLoading={loading === 'delete'}
        onClick={() => run(() => deleteCommissionRule(ruleId), 'delete')}
      >
        {t('admin.actions.delete')}
      </Button>
    </div>
  )
}
