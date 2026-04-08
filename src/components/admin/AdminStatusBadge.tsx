import { cn } from '@/lib/utils'
import { getToneClasses } from '@/domains/admin/overview'

interface Props {
  label: string
  tone: 'amber' | 'blue' | 'emerald' | 'red' | 'slate'
}

export function AdminStatusBadge({ label, tone }: Props) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        getToneClasses(tone)
      )}
    >
      {label}
    </span>
  )
}
