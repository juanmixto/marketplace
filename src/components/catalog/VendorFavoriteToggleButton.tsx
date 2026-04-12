'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid'
import { useFavoritesStore } from '@/lib/favorites-store'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

interface Props {
  vendorId: string
  vendorName: string
  compact?: boolean
  className?: string
}

export function VendorFavoriteToggleButton({
  vendorId,
  vendorName,
  compact = false,
  className,
}: Props) {
  const { status } = useSession()
  const router = useRouter()
  const t = useT()
  const { loadVendorFavorites, toggleVendor } = useFavoritesStore()
  const isFavorited = useFavoritesStore(s => s.vendorIds.has(vendorId))
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      loadVendorFavorites()
    }
  }, [status, loadVendorFavorites])

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (status !== 'authenticated') {
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    setToggling(true)
    await toggleVendor(vendorId)

    if (!isFavorited) {
      trackAnalyticsEvent('add_to_favorites', {
        items: [createAnalyticsItem({ id: vendorId, name: vendorName, category: 'vendor' })],
      })
    }

    setToggling(false)
  }

  const label = isFavorited ? t('favorites.saved') : t('favorites.save')

  if (compact) {
    return (
      <button
        onClick={handleToggle}
        disabled={toggling}
        aria-label={label}
        title={label}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border transition',
          isFavorited
            ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50'
            : 'border-transparent bg-white/80 text-[var(--foreground-soft)] shadow-sm backdrop-blur-sm hover:bg-white hover:text-red-500 dark:bg-black/50 dark:hover:bg-black/70 dark:hover:text-red-400',
          toggling && 'opacity-50',
          className,
        )}
      >
        {isFavorited
          ? <HeartSolid className="h-4 w-4" />
          : <HeartOutline className="h-4 w-4" />
        }
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={toggling}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
        isFavorited
          ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50'
          : 'border border-[var(--border)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-red-500 dark:hover:text-red-400',
        toggling && 'opacity-50',
        className,
      )}
    >
      {isFavorited
        ? <HeartSolid className="h-5 w-5" />
        : <HeartOutline className="h-5 w-5" />
      }
      {label}
    </button>
  )
}
