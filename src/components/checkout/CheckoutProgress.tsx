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
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
        <p className="text-xs font-medium text-[var(--muted)]">
          {currentStep} / {steps.length}
        </p>
      </div>

      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
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
