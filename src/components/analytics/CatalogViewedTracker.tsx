'use client'

import { useEffect } from 'react'
import { trackAnalyticsEvent } from '@/lib/analytics'
import { getBuyerFunnelContext, shouldFireOnce } from '@/lib/analytics-buyer-context'

interface Props {
  /**
   * Stable identifier for this listing surface. Drives the
   * once-per-surface-per-session dedupe so a buyer who navigates
   * /productos → /productos/<slug> → back doesn't emit two events for
   * the same listing render. Distinct values for home grid (`home`),
   * full catalog (`catalog`), search (`search`), and per-category
   * (`category:<slug>`) keep the funnel breakdown meaningful.
   */
  surface: string
  /** Optional category slug; null for unfiltered/home listings. */
  category?: string | null
}

/**
 * Fires `catalog.viewed` when a buyer lands on a catalog/listing
 * surface (home grid, /productos, /buscar, /productos?categoria=…).
 * Server pages mount this client component so the event captures the
 * referrer header from the actual navigation, not a synthetic one
 * from a server fetch.
 *
 * Dedupe key: `cf1.catalog.viewed.<surface>`. The same surface fires
 * once per session — see `getBuyerFunnelContext` for the common
 * properties contract.
 */
export function CatalogViewedTracker({ surface, category = null }: Props) {
  useEffect(() => {
    if (!shouldFireOnce(`cf1.catalog.viewed.${surface}`)) return
    const { device, referrer } = getBuyerFunnelContext()
    trackAnalyticsEvent('catalog.viewed', {
      surface,
      category,
      device,
      referrer,
    })
  }, [surface, category])

  return null
}
