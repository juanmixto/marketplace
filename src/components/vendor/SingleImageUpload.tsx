'use client'

import { useRef, useState } from 'react'
import {
  CameraIcon,
  PhotoIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  LinkIcon,
} from '@heroicons/react/24/outline'
import { isAllowedImageUrl } from '@/lib/image-validation'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface Props {
  label: string
  value: string
  onChange: (url: string) => void
  shape?: 'circle' | 'square' | 'banner'
  id: string
}

export function SingleImageUpload({ label, value, onChange, shape = 'square', id }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [manualUrl, setManualUrl] = useState(value)

  const hasImage = value !== '' && isAllowedImageUrl(value)

  const isBanner = shape === 'banner'
  const isCircle = shape === 'circle'
  const frameClass = isCircle
    ? 'h-32 w-32 rounded-full'
    : isBanner
      ? 'aspect-[4/1] w-full rounded-2xl'
      : 'h-32 w-32 rounded-2xl'

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

  function openPicker() {
    if (uploading) return
    inputRef.current?.click()
  }

  function handleRemove(event: React.MouseEvent) {
    event.stopPropagation()
    onChange('')
    setManualUrl('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleDrop(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragActive(false)
    if (uploading) return
    const file = event.dataTransfer.files?.[0]
    if (file) void upload(file)
  }

  function commitManualUrl() {
    const trimmed = manualUrl.trim()
    if (trimmed === value) return
    if (trimmed === '') {
      onChange('')
      return
    }
    if (!isAllowedImageUrl(trimmed)) {
      setError('URL no permitida. Usa cloudinary.com, uploadthing.com o unsplash.com.')
      return
    }
    setError(null)
    onChange(trimmed)
  }

  const EmptyIcon = isCircle ? CameraIcon : PhotoIcon

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
        <button
          type="button"
          onClick={() => setShowUrlInput(v => !v)}
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          <LinkIcon className="h-3.5 w-3.5" />
          {showUrlInput ? 'Ocultar URL' : 'Pegar URL'}
        </button>
      </div>

      <button
        type="button"
        onClick={openPicker}
        onDragEnter={e => {
          e.preventDefault()
          if (!uploading) setDragActive(true)
        }}
        onDragOver={e => {
          e.preventDefault()
          if (!uploading) setDragActive(true)
        }}
        onDragLeave={e => {
          e.preventDefault()
          setDragActive(false)
        }}
        onDrop={handleDrop}
        aria-label={hasImage ? `Cambiar ${label.toLowerCase()}` : `Subir ${label.toLowerCase()}`}
        className={`group relative block overflow-hidden border-2 border-dashed transition ${frameClass} ${
          dragActive
            ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
            : hasImage
              ? 'border-transparent'
              : 'border-[var(--border)] bg-[var(--surface-raised)] hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/20'
        } ${uploading ? 'cursor-wait' : 'cursor-pointer'}`}
      >
        {hasImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-full w-full object-cover" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100">
              <span className="inline-flex items-center gap-1.5">
                <CameraIcon className="h-4 w-4" />
                Cambiar
              </span>
            </span>
          </>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-center text-[var(--muted)]">
            <EmptyIcon className="h-7 w-7" />
            <span className="text-xs font-medium">
              {isBanner ? 'Arrastra o haz clic para subir' : 'Subir foto'}
            </span>
          </span>
        )}

        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </span>
        )}
      </button>

      {hasImage && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-red-600 dark:hover:text-red-400"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
          Quitar imagen
        </button>
      )}

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

      {showUrlInput && (
        <input
          id={id}
          type="text"
          value={manualUrl}
          onChange={e => setManualUrl(e.target.value)}
          onBlur={commitManualUrl}
          placeholder="https://res.cloudinary.com/..."
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
        />
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
