import Link from 'next/link'

/**
 * Admin-only origin card rendered on the product edit page when the
 * Product was created by publishing an `IngestionProductDraft`. Gives
 * the reviewer a one-click jump back to the draft + message in the
 * admin ingestion queue, and — when the owning Vendor is still a
 * ghost — the single-use claim code to hand to the real producer.
 *
 * Never rendered on public catalog surfaces. Claim codes leak nothing
 * on their own (32^8 entropy per code + UNIQUE DB index + 365-day
 * expiry), but the admin route is still the only surface that should
 * show them.
 */

interface VendorClaimInfo {
  status: string
  stripeOnboarded: boolean
  claimCode: string | null
  claimCodeExpiresAt: Date | null
}

interface Props {
  draftId: string
  sourceMessageId: string | null
  reviewItemId: string | null
  vendor?: VendorClaimInfo
}

function formatExpiry(date: Date | null): string {
  if (!date) return ''
  const days = Math.round((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return 'caducado'
  if (days === 0) return 'caduca hoy'
  if (days === 1) return 'caduca mañana'
  return `caduca en ${days} días`
}

export function ProductIngestionOriginCard({ draftId, sourceMessageId, reviewItemId, vendor }: Props) {
  // A ghost vendor is recognisable by `status=APPLYING` + an
  // unexpired `claimCode`. Once claimed, both fields are cleared.
  const isUnclaimedGhost =
    !!vendor &&
    vendor.status === 'APPLYING' &&
    !vendor.stripeOnboarded &&
    !!vendor.claimCode &&
    !!vendor.claimCodeExpiresAt &&
    vendor.claimCodeExpiresAt.getTime() > Date.now()

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-50/60 p-5 shadow-sm dark:border-sky-500/20 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
            Origen
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">
            Telegram ingestion
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Este producto fue creado al aprobar un draft en la cola de ingestión.
            Revisa el mensaje original para contexto antes de activarlo.
          </p>
        </div>
        {reviewItemId ? (
          <Link
            href={`/admin/ingestion/${reviewItemId}`}
            className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 dark:bg-sky-500 dark:text-sky-950 dark:hover:bg-sky-400"
          >
            Ver en ingestión →
          </Link>
        ) : (
          <Link
            href={`/admin/ingestion?search=${encodeURIComponent(draftId)}`}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/40"
          >
            Abrir cola de ingestión →
          </Link>
        )}
      </div>

      {isUnclaimedGhost && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-950/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            Productor no reclamado
          </p>
          <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
            Este producto está ligado a un productor fantasma que todavía nadie ha
            reclamado. No podrá activarse ni venderse hasta que el productor real
            entre en <span className="font-mono">/cuenta/reclamar-productor</span> con el código y complete su alta de Stripe.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Código de reclamación</p>
              <p className="mt-1 select-all font-mono text-lg font-bold tracking-[0.3em] text-amber-900 dark:text-amber-100">
                {vendor!.claimCode}
              </p>
            </div>
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {formatExpiry(vendor!.claimCodeExpiresAt)}
            </span>
          </div>
          <p className="mt-3 text-xs text-amber-800/80 dark:text-amber-300/70">
            Pásale este código al productor por el canal privado (Telegram DM, WhatsApp,
            email). Es de un solo uso y caduca automáticamente.
          </p>
        </div>
      )}

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-medium uppercase tracking-wide text-[var(--muted-light)]">Draft id</dt>
          <dd className="mt-1 break-all font-mono text-[var(--foreground-soft)]">{draftId}</dd>
        </div>
        {sourceMessageId && (
          <div>
            <dt className="font-medium uppercase tracking-wide text-[var(--muted-light)]">Mensaje id</dt>
            <dd className="mt-1 break-all font-mono text-[var(--foreground-soft)]">{sourceMessageId}</dd>
          </div>
        )}
        {reviewItemId && (
          <div>
            <dt className="font-medium uppercase tracking-wide text-[var(--muted-light)]">Review item</dt>
            <dd className="mt-1 break-all font-mono text-[var(--foreground-soft)]">{reviewItemId}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}
