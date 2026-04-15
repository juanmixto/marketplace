'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'
import { Button } from '@/components/ui/button'

interface Props {
  orderId: string
}

const INCIDENT_TYPES = [
  'ITEM_NOT_RECEIVED',
  'ITEM_DAMAGED',
  'WRONG_ITEM',
  'MISSING_ITEMS',
  'QUALITY_ISSUE',
  'OTHER',
] as const

type IncidentType = (typeof INCIDENT_TYPES)[number]

export function OpenIncidentForm({ orderId }: Props) {
  const t = useT()
  const router = useRouter()
  const [type, setType] = useState<IncidentType>('ITEM_NOT_RECEIVED')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (description.trim().length < 10) {
      setError(t('incident.error.tooShort'))
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, type, description: description.trim() }),
      })
      if (!response.ok) {
        setError(t('incident.error.generic'))
        setSubmitting(false)
        return
      }
      const data = (await response.json()) as { incidentId: string }
      router.push(`/cuenta/incidencias/${data.incidentId}`)
    } catch {
      setError(t('incident.error.generic'))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label
          htmlFor="incident-type"
          className="block text-sm font-medium text-[var(--foreground)]"
        >
          {t('incident.typeLabel')}
        </label>
        <select
          id="incident-type"
          value={type}
          onChange={event => setType(event.target.value as IncidentType)}
          className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          disabled={submitting}
        >
          {INCIDENT_TYPES.map(option => (
            <option key={option} value={option}>
              {t(`incident.type.${option}` as TranslationKeys)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="incident-description"
          className="block text-sm font-medium text-[var(--foreground)]"
        >
          {t('incident.descriptionLabel')}
        </label>
        <textarea
          id="incident-description"
          rows={4}
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={t('incident.descriptionPlaceholder')}
          className="mt-1 block max-h-[60vh] min-h-32 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 sm:min-h-40"
          minLength={10}
          maxLength={5000}
          required
          disabled={submitting}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">{t('incident.descriptionHint')}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push('/cuenta/pedidos')}
          disabled={submitting}
        >
          {t('incident.cancel')}
        </Button>
        <Button type="submit" isLoading={submitting} disabled={submitting}>
          {submitting ? t('incident.submitting') : t('incident.submit')}
        </Button>
      </div>
    </form>
  )
}
