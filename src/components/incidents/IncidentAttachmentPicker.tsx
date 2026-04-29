'use client'

import { useId, useRef, useState } from 'react'
import Image from 'next/image'
import { useT } from '@/i18n'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from '@/lib/upload-validation'
import { INCIDENT_ATTACHMENTS_MAX } from '@/shared/types/incidents'

// Reused by OpenIncidentForm and IncidentReplyForm. Holds an internal
// list of uploaded URLs and exposes them via `value` / `onChange` so the
// parent stays the source of truth at submit time.
//
// Each picked file uploads immediately to /api/incidents/uploads. We
// don't bundle the binary into the form submit because (a) the rest of
// the incident payload is JSON, and (b) the same image can stay on the
// server even if the user navigates away — they can re-attach it later
// without re-uploading.

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

interface UploadResponse {
  url: string
  storageKey: string
}

const ACCEPT = ALLOWED_IMAGE_TYPES.join(',')
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)

export function IncidentAttachmentPicker({ value, onChange, disabled }: Props) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remaining = INCIDENT_ATTACHMENTS_MAX - value.length

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setError(null)

    const files = Array.from(fileList).slice(0, remaining)
    if (files.length < fileList.length) {
      setError(
        t('incident.attachments.maxReached').replace(
          '{max}',
          String(INCIDENT_ATTACHMENTS_MAX)
        )
      )
    }

    setUploading(true)
    const uploaded: string[] = []
    try {
      for (const file of files) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
          setError(t('incident.attachments.unsupportedType'))
          continue
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(t('incident.attachments.tooLarge').replace('{mb}', String(MAX_MB)))
          continue
        }
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/incidents/uploads', {
          method: 'POST',
          body: formData,
        })
        if (!response.ok) {
          setError(t('incident.attachments.uploadFailed'))
          continue
        }
        const data = (await response.json()) as UploadResponse
        uploaded.push(data.url)
      }
      if (uploaded.length > 0) {
        onChange([...value, ...uploaded])
      }
    } finally {
      setUploading(false)
      // Always reset so picking the same file twice still triggers
      // change. Without this, re-selecting an image after removing it
      // looks broken on iOS.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function removeAt(index: number) {
    const next = [...value]
    next.splice(index, 1)
    onChange(next)
  }

  const inputDisabled = disabled || uploading || remaining <= 0

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-[var(--foreground)]"
      >
        {t('incident.attachments.label')}
      </label>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {t('incident.attachments.hint')
          .replace('{max}', String(INCIDENT_ATTACHMENTS_MAX))
          .replace('{mb}', String(MAX_MB))}
      </p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        // `capture="environment"` hints that mobile browsers can offer
        // the rear camera as a source. Leaving `multiple` on means the
        // user still gets the gallery picker too — best of both.
        capture="environment"
        multiple
        disabled={inputDisabled}
        onChange={event => void handleFiles(event.target.files)}
        className="mt-2 block w-full text-sm text-[var(--foreground-soft)] file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:hover:bg-emerald-700 file:disabled:opacity-50"
      />

      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300">
          {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url, index) => (
            <li
              key={url}
              className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]"
            >
              <Image
                src={url}
                alt={t('incident.attachments.thumbAlt').replace(
                  '{index}',
                  String(index + 1)
                )}
                fill
                sizes="(max-width: 640px) 33vw, 25vw"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled}
                aria-label={t('incident.attachments.remove')}
                className="absolute right-1 top-1 inline-flex h-7 min-h-0 w-7 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
