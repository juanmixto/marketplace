'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface Props {
  images: string[]
  alt: string
}

export function ProductImageGallery({ images, alt }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set())

  const validImages = useMemo(
    () => images.filter(url => !failedUrls.has(url)),
    [images, failedUrls],
  )

  const handleError = useCallback((url: string) => {
    setFailedUrls(prev => {
      const next = new Set(prev)
      next.add(url)
      return next
    })
    // If the currently shown image just failed, reset to 0 so we jump to the
    // first valid image on the next render.
    setActiveIndex(0)
  }, [])

  const safeIndex = Math.min(activeIndex, validImages.length - 1)

  const prev = useCallback(() =>
    setActiveIndex(i => (i - 1 + validImages.length) % validImages.length), [validImages.length])

  const next = useCallback(() =>
    setActiveIndex(i => (i + 1) % validImages.length), [validImages.length])

  // Touch swipe — triggers prev/next when the horizontal delta clears a
  // small threshold. Ignores mostly-vertical drags so page scroll wins.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current
    if (!start) return
    const touch = e.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    touchStartRef.current = null
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) next()
    else prev()
  }, [next, prev])

  if (!validImages.length) {
    return (
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm text-8xl">
        🌿
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div
        className="group relative aspect-square touch-pan-y select-none overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          key={validImages[safeIndex]}
          src={validImages[safeIndex]}
          alt={`${alt} — imagen ${safeIndex + 1}`}
          fill
          draggable={false}
          className="object-cover transition-opacity duration-200"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority={safeIndex === 0}
          onError={() => handleError(validImages[safeIndex])}
        />

        {validImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Imagen anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white shadow-md transition-opacity hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:p-1.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={next}
              aria-label="Imagen siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white shadow-md transition-opacity hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:p-1.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 sm:hidden">
              {validImages.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Ir a imagen ${i + 1}`}
                  className={`rounded-full transition-all ${
                    i === safeIndex
                      ? 'h-1.5 w-4 bg-white'
                      : 'h-1.5 w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails strip */}
      {validImages.length > 1 && (
        <div className="hidden gap-2 overflow-x-auto pb-1 sm:flex">
          {validImages.map((img, i) => (
            <button
              key={img}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Ver imagen ${i + 1}`}
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                i === safeIndex
                  ? 'border-emerald-500 shadow-md'
                  : 'border-[var(--border)] opacity-60 hover:opacity-90 hover:border-emerald-300'
              }`}
            >
              <Image
                src={img}
                alt={`${alt} — miniatura ${i + 1}`}
                fill
                className="object-cover"
                sizes="80px"
                onError={() => handleError(img)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
