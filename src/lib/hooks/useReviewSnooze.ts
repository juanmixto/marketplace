'use client'

import { useCallback, useEffect, useState } from 'react'
import { REVIEW_SNOOZE_DAYS } from '@/domains/reviews'

const STORAGE_KEY = 'reviews.nudgeSnoozedUntil'
const MS_PER_DAY = 1000 * 60 * 60 * 24

interface SnoozeApi {
  /** True while the buyer's "Saltar todos" snooze is still in effect. */
  isSnoozed: boolean
  /** Activate the snooze for REVIEW_SNOOZE_DAYS days from now. */
  snooze: () => void
  /** Clear the snooze (mainly for tests / debug; not user-facing). */
  clearSnooze: () => void
}

/**
 * Client-side snooze for the review nudges. Lives in localStorage so the
 * back-end stays simple and the snooze is per-device by design — a buyer
 * who said "no thanks" on their phone shouldn't have the nudge show again
 * just because they opened the laptop, but the cost of not syncing is
 * acceptable for a soft-decay UX rule.
 *
 * The hook reads from storage on mount (so SSR renders without it, and
 * hydration enables it). The "ready" gate avoids flashing the banner for
 * a frame on first paint when the snooze is actually active.
 */
export function useReviewSnooze(): SnoozeApi & { ready: boolean } {
  const [isSnoozed, setIsSnoozed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        setReady(true)
        return
      }
      const until = Number(raw)
      if (Number.isFinite(until) && until > Date.now()) {
        setIsSnoozed(true)
      } else {
        // Expired — clear so we don't carry stale state forever.
        window.localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Storage disabled or quota exceeded — treat as no snooze.
    } finally {
      setReady(true)
    }
  }, [])

  const snooze = useCallback(() => {
    const until = Date.now() + REVIEW_SNOOZE_DAYS * MS_PER_DAY
    try {
      window.localStorage.setItem(STORAGE_KEY, String(until))
    } catch {
      // Best-effort; if storage fails the user just sees the next nudge.
    }
    setIsSnoozed(true)
  }, [])

  const clearSnooze = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {}
    setIsSnoozed(false)
  }, [])

  return { isSnoozed, snooze, clearSnooze, ready }
}
