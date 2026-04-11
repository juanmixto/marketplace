'use client'

import { useState } from 'react'
import Image from 'next/image'
import { XMarkIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ImagePreviewProps {
  urls: string[]
  onRemove?: (url: string) => void
}

export function ImagePreview({ urls, onRemove }: ImagePreviewProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  const handleImageError = (url: string) => {
    setFailedImages(prev => new Set([...prev, url]))
  }

  if (urls.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/30 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          📸 Aquí verás el preview de tus imágenes
        </p>
        <p className="mt-1 text-xs text-emerald-600/70 dark:text-emerald-400/60">
          Copia y pega URLs de Cloudinary, UploadThing o Unsplash
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          Preview de imágenes
        </h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          <CheckIcon className="h-3.5 w-3.5" />
          {urls.length} cargada{urls.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {urls.map((url, idx) => {
          const hasFailed = failedImages.has(url)

          return (
            <div
              key={`${url}-${idx}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-emerald-200 bg-gradient-to-br from-gray-50 to-gray-100 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md dark:border-emerald-900/40 dark:from-gray-900 dark:to-gray-800 dark:hover:border-emerald-700"
            >
              {!hasFailed ? (
                <>
                  <Image
                    src={url}
                    alt={`Preview ${idx + 1}`}
                    fill
                    className="object-cover"
                    onError={() => handleImageError(url)}
                    sizes="200px"
                  />
                  <div className="absolute inset-0 bg-black/0 transition-all group-hover:bg-black/10" />
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 bg-red-50 p-3 text-center dark:bg-red-950/20">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-500 dark:text-red-400" />
                  <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                    URL inválida
                  </span>
                </div>
              )}

              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(url)}
                  className="absolute right-1.5 top-1.5 hidden rounded-full bg-red-500 p-1.5 text-white shadow-lg transition-all group-hover:flex hover:bg-red-600 active:scale-95"
                  title="Eliminar imagen"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}

              {!hasFailed && (
                <div className="absolute left-1.5 top-1.5 hidden rounded-full bg-emerald-500 p-1.5 text-white group-hover:flex">
                  <CheckIcon className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
