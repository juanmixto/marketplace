import Link from 'next/link'
import { SITE_NAME } from '@/lib/constants'
import { BrandMark } from '@/components/brand/BrandMark'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--background)] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.10),_transparent_35%)] dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.2),_transparent_35%)]" />
      <Link
        href="/"
        className="group relative mb-8 flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      >
        <BrandMark size={36} className="h-9 w-9 shrink-0" />
        <span className="text-xl font-bold text-[var(--foreground)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
          {SITE_NAME}
        </span>
      </Link>
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-xl shadow-black/10 backdrop-blur-sm dark:shadow-black/30">
        {children}
      </div>
    </div>
  )
}
