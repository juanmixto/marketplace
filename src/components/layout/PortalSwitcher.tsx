'use client'

import { useState } from 'react'
import {
  BuildingStorefrontIcon,
  BriefcaseIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { switchPortal } from '@/domains/portals/actions'
import type { AvailablePortal, LoginPortalMode } from '@/lib/portals'
import type { TranslationKeys } from '@/i18n/locales'

interface Props {
  portals: AvailablePortal[]
  current: LoginPortalMode
}

const ICONS: Record<LoginPortalMode, typeof BuildingStorefrontIcon> = {
  buyer: BuildingStorefrontIcon,
  vendor: BriefcaseIcon,
  admin: ShieldCheckIcon,
}

export function PortalSwitcher({ portals, current }: Props) {
  const [open, setOpen] = useState(false)
  const t = useT()

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableWidth, elements }) {
          elements.floating.style.maxWidth = `${Math.min(availableWidth, 360)}px`
        },
      }),
    ],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true })
  const role = useRole(context, { role: 'menu' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  // Hide the control entirely when there's nothing to switch to.
  if (portals.length < 2) return null

  const currentPortal = portals.find(p => p.mode === current)
  const CurrentIcon = ICONS[current]

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={t('portalSwitcher.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
        {...getReferenceProps()}
      >
        <CurrentIcon className="h-4 w-4" />
        <span className="hidden sm:inline max-w-[140px] truncate">
          {currentPortal ? t(currentPortal.titleKey as TranslationKeys) : ''}
        </span>
        <ChevronDownIcon className={cn('h-3.5 w-3.5 text-[var(--muted)] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            // eslint-disable-next-line react-hooks/refs -- Floating UI's setFloating is a stable callback setter, not a useRef.
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[60] w-60 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-2xl ring-1 ring-black/5 backdrop-blur dark:ring-white/10"
            {...getFloatingProps()}
          >
            <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-[var(--muted)] border-b border-[var(--border)] mb-1">
              {t('portalSwitcher.current')}
            </p>
            {portals.map(portal => {
              const Icon = ICONS[portal.mode]
              const isCurrent = portal.mode === current
              return (
                <form key={portal.mode} action={switchPortal}>
                  <input type="hidden" name="target" value={portal.mode} />
                  <button
                    type="submit"
                    role="menuitem"
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition mx-1',
                      'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]',
                      isCurrent && 'bg-[var(--surface-raised)] text-[var(--foreground)]',
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 font-medium">
                        {t(portal.titleKey as TranslationKeys)}
                        {isCurrent && <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />}
                      </span>
                      <span className="block text-xs text-[var(--muted)] truncate">
                        {t(portal.descKey as TranslationKeys)}
                      </span>
                    </span>
                  </button>
                </form>
              )
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
