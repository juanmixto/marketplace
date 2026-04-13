'use client'

import { create } from 'zustand'
import type { PresetRange } from '@/domains/analytics/types'

interface DraftFilters {
  preset: PresetRange
  from: string // ISO date yyyy-mm-dd
  to: string // ISO date yyyy-mm-dd
  vendorId: string
  categoryId: string
  status: string
}

interface FilterStore {
  draft: DraftFilters
  setPreset: (preset: PresetRange) => void
  setField: <K extends keyof DraftFilters>(key: K, value: DraftFilters[K]) => void
  reset: (next: DraftFilters) => void
}

const emptyDraft: DraftFilters = {
  preset: '30d',
  from: '',
  to: '',
  vendorId: '',
  categoryId: '',
  status: '',
}

export const useAnalyticsFiltersStore = create<FilterStore>(set => ({
  draft: emptyDraft,
  setPreset: preset => set(state => ({ draft: { ...state.draft, preset } })),
  setField: (key, value) => set(state => ({ draft: { ...state.draft, [key]: value } })),
  reset: next => set({ draft: next }),
}))
