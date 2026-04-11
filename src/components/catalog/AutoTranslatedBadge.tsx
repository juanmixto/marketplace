import { LanguageIcon } from '@heroicons/react/24/outline'
import { Tooltip } from '@/components/ui/tooltip'
import type { ProductTranslationMeta } from '@/i18n/catalog-copy'

interface AutoTranslatedBadgeProps {
  translation?: ProductTranslationMeta | null
  className?: string
}

export function AutoTranslatedBadge({ translation, className = '' }: AutoTranslatedBadgeProps) {
  if (!translation?.isAutoTranslated) return null

  const title = translation.badgeTitle || translation.badgeLabel

  return (
    <Tooltip content={title} side="top">
      <span
        title={title}
        className={[
          'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1',
          'border-sky-200 bg-sky-50/90 text-[10px] font-semibold text-sky-700',
          'dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
          className,
        ].join(' ')}
      >
        <LanguageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{translation.badgeLabel}</span>
      </span>
    </Tooltip>
  )
}
