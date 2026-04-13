import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 hover:bg-emerald-700 active:scale-[0.98] focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 dark:focus-visible:ring-emerald-300',
        secondary:
          'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] shadow-sm hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] active:scale-[0.98] focus-visible:ring-[var(--border-strong)]',
        danger:
          'bg-red-600 text-white shadow-sm shadow-red-950/10 hover:bg-red-700 active:scale-[0.98] focus-visible:ring-red-500 dark:bg-red-500 dark:text-white dark:hover:bg-red-400 dark:focus-visible:ring-red-300',
        ghost:
          'text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] active:scale-[0.98] dark:hover:bg-[var(--surface-raised)] dark:hover:text-[var(--foreground)]',
        link:
          'h-auto p-0 text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400',
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
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && (
          <svg
            className="h-4 w-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
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
