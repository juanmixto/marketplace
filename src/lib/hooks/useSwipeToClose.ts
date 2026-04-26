'use client'

import { useEffect, useRef, useState, type TouchEventHandler } from 'react'

interface Options {
  isOpen: boolean
  onClose: () => void
  /**
   * Direction the drawer slides off-screen when closing.
   * `'left'` = drawer attached to the left edge, swipe left to dismiss.
   * `'right'` = drawer attached to the right edge, swipe right to dismiss.
   */
  direction: 'left' | 'right'
  /** Pixel distance past which release dismisses. Default 96 (~30% of a 320px drawer). */
  thresholdPx?: number
  /** Velocity (px/ms) past which a flick dismisses regardless of distance. Default 0.4. */
  flickVelocity?: number
}

interface SwipeBindings {
  /** Translate-X to apply to the drawer (signed: negative for left-direction). */
  dragX: number
  /** Backdrop opacity multiplier (1 → 0 as drag progresses), already eased. */
  backdropOpacity: number
  /** Whether a drag is currently in flight (use to disable transition). */
  isDragging: boolean
  /** Spread these onto the drawer aside. */
  handlers: {
    onTouchStart: TouchEventHandler
    onTouchMove: TouchEventHandler
    onTouchEnd: TouchEventHandler
  }
}

/**
 * Touch-drag dismiss for a side drawer. Tracks finger displacement,
 * translates the drawer in real time, and on release either snaps back
 * (drag too small) or fires `onClose` (past distance threshold or fast
 * flick).
 *
 * The same gesture is used by Header.tsx (right-side drawer), VendorSidebar
 * and AdminSidebar (left-side drawers) — keeping the math in one place
 * prevents the three from drifting apart.
 */
export function useSwipeToClose({
  isOpen,
  onClose,
  direction,
  thresholdPx = 96,
  flickVelocity = 0.4,
}: Options): SwipeBindings {
  const startXRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setDragX(0)
      setIsDragging(false)
      startXRef.current = null
    }
  }, [isOpen])

  const closingDistance = Math.abs(dragX)
  const backdropOpacity =
    closingDistance > 0 ? Math.max(0, 1 - closingDistance / 320) : 1

  const handlers = {
    onTouchStart: (e => {
      const touch = e.touches[0]
      if (!touch) return
      startXRef.current = touch.clientX
      startTimeRef.current = performance.now()
      setIsDragging(true)
    }) as TouchEventHandler,
    onTouchMove: (e => {
      if (startXRef.current === null) return
      const touch = e.touches[0]
      if (!touch) return
      const dx = touch.clientX - startXRef.current
      // Only allow dragging in the closing direction.
      const constrained = direction === 'right' ? Math.max(0, dx) : Math.min(0, dx)
      setDragX(constrained)
    }) as TouchEventHandler,
    onTouchEnd: (() => {
      const startX = startXRef.current
      startXRef.current = null
      setIsDragging(false)
      if (startX === null) return
      const elapsed = performance.now() - startTimeRef.current
      const velocity = closingDistance / Math.max(elapsed, 1)
      if (closingDistance > thresholdPx || velocity > flickVelocity) {
        onClose()
      } else {
        setDragX(0)
      }
    }) as TouchEventHandler,
  }

  return {
    dragX,
    backdropOpacity,
    isDragging,
    handlers,
  }
}
