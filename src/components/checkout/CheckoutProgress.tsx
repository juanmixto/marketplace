import { cn } from '@/lib/utils'

interface CheckoutProgressStep {
  label: string
  description: string
}

interface CheckoutProgressProps {
  title: string
  subtitle?: string
  currentStep: 1 | 2
  steps: [CheckoutProgressStep, CheckoutProgressStep]
}

export function CheckoutProgress({ title, subtitle, currentStep, steps }: CheckoutProgressProps) {
  const activeIndex = currentStep - 1

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">{subtitle}</p>
          ) : null}
        </div>
        <p className="shrink-0 whitespace-nowrap text-xs font-medium text-[var(--muted)]">
          {currentStep} / {steps.length}
        </p>
      </div>

      {/* Mobile: a single inline stepper (bullet — bullet) so we don't show
          two contradictory cards on a page that renders both sections in
          one form. Desktop keeps the labelled cards. */}
      <div className="mt-3 flex items-center gap-2 sm:hidden">
        {steps.map((step, index) => {
          const isActive = index === activeIndex
          const isDone = index < activeIndex
          return (
            <div key={step.label} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  isDone
                    ? 'border-emerald-500 bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950'
                    : isActive
                      ? 'border-emerald-500 bg-emerald-100 text-emerald-700 dark:border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)]',
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  'min-w-0 truncate text-xs font-medium',
                  isActive
                    ? 'text-[var(--foreground)]'
                    : 'text-[var(--muted)]',
                )}
              >
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="h-px flex-1 bg-[var(--border)]" />
              )}
            </div>
          )
        })}
      </div>

      <ol className="mt-4 hidden gap-3 sm:grid sm:grid-cols-2">
        {steps.map((step, index) => {
          const isActive = index === activeIndex
          const isDone = index < activeIndex

          return (
            <li
              key={step.label}
              className={cn(
                'rounded-xl border p-3 transition',
                isDone
                  ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/25'
                  : isActive
                    ? 'border-emerald-500 bg-[var(--surface-raised)] shadow-sm dark:border-emerald-400'
                    : 'border-[var(--border)] bg-[var(--surface-raised)]',
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                    isDone
                      ? 'border-emerald-500 bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950'
                      : isActive
                        ? 'border-emerald-500 bg-emerald-100 text-emerald-700 dark:border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)]',
                  )}
                >
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{step.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{step.description}</p>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
