import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-gray-950 dark:focus-visible:ring-emerald-400',
        secondary:
          'bg-[var(--surface)] text-[var(--foreground-soft)] border border-[var(--border)] shadow-sm hover:bg-[var(--surface-raised)] hover:border-[var(--border-strong)] active:scale-[0.98] focus-visible:ring-[var(--border-strong)]',
        danger:
          'bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[0.98] focus-visible:ring-red-500 dark:bg-red-500 dark:hover:bg-red-400',
        ghost:
          'text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] active:scale-[0.98]',
        link:
          'text-emerald-600 underline-offset-4 hover:underline p-0 h-auto dark:text-emerald-400',
      },
      size: {
        sm:   'h-8 px-3 text-xs',
        md:   'h-10 px-4 text-sm',
        lg:   'h-11 px-6 text-sm',
        xl:   'h-12 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
