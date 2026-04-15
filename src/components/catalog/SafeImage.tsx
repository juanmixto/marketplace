'use client'

import { useState } from 'react'
import Image from 'next/image'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'

interface SafeImageProps {
  src?: string | null
  alt: string
  fallback?: React.ReactNode
  fill?: boolean
  className?: string
  sizes?: string
}

/**
 * Safely renders images with proper fallback handling
 * Used throughout the app for product images
 */
export function SafeImage({
  src,
  alt,
  fallback,
  fill,
  className,
  sizes,
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const t = useT()

  if (!src || hasError) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-800/50 dark:via-slate-900/30 dark:to-slate-800/50 ${className || ''}`}
        title={`${alt} - ${t('safeImage.unavailable')}`}
      >
        {fallback || (
          <div className="flex flex-col items-center justify-center gap-1.5 text-slate-300 dark:text-slate-700">
            <PhotoIcon className="h-6 w-6 opacity-50" />
            <span className="text-xs font-medium opacity-40">{t('safeImage.noPhoto')}</span>
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
        priority={false}
      />
    </>
  )
}

