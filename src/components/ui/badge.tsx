import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        default:  'bg-gray-100 text-gray-700',
        green:    'bg-emerald-100 text-emerald-700',
        amber:    'bg-amber-100 text-amber-700',
        red:      'bg-red-100 text-red-700',
        blue:     'bg-blue-100 text-blue-700',
        purple:   'bg-purple-100 text-purple-700',
        outline:  'border border-gray-300 text-gray-600',
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
