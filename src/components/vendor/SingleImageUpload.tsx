'use client'

import { useRef, useState } from 'react'
import { ArrowUpTrayIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { isAllowedImageUrl } from '@/lib/image-validation'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface Props {
  label: string
  hint?: string
  value: string
  onChange: (url: string) => void
  shape?: 'circle' | 'square' | 'banner'
  id: string
}

export function SingleImageUpload({ label, hint, value, onChange, shape = 'square', id }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualUrl, setManualUrl] = useState(value)

  const previewValid = value !== '' && isAllowedImageUrl(value)

  const isBanner = shape === 'banner'
  const previewShapeClass =
    shape === 'circle'
      ? 'h-24 w-24 rounded-full'
      : isBanner
        ? 'aspect-[4/1] w-full rounded-xl'
        : 'h-24 w-24 rounded-xl'

  async function upload(file: File) {
    setError(null)
    if (!ACCEPTED.has(file.type)) {
      setError('Formato no soportado. Usa JPG, PNG o WebP.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('La imagen supera los 5 MB.')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Error al subir la imagen')
      }
      const data = (await res.json()) as { url: string }
      onChange(data.url)
      setManualUrl(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  function handleRemove() {
    onChange('')
    setManualUrl('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function commitManualUrl() {
    const trimmed = manualUrl.trim()
    if (trimmed === value) return
    if (trimmed === '') {
      onChange('')
      return
    }
    if (!isAllowedImageUrl(trimmed)) {
      setError('URL no permitida. Usa cloudinary.com, uploadthing.com, unsplash.com o una imagen subida aquí.')
      return
    }
    setError(null)
    onChange(trimmed)
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}

      <div className={isBanner ? 'space-y-3' : 'flex items-start gap-4'}>
        {previewValid && (
          <div className={`relative shrink-0 overflow-hidden border border-[var(--border)] bg-[var(--surface-raised,transparent)] ${previewShapeClass}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Vista previa" className="h-full w-full object-cover" />
          </div>
        )}
        <div className={isBanner ? 'space-y-2' : 'flex-1 space-y-2 min-w-0'}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-60 dark:hover:border-emerald-600 dark:hover:text-emerald-300"
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
              ) : (
                <ArrowUpTrayIcon className="h-4 w-4" />
              )}
              {uploading ? 'Subiendo...' : 'Subir desde mi equipo'}
            </button>
            {previewValid && (
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-red-600 hover:border-red-300 dark:text-red-400 dark:hover:border-red-800"
              >
                <XMarkIcon className="h-4 w-4" />
                Quitar
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <div>
            <input
              id={id}
              type="text"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              onBlur={commitManualUrl}
              placeholder="...o pega una URL (cloudinary, unsplash, uploadthing)"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
