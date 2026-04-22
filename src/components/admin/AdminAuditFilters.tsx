'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'

interface Props {
  action?: string
  entityType?: string
  actionGroups: Array<{ action: string; _count: { _all: number } }>
  entityGroups: Array<{ entityType: string; _count: { _all: number } }>
}

const DEBOUNCE_MS = 300

export function AdminAuditFilters({ action, entityType, actionGroups, entityGroups }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const normalizedAction = action ?? ''
  const normalizedEntityType = entityType ?? ''
  const [actionValue, setActionValue] = useState(normalizedAction)
  const [entityTypeValue, setEntityTypeValue] = useState(normalizedEntityType)

  useEffect(() => {
    setActionValue(normalizedAction)
    setEntityTypeValue(normalizedEntityType)
  }, [normalizedAction, normalizedEntityType])

  const href = useMemo(
    () => buildAuditHref({ action: actionValue, entityType: entityTypeValue }),
    [actionValue, entityTypeValue]
  )

  useEffect(() => {
    if (actionValue === normalizedAction && entityTypeValue === normalizedEntityType) {
      return
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(href, { scroll: false })
      })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [actionValue, entityTypeValue, href, normalizedAction, normalizedEntityType, router, startTransition])

  const clearFilters = () => {
    setActionValue('')
    setEntityTypeValue('')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">Accion</span>
          <select
            name="action"
            value={actionValue}
            onChange={e => setActionValue(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="">Todas</option>
            {actionGroups.map(group => (
              <option key={group.action} value={group.action}>
                {group.action} ({group._count._all})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">Entidad</span>
          <select
            name="entityType"
            value={entityTypeValue}
            onChange={e => setEntityTypeValue(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="">Todas</option>
            {entityGroups.map(group => (
              <option key={group.entityType} value={group.entityType}>
                {group.entityType} ({group._count._all})
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={clearFilters} disabled={isPending}>
            <ArrowPathIcon className="h-4 w-4" />
            Limpiar
          </Button>
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Se aplica automáticamente al cambiar filtros. El historial mantiene el estado en la URL.
      </p>
    </div>
  )
}

function buildAuditHref(filters: { action: string; entityType: string }) {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.entityType) params.set('entityType', filters.entityType)
  const query = params.toString()
  return query ? `/admin/auditoria?${query}` : '/admin/auditoria'
}
