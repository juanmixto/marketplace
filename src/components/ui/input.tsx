import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="space-y-1.5 min-w-0">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--foreground-soft)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-base sm:text-sm text-[var(--foreground)] shadow-sm transition-colors',
            'border-[var(--border)] placeholder:text-[var(--muted-light)]',
            'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
            'dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-400 dark:focus:border-red-300 dark:focus:ring-red-400/25',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        />
        {error && <p className="text-xs text-red-500 dark:text-red-300">{error}</p>}
        {hint && !error && <p className="text-xs text-[var(--muted)]">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
