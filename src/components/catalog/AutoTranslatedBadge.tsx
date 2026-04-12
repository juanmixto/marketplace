import { LanguageIcon } from '@heroicons/react/24/outline'
import { Tooltip } from '@/components/ui/tooltip'
import type { ProductTranslationMeta } from '@/i18n/catalog-copy'

interface AutoTranslatedBadgeProps {
  translation?: ProductTranslationMeta | null
  className?: string
  variant?: 'compact' | 'full'
}

export function AutoTranslatedBadge({
  translation,
  className = '',
  variant = 'compact',
}: AutoTranslatedBadgeProps) {
  if (!translation?.isAutoTranslated) return null

  const title = translation.badgeTitle || translation.badgeLabel
  const shortLabel = translation.sourceLocale?.toUpperCase() ?? ''

  if (variant === 'full') {
    return (
      <Tooltip content={title} side="top">
        <span
          title={title}
          aria-label={translation.badgeLabel}
          className={[
            'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1',
            'border-sky-200 bg-sky-50/90 text-xs font-semibold text-sky-700',
            'dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
            className,
          ].join(' ')}
        >
          <LanguageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{translation.badgeLabel}</span>
        </span>
      </Tooltip>
    )
  }

  return (
    <Tooltip content={title} side="top">
      <span
        title={title}
        aria-label={translation.badgeLabel}
        className={[
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
          'border-sky-200 bg-sky-50/90 text-[10px] font-semibold text-sky-700',
          'dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
          className,
        ].join(' ')}
      >
        <LanguageIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{shortLabel}</span>
      </span>
    </Tooltip>
  )
}
