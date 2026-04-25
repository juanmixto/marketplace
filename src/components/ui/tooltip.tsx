import { cn } from '@/lib/utils'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  /**
   * If the wrapped child is not a focusable control (e.g. a plain icon span),
   * set `interactive` so the wrapper itself becomes focusable. This is what
   * enables the touch fallback (focus-within) on devices without hover.
   */
  interactive?: boolean
}

const SIDE_STYLES: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  // On <sm we collapse left/right into bottom to avoid escaping the viewport.
  right:
    'left-full top-1/2 ml-2 -translate-y-1/2 max-sm:left-1/2 max-sm:top-full max-sm:mt-2 max-sm:ml-0 max-sm:-translate-x-1/2 max-sm:translate-y-0',
  bottom: 'left-1/2 top-full mt-2 -translate-x-1/2',
  left:
    'right-full top-1/2 mr-2 -translate-y-1/2 max-sm:left-1/2 max-sm:right-auto max-sm:top-full max-sm:mt-2 max-sm:mr-0 max-sm:-translate-x-1/2 max-sm:translate-y-0',
}

export function Tooltip({
  children,
  content,
  side = 'top',
  className,
  interactive = false,
}: TooltipProps) {
  return (
    <span
      className={cn('group/tooltip relative inline-flex', className)}
      tabIndex={interactive ? 0 : undefined}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          // Never exceed viewport minus a 1rem gutter on each side.
          'pointer-events-none absolute z-50 w-max max-w-[min(14rem,calc(100vw-2rem))] rounded-lg bg-slate-950 px-2.5 py-1.5 text-center text-[11px] font-medium text-white shadow-lg',
          'opacity-0 transition-opacity duration-150',
          'group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
          // Touch (coarse pointer): suppress hover-stuck state, rely on focus only.
          'pointer-coarse:group-hover/tooltip:opacity-0 pointer-coarse:group-focus-within/tooltip:opacity-100',
          SIDE_STYLES[side]
        )}
      >
        {content}
      </span>
    </span>
  )
}
