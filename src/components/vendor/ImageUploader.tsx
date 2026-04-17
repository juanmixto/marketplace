'use client'

/**
 * Drag-and-drop image uploader for the vendor product form (#31).
 *
 * Wraps `POST /api/upload` (multipart/form-data with a `file` field).
 * Controlled component: parent owns the array of URLs, this just handles
 * the file selection / progress / preview UI and calls onChange when a
 * new upload completes or the user removes one.
 *
 * Validation (file type, size) is enforced server-side by
 * src/lib/upload-validation.ts. The client mirrors the rules to fail fast
 * with a friendly message before the network round-trip, but never trusts
 * its own check.
 */

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import {
  ArrowUpTrayIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import { compressImage } from '@/lib/image-compress'

const MAX_IMAGES = 6
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface UploadingItem {
  id: string
  name: string
}

interface ImageUploaderProps {
  urls: string[]
  onChange: (urls: string[]) => void
  disabled?: boolean
}

export function ImageUploader({ urls, onChange, disabled }: ImageUploaderProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<UploadingItem[]>([])

  const remainingSlots = Math.max(0, MAX_IMAGES - urls.length - uploading.length)

  const uploadOne = useCallback(
    async (rawFile: File): Promise<string | null> => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setUploading(prev => [...prev, { id, name: rawFile.name }])
      try {
        const file = await compressImage(rawFile, 'product')
        if (file.size > MAX_BYTES) {
          throw new Error(t('vendor.upload.tooLarge'))
        }
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'upload-failed')
        }
        const data = (await response.json()) as { url: string }
        return data.url
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? `${rawFile.name}: ${uploadError.message}`
            : t('vendor.upload.error')
        )
        return null
      } finally {
        setUploading(prev => prev.filter(item => item.id !== id))
      }
    },
    [t]
  )

  const acceptFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return
      setError(null)

      const files = Array.from(fileList).slice(0, remainingSlots)
      // Accumulate locally so sequential uploads don't read a stale `urls`
      // closure — each onChange would otherwise overwrite the previous.
      let current = urls
      for (const file of files) {
        if (!ACCEPTED_TYPES.has(file.type)) {
          setError(`${file.name}: ${t('vendor.upload.unsupported')}`)
          continue
        }
        const uploaded = await uploadOne(file)
        if (uploaded) {
          current = [...current, uploaded]
          onChange(current)
        }
      }
    },
    [onChange, remainingSlots, t, uploadOne, urls]
  )

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragActive(false)
    if (disabled) return
    void acceptFiles(event.dataTransfer.files)
  }

  function handleRemove(url: string) {
    onChange(urls.filter(u => u !== url))
  }

  function openCameraPicker() {
    if (dropZoneDisabled) return
    cameraInputRef.current?.click()
  }

  const dropZoneDisabled = disabled || remainingSlots === 0

  return (
    <div className="space-y-3 min-w-0">
      <label
        htmlFor="product-image-upload"
        onDragEnter={event => {
          event.preventDefault()
          if (!dropZoneDisabled) setDragActive(true)
        }}
        onDragOver={event => {
          event.preventDefault()
          if (!dropZoneDisabled) setDragActive(true)
        }}
        onDragLeave={event => {
          event.preventDefault()
          setDragActive(false)
        }}
        onDrop={handleDrop}
        className={`flex w-full min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition sm:flex-row sm:items-center ${
          dropZoneDisabled
            ? 'cursor-not-allowed border-[var(--border)] bg-[var(--surface-raised)] opacity-60'
            : dragActive
              ? 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/30'
              : 'border-[var(--border)] bg-[var(--surface-raised)] hover:border-emerald-300 dark:hover:border-emerald-700'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ArrowUpTrayIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-[var(--foreground)] sm:truncate">
              {t('vendor.upload.title')}
            </p>
            <p className="break-words text-xs text-[var(--muted)] sm:truncate">
              {t('vendor.upload.subtitle')}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-[var(--muted)] sm:self-center">
          {remainingSlots}/{MAX_IMAGES}
        </span>
        <input
          ref={inputRef}
          id="product-image-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          disabled={dropZoneDisabled}
          onChange={event => {
            void acceptFiles(event.target.files)
            // Reset so selecting the same file twice still fires `change`.
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
      </label>

      <div className="flex flex-col gap-2 sm:hidden">
        <button
          type="button"
          onClick={openCameraPicker}
          disabled={dropZoneDisabled}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('vendor.upload.takePhoto')}
        </button>
        <p className="text-xs text-[var(--muted)]">
          {t('vendor.upload.takePhotoHint')}
        </p>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={dropZoneDisabled}
        onChange={event => {
          void acceptFiles(event.target.files)
          if (cameraInputRef.current) cameraInputRef.current.value = ''
        }}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(urls.length > 0 || uploading.length > 0) && (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {urls.map(url => (
            <div
              key={url}
              className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]"
            >
              <Image src={url} alt="" fill className="object-cover" sizes="200px" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(url)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-red-500 p-1.5 text-white opacity-0 shadow-lg transition hover:bg-red-600 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={t('vendor.upload.remove')}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {uploading.map(item => (
            <div
              key={item.id}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 text-xs text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-300"
            >
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
              <span className="truncate px-2 text-center">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
