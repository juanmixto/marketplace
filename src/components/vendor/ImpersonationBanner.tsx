import { getServerT } from '@/i18n/server'
import { endImpersonation } from '@/domains/impersonation/actions'

interface Props {
  adminEmail: string | null
  vendorLabel: string
  remainingSeconds: number
  readOnly: boolean
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '0m'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export async function ImpersonationBanner({ adminEmail, vendorLabel, remainingSeconds, readOnly }: Props) {
  const t = await getServerT()
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-red-700 bg-red-600 px-4 py-2 text-sm font-medium text-white dark:bg-red-700 dark:border-red-800"
      data-testid="impersonation-banner"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">{'\u26A0'}</span>
        <span>
          {t('impersonation.banner.prefix')} <strong>{vendorLabel}</strong>
          {adminEmail ? (
            <>
              {' · '}
              {t('impersonation.banner.admin')}:{' '}
              <strong>{adminEmail}</strong>
            </>
          ) : null}
          {' · '}
          {t('impersonation.banner.expiresIn')} {formatRemaining(remainingSeconds)}
          {readOnly ? (
            <>
              {' · '}
              <em>{t('impersonation.banner.readOnly')}</em>
            </>
          ) : null}
        </span>
      </div>
      <form action={endImpersonation}>
        <button
          type="submit"
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/30 hover:bg-white/20"
        >
          {t('impersonation.banner.end')}
        </button>
      </form>
    </div>
  )
}
