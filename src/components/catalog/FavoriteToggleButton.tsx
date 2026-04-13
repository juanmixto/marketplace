'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid'
import { useFavoritesStore } from '@/domains/catalog/favorites-store'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

interface Props {
  productId: string
  productName: string
  compact?: boolean
  className?: string
}

export function FavoriteToggleButton({
  productId,
  productName,
  compact = false,
  className,
}: Props) {
  const { status } = useSession()
  const router = useRouter()
  const t = useT()
  const { loadFavorites, toggle } = useFavoritesStore()
  const isFavorited = useFavoritesStore(s => s.productIds.has(productId))
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      loadFavorites()
    }
  }, [status, loadFavorites])

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (status !== 'authenticated') {
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    setToggling(true)
    await toggle(productId)

    if (!isFavorited) {
      trackAnalyticsEvent('add_to_favorites', {
        items: [createAnalyticsItem({ id: productId, name: productName })],
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
          'flex h-10 w-10 items-center justify-center rounded-lg border transition',
          isFavorited
            ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50'
            : 'border-[var(--border)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-red-500 dark:hover:text-red-400',
          toggling && 'opacity-50',
          className,
        )}
      >
        {isFavorited
          ? <HeartSolid className="h-5 w-5" />
          : <HeartOutline className="h-5 w-5" />
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
