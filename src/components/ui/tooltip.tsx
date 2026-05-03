'use client'

import { useId, useState, type ReactNode } from 'react'
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
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
      // No size() middleware: it was capping max-width to whatever
      // availableWidth Floating UI reported, which on a narrow side
      // panel (the filters) collapsed the tooltip to ~80px and
      // produced visually truncated text. Width is now controlled by
      // the className max-width cap below — `min(14rem, calc(100vw -
      // 2rem))` is generous enough for normal copy and still hard
      // bounded by the viewport. Wrapping is enabled via
      // `whitespace-normal break-words`, so any overflow becomes a
      // line break instead of a horizontal clip.
    ],
  })

  // Touch + mouse + keyboard, all via Floating UI interactions:
  //   - useHover: opens on mouse over (desktop). Disabled on touch by
  //     useHover's own `mouseOnly: true` default check (touch devices
  //     don't emit hover events that match its threshold).
  //   - useClick: opens on click / tap. This is what makes touch
  //     devices work — without it, the trigger is invisible to
  //     fingers, because hover never fires and focus only does on the
  //     keyboard tab cycle.
  //   - useFocus: opens on keyboard focus (a11y).
  //   - useDismiss: closes on Escape and outside-press. We intentionally
  //     do NOT pass `referencePress: true` — that would make a tap on
  //     the trigger close the tooltip, which on touch is the same gesture
  //     that just opened it (open-then-close in one tap = invisible).
  const hover = useHover(context, { move: false, restMs: 50 })
  const click = useClick(context, { keyboardHandlers: false })
  const focus = useFocus(context)
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true })
  const role = useRole(context, { role: 'tooltip' })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    click,
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
        // Stop click + touch from bubbling. Tooltips are commonly nested
        // inside <Link> / <button> ancestors (e.g. certification badges
        // inside ProductCard's <Link href="/productos/[slug]">). Without
        // these handlers, tapping the tooltip trigger on touch devices
        // navigates to the parent link before the tooltip can render —
        // useClick toggles open, but the parent's click fires too and
        // wins the navigation. preventDefault on touchEnd also blocks
        // the synthetic click that touch generates.
        {...getReferenceProps({
          onClick(event) {
            event.stopPropagation()
            event.preventDefault()
          },
          onTouchEnd(event) {
            event.stopPropagation()
          },
        })}
      >
        {children}
      </span>
      {isMounted && (
        <FloatingPortal>
          <div
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            id={labelId}
            style={{ ...floatingStyles, ...transitionStyles }}
            className="pointer-events-none z-50 w-max max-w-[min(14rem,calc(100vw-2rem))] whitespace-normal break-words rounded-lg bg-slate-950 px-2.5 py-1.5 text-center text-[11px] font-medium text-white shadow-lg"
            {...getFloatingProps()}
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
