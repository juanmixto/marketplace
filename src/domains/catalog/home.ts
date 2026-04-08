export interface HomeStatsInput {
  activeVendors: number
  activeProducts: number
  averageRating: number | null
}

export interface HomeStat {
  value: string
  label: string
}

function formatCompactCount(value: number) {
  return new Intl.NumberFormat('es-ES', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)
}

export function buildHomeStats(input: HomeStatsInput): HomeStat[] {
  return [
    {
      value: input.activeVendors > 0 ? `${formatCompactCount(input.activeVendors)}+` : '0',
      label: 'Productores activos',
    },
    {
      value: input.activeProducts > 0 ? `${formatCompactCount(input.activeProducts)}+` : '0',
      label: 'Productos publicados',
    },
    {
      value: input.averageRating ? `${input.averageRating.toFixed(1)}★` : 'Nueva',
      label: input.averageRating ? 'Valoración media' : 'Marketplace en crecimiento',
    },
  ]
}
