import type { ReactNode } from 'react'

interface LegalPageProps {
  title: string
  updatedAt: string
  intro: string
  children: ReactNode
  eyebrow?: string
  updatedAtLabel?: string
}

export function LegalPage({
  title,
  updatedAt,
  intro,
  children,
  eyebrow = 'Información legal',
  updatedAtLabel = 'Última revisión',
}: LegalPageProps) {
  return (
    <div className="bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-8 shadow-sm sm:px-8">
        <div className="border-b border-[var(--border)] pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-[var(--foreground)]">{title}</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">{updatedAtLabel}: {updatedAt}</p>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--foreground-soft)]">{intro}</p>
        </div>

        <div className="space-y-8 py-6 text-sm leading-6 text-[var(--foreground-soft)]">
          {children}
        </div>
      </article>
    </div>
  )
}
