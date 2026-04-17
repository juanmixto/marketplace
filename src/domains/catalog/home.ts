export interface HomeStatsInput {
  activeVendors: number
  activeProducts: number
  averageRating: number | null
}

// Locale-agnostic stat descriptor. The server helper emits only
// i18n keys + raw numbers; HomePageClient resolves them at render
// time via useT() + Intl.NumberFormat. Keeping the helper pure lets
// the home page stay cached (revalidate = 3600) across locales.
//
// See src/i18n/README.md §3 for the labelKey pattern and PR #387
// follow-up for why this file was originally returning hardcoded ES.
export type HomeStat =
  | { kind: 'count'; labelKey: 'home.stats.activeVendors' | 'home.stats.activeProducts'; count: number }
  | { kind: 'rating'; labelKey: 'home.stats.averageRating'; rating: number }
  | { kind: 'newBadge'; labelKey: 'home.stats.marketplaceGrowing'; valueKey: 'home.stats.newBadge' }

export function buildHomeStats(input: HomeStatsInput): HomeStat[] {
  return [
    {
      kind: 'count',
      labelKey: 'home.stats.activeVendors',
      count: input.activeVendors,
    },
    {
      kind: 'count',
      labelKey: 'home.stats.activeProducts',
      count: input.activeProducts,
    },
    input.averageRating
      ? {
          kind: 'rating',
          labelKey: 'home.stats.averageRating',
          rating: input.averageRating,
        }
      : {
          kind: 'newBadge',
          labelKey: 'home.stats.marketplaceGrowing',
          valueKey: 'home.stats.newBadge',
        },
  ]
}
