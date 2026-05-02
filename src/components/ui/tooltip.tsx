'use client'

import { useId, useState, type ReactNode } from 'react'
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStyles,
  type Placement,
} from '@floating-ui/react'
import { cn } from '@/lib/utils'

type Side = 'top' | 'right' | 'bottom' | 'left'

interface TooltipProps {
  children: ReactNode
  content: ReactNode
  side?: Side
  className?: string
  /**
   * If the wrapped child is not a focusable control (e.g. a plain icon span),
   * set `interactive` so the wrapper itself becomes focusable. This is what
   * enables the touch fallback (focus + tap-to-open) on devices without hover.
   */
  interactive?: boolean
}

const PLACEMENT: Record<Side, Placement> = {
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
}

const VIEWPORT_PADDING = 8
const MAX_WIDTH_PX = 224

export function Tooltip({
  children,
  content,
  side = 'top',
  className,
  interactive = false,
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const labelId = useId()

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: PLACEMENT[side],
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: VIEWPORT_PADDING, fallbackAxisSideDirection: 'start' }),
      shift({ padding: VIEWPORT_PADDING }),
      size({
        padding: VIEWPORT_PADDING,
        apply({ availableWidth, elements }) {
          elements.floating.style.maxWidth = `${Math.min(availableWidth, MAX_WIDTH_PX)}px`
        },
      }),
    ],
  })

  const hover = useHover(context, { move: false, restMs: 50 })
  const focus = useFocus(context)
  const dismiss = useDismiss(context, { referencePress: true, outsidePress: true })
  const role = useRole(context, { role: 'tooltip' })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ])

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: { open: 150, close: 100 },
    initial: { opacity: 0 },
    open: { opacity: 1 },
  })

  // Floating UI's `refs.setReference` / `refs.setFloating` are stable callback
  // setters, not React refs — `react-hooks/refs` cannot tell them apart from
  // `useRef().current` access, hence the targeted disable on the two ref props.
  return (
    <>
      <span
        ref={refs.setReference}
        className={cn('inline-flex', className)}
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={open ? labelId : undefined}
        {...getReferenceProps()}
      >
        {children}
      </span>
      {isMounted && (
        <FloatingPortal>
          <span
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            id={labelId}
            style={{ ...floatingStyles, ...transitionStyles }}
            className="pointer-events-none z-50 w-max rounded-lg bg-slate-950 px-2.5 py-1.5 text-center text-[11px] font-medium text-white shadow-lg"
            {...getFloatingProps()}
          >
            {content}
          </span>
        </FloatingPortal>
      )}
    </>
  )
}
