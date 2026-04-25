'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { getAdaptiveImageQuality } from '@/lib/connection'

interface SafeImageProps {
  src?: string | null
  alt: string
  fallback?: React.ReactNode
  fill?: boolean
  className?: string
  sizes?: string
  priority?: boolean
  /** Override the auto-derived quality. Use only when you have a strong
   *  reason (logo, hero, branding asset that must look the same on 2G). */
  quality?: number
}

/**
 * Safely renders images with proper fallback handling. Automatically
 * adapts next/image `quality` to the user's connection (#792) — slow
 * networks ship lighter assets, Save-Data is respected. Pass an
 * explicit `quality` prop to opt out (logos, hero images, etc.).
 *
 * Used throughout the app for product images.
 */
export function SafeImage({
  src,
  alt,
  fallback,
  fill,
  className,
  sizes,
  priority = false,
  quality,
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Derive once per mount. We deliberately don't re-derive on connection
  // change events: switching the quality mid-render would re-fetch every
  // image, defeating the purpose. Refresh = re-derive.
  const effectiveQuality = useMemo(() => quality ?? getAdaptiveImageQuality(), [quality])

  if (!src || hasError) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800/50 dark:via-slate-900/30 dark:to-slate-800/50 ${className || ''}`}
        title={`${alt} - Imagen no disponible`}
      >
        {fallback || (
          <div className="flex flex-col items-center justify-center gap-1.5 text-slate-300 dark:text-slate-700">
            <PhotoIcon className="h-6 w-6 opacity-50" />
            <span className="text-xs font-medium opacity-40">Sin foto</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {isLoading && (
        <div className={`absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700 ${className || ''}`} />
      )}
      <Image
        src={src}
        alt={alt}
        fill={fill}
        className={className}
        sizes={sizes}
        onError={() => setHasError(true)}
        onLoadingComplete={() => setIsLoading(false)}
        priority={priority}
        quality={effectiveQuality}
      />
    </>
  )
}

