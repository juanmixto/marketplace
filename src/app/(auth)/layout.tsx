import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2.5 group"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-[11px] font-extrabold text-white shadow-sm">
          MP
        </span>
        <span className="text-xl font-bold text-[var(--foreground)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
          {SITE_NAME}
        </span>
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
        {children}
      </div>
    </div>
  )
}
