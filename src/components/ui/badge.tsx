import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide',
  {
    variants: {
      variant: {
        default:  'bg-[var(--surface-raised)] text-[var(--foreground-soft)] border border-[var(--border)]',
        green:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        amber:    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        red:      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
        blue:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
        purple:   'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
        outline:  'border border-[var(--border-strong)] text-[var(--muted)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
