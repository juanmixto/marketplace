'use client'

import { Suspense, useState } from 'react'
import { FunnelIcon } from '@heroicons/react/24/outline'
import { useSearchParams } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import { ProductFiltersPanel } from '@/components/catalog/ProductFiltersPanel'
import type { CategoryWithCount } from '@/domains/catalog/types'
import { useT } from '@/i18n'

interface Props {
  categories: CategoryWithCount[]
}

function MobileFiltersInner({ categories }: Props) {
  const [open, setOpen] = useState(false)
  const searchParams = useSearchParams()
  const t = useT()

  const activeCount =
    (searchParams.get('categoria') ? 1 : 0) +
    searchParams.getAll('cert').length

  const triggerLabel = t('mobileFilters.trigger')
  const openAria =
    activeCount > 0
      ? `${t('mobileFilters.openAria')} (${activeCount} ${t('mobileFilters.activeSuffix')})`
      : t('mobileFilters.openAria')

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={openAria}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground-soft)] shadow-sm transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] lg:hidden"
      >
        <FunnelIcon className="h-4 w-4" />
        {triggerLabel}
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('mobileFilters.trigger')}
        className="lg:hidden"
      >
        <div className="p-4">
          <ProductFiltersPanel
            categories={categories}
            onClose={() => setOpen(false)}
          />
        </div>
      </Modal>
    </>
  )
}

export function MobileFilters({ categories }: Props) {
  return (
    <Suspense fallback={null}>
      <MobileFiltersInner categories={categories} />
    </Suspense>
  )
}
