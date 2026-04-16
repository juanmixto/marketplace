'use client'

import { useState } from 'react'
import {
  PauseIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import type { PauseDuration } from '@/domains/subscriptions/pause-duration'
import type { TranslationKeys } from '@/i18n/locales'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (duration: PauseDuration) => void
  pending?: boolean
}

const OPTIONS: {
  duration: PauseDuration
  labelKey: TranslationKeys
  hintKey: TranslationKeys
  warn?: boolean
}[] = [
  { duration: '1w', labelKey: 'pause.option1w', hintKey: 'pause.option1wHint' },
  { duration: '2w', labelKey: 'pause.option2w', hintKey: 'pause.option2wHint' },
  { duration: '1m', labelKey: 'pause.option1m', hintKey: 'pause.option1mHint' },
  { duration: 'indefinite', labelKey: 'pause.optionIndefinite', hintKey: 'pause.optionIndefiniteHint', warn: true },
]

export function PauseSubscriptionDialog({ open, onClose, onConfirm, pending }: Props) {
  const t = useT()
  const [selected, setSelected] = useState<PauseDuration>('1w')

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <PauseIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            {t('pause.dialogTitle')}
          </h3>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {t('pause.dialogSubtitle')}
        </p>

        <div className="mt-4 space-y-2">
          {OPTIONS.map(opt => {
            const isSelected = selected === opt.duration
            return (
              <button
                key={opt.duration}
                type="button"
                onClick={() => setSelected(opt.duration)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  isSelected
                    ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CalendarDaysIcon className="h-4 w-4 text-[var(--muted)]" />
                  <span className={`text-sm font-medium ${isSelected ? 'text-amber-800 dark:text-amber-200' : 'text-[var(--foreground)]'}`}>
                    {t(opt.labelKey)}
                  </span>
                </div>
                <p className="mt-0.5 ml-6 text-xs text-[var(--muted)]">{t(opt.hintKey)}</p>
                {opt.warn && isSelected && (
                  <div className="mt-2 ml-6 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {t('pause.indefiniteWarning')}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] disabled:opacity-60"
          >
            {t('pause.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={pending}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:text-gray-950 dark:hover:bg-amber-400"
          >
            {pending ? t('pause.pausing') : t('pause.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
