import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getIncidentDetail } from '@/domains/incidents/actions'
import { IncidentAuthError } from '@/domains/incidents/errors'
import { getServerT } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'
import { IncidentReplyForm } from './IncidentReplyForm'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return { title: t('incident.list.case') }
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function IncidentDetailPage({ params }: Props) {
  const { id } = await params

  let incident
  try {
    incident = await getIncidentDetail(id)
  } catch (error) {
    if (error instanceof IncidentAuthError) notFound()
    throw error
  }

  const t = await getServerT()
  const typeKey = `incident.type.${incident.type}` as TranslationKeys
  const statusKey = `incident.status.${incident.status}` as TranslationKeys
  const isClosed = incident.status === 'RESOLVED' || incident.status === 'CLOSED'

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/cuenta/incidencias"
        className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
      >
        {t('incident.detail.backToList')}
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {t('incident.list.case')} #{incident.id.slice(-6).toUpperCase()}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t(typeKey)} · {t('incident.list.openedOn')}{' '}
            {incident.createdAt.toLocaleDateString()}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          {t(statusKey)}
        </span>
      </div>

      {/* Initial description */}
      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {t('incident.descriptionLabel')}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--foreground-soft)]">
          {incident.description}
        </p>
      </div>

      {/* Thread */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        {t('incident.detail.thread')}
      </h2>
      <ul className="mt-3 space-y-3">
        {incident.messages.map(message => {
          const authorKey =
            message.authorRole === 'CUSTOMER'
              ? 'incident.author.CUSTOMER'
              : message.authorRole === 'VENDOR'
                ? 'incident.author.VENDOR'
                : 'incident.author.ADMIN'
          const isCustomer = message.authorRole === 'CUSTOMER'
          return (
            <li
              key={message.id}
              className={`rounded-xl border p-4 ${
                isCustomer
                  ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                  : 'border-[var(--border)] bg-[var(--surface)]'
              }`}
            >
              <p className="text-xs font-semibold text-[var(--foreground-soft)]">
                {t(authorKey as TranslationKeys)} ·{' '}
                <span className="font-normal text-[var(--muted)]">
                  {message.createdAt.toLocaleString()}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--foreground)]">
                {message.body}
              </p>
            </li>
          )
        })}
      </ul>

      {isClosed ? (
        <p className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--muted)]">
          {t('incident.detail.closed')}
        </p>
      ) : (
        <IncidentReplyForm incidentId={incident.id} />
      )}
    </div>
  )
}
