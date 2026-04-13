import type { Metadata } from 'next'
import Link from 'next/link'
import { getMyIncidents } from '@/domains/incidents/actions'
import { getServerT } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'
import { SlaProgress } from '@/components/incidents/SlaProgress'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return { title: t('incident.list.title') }
}

export default async function IncidentsListPage() {
  const incidents = await getMyIncidents()
  const t = await getServerT()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">
        {t('incident.list.title')}
      </h1>

      {incidents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-raised)] p-8 text-center">
          <p className="text-sm text-[var(--muted)]">{t('incident.list.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {incidents.map(incident => {
            const typeKey = `incident.type.${incident.type}` as TranslationKeys
            const statusKey = `incident.status.${incident.status}` as TranslationKeys
            const isClosed =
              incident.status === 'RESOLVED' || incident.status === 'CLOSED'
            return (
              <li key={incident.id}>
                <Link
                  href={`/cuenta/incidencias/${incident.id}`}
                  className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {t('incident.list.case')} #{incident.id.slice(-6).toUpperCase()} · {t(typeKey)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {t('incident.list.openedOn')} {incident.createdAt.toLocaleDateString()}
                        {' · '}
                        {incident.messageCount} {t('incident.list.messages')}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        isClosed
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : incident.slaOverdue
                            ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                      }`}
                    >
                      {t(statusKey)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <SlaProgress
                      deadline={new Date(incident.slaDeadline)}
                      hidden={isClosed}
                    />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
