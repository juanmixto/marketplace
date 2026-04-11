'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface Props {
  images: string[]
  alt: string
}

export function ProductImageGallery({ images, alt }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)

  const prev = useCallback(() =>
    setActiveIndex(i => (i - 1 + images.length) % images.length), [images.length])

  const next = useCallback(() =>
    setActiveIndex(i => (i + 1) % images.length), [images.length])

  if (!images.length) {
    return (
      <div className="aspect-square overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm flex items-center justify-center text-8xl">
        🌿
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="group relative aspect-square overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm">
        <Image
          key={activeIndex}
          src={images[activeIndex]}
          alt={`${alt} — imagen ${activeIndex + 1}`}
          fill
          className="object-cover transition-opacity duration-200"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority={activeIndex === 0}
        />

        {images.length > 1 && (
          <>
            {/* Prev arrow */}
            <button
              type="button"
              onClick={prev}
              aria-label="Imagen anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>

            {/* Next arrow */}
            <button
              type="button"
              onClick={next}
              aria-label="Imagen siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>

            {/* Dot indicators (mobile) */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 sm:hidden">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Ir a imagen ${i + 1}`}
                  className={`rounded-full transition-all ${
                    i === activeIndex
                      ? 'h-1.5 w-4 bg-white'
                      : 'h-1.5 w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails strip (desktop, only when > 1 image) */}
      {images.length > 1 && (
        <div className="hidden gap-2 overflow-x-auto pb-1 sm:flex">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Ver imagen ${i + 1}`}
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                i === activeIndex
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
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
