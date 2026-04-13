'use client'

import Link from 'next/link'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'

interface Props {
  orderId: string
}

/**
 * "Reportar un problema" CTA shown on the order detail page for delivered
 * or in-transit orders. Links to the new-incident form preloaded with the
 * order id.
 */
export function ReportProblemLink({ orderId }: Props) {
  const t = useT()
  return (
    <Link
      href={`/cuenta/incidencias/nueva?orderId=${encodeURIComponent(orderId)}`}
      className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300 hover:shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30 dark:hover:border-amber-700"
    >
      <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {t('incident.reportProblem')}
        </p>
        <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80">
          {t('incident.reportProblemDesc')}
        </p>
      </div>
    </Link>
  )
}
