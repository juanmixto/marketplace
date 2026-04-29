'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/button'
import { IncidentAttachmentPicker } from '@/components/incidents/IncidentAttachmentPicker'

interface Props {
  incidentId: string
}

// Posts to the same /api/incidents/[id]/messages endpoint the buyer uses.
// addIncidentMessage now accepts vendor authors when the caller has at
// least one OrderLine on the incident's order, so no separate route is
// needed.
export function VendorIncidentReplyForm({ incidentId }: Props) {
  const t = useT()
  const router = useRouter()
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (body.trim().length === 0) return

    setSubmitting(true)
    try {
      const response = await fetch(`/api/incidents/${incidentId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), attachments }),
      })
      if (!response.ok) {
        setError(t('incident.error.generic'))
        setSubmitting(false)
        return
      }
      setBody('')
      setAttachments([])
      router.refresh()
      setSubmitting(false)
    } catch {
      setError(t('incident.error.generic'))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <label
        htmlFor="vendor-incident-reply"
        className="block text-sm font-medium text-[var(--foreground)]"
      >
        {t('vendor.incidents.detail.replyLabel')}
      </label>
      <textarea
        id="vendor-incident-reply"
        rows={4}
        spellCheck
        autoCapitalize="sentences"
        value={body}
        onChange={event => setBody(event.target.value)}
        placeholder={t('vendor.incidents.detail.replyPlaceholder')}
        className="block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        maxLength={5000}
        required
        disabled={submitting}
      />
      <IncidentAttachmentPicker
        value={attachments}
        onChange={setAttachments}
        disabled={submitting}
      />
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          isLoading={submitting}
          disabled={submitting || body.trim().length === 0}
        >
          {submitting ? t('vendor.incidents.detail.sending') : t('vendor.incidents.detail.send')}
        </Button>
      </div>
    </form>
  )
}
