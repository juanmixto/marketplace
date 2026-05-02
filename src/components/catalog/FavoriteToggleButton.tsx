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
  /**
   * Visual variant. `default` = inline pill ("Guardar / Guardado"),
   * `compact` = small square icon button (account portal etc),
   * `overlay` = circular icon button positioned over a product image
   * (catalog cards, favorites grid). Use `overlay` whenever the
   * button sits on top of an image so it contrasts against any photo.
   */
  variant?: 'default' | 'compact' | 'overlay'
  className?: string
}

export function FavoriteToggleButton({
  productId,
  productName,
  variant = 'default',
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

    // Capture the intent BEFORE awaiting toggle. `isFavorited` reflects
    // pre-mutation state (this render's closure); after toggle, the
    // store is the source of truth.
    const intent: 'add' | 'remove' = isFavorited ? 'remove' : 'add'

    setToggling(true)
    await toggle(productId)

    // The store rolls back on API failure (see favorites-store.ts), so
    // reading from getState() AFTER the await tells us the real outcome:
    // if the post-toggle state matches our intent, we succeeded.
    const isFavoritedAfter = useFavoritesStore.getState().productIds.has(productId)
    const succeeded =
      (intent === 'add' && isFavoritedAfter) ||
      (intent === 'remove' && !isFavoritedAfter)
    const result: 'success' | 'failure' = succeeded ? 'success' : 'failure'

    if (intent === 'add') {
      trackAnalyticsEvent('add_to_favorites', {
        result,
        items: [createAnalyticsItem({ id: productId, name: productName })],
      })
    } else {
      trackAnalyticsEvent('remove_from_favorites', {
        result,
        items: [createAnalyticsItem({ id: productId, name: productName })],
      })
    }

    // Invalidate the Next.js Router Cache so SSR pages that depend on
    // the favorites list (notably /cuenta/favoritos) re-fetch on the
    // next navigation. Without this, navigating to /cuenta/favoritos
    // shows a stale RSC payload and newly-favorited items don't appear
    // until a hard reload.
    router.refresh()

    setToggling(false)
  }

  const label = isFavorited ? t('favorites.saved') : t('favorites.save')

  if (variant === 'overlay') {
    return (
      <button
        onClick={handleToggle}
        disabled={toggling}
        aria-label={label}
        title={label}
        className={cn(
          'flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur-sm transition hover:bg-white dark:bg-black/50 dark:hover:bg-black/70',
          isFavorited
            ? 'text-red-600 dark:text-red-400'
            : 'text-[var(--foreground-soft)] hover:text-red-500 dark:hover:text-red-400',
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

  if (variant === 'compact') {
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
