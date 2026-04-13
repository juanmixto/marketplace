import type {
  CategorySlice,
  Insight,
  Kpis,
  RankedItem,
  SalesPoint,
} from './types'

interface BuildInsightsInput {
  kpis: Kpis
  topProducts: RankedItem[]
  topVendors: RankedItem[]
  categoryBreakdown: CategorySlice[]
  salesEvolution: SalesPoint[]
}

function formatPct(value: number | null): string {
  if (value == null) return '—'
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}%`
}

export function buildInsights(input: BuildInsightsInput): Insight[] {
  const { kpis, topProducts, topVendors, categoryBreakdown } = input
  const insights: Insight[] = []

  if (kpis.gmv.deltaPct != null) {
    const tone = kpis.gmv.deltaPct >= 0 ? 'positive' : 'warning'
    insights.push({
      id: 'gmv-trend',
      tone,
      title: `GMV ${kpis.gmv.deltaPct >= 0 ? 'crece' : 'cae'} ${formatPct(kpis.gmv.deltaPct)}`,
      body: 'Variación respecto al periodo anterior de la misma duración.',
    })
  }

  if (topProducts[0]) {
    insights.push({
      id: 'top-product',
      tone: 'neutral',
      title: `Producto estrella: ${topProducts[0].name}`,
      body: topProducts[0].secondary
        ? `De ${topProducts[0].secondary}. ${topProducts[0].count} unidades vendidas.`
        : `${topProducts[0].count} unidades vendidas.`,
    })
  }

  if (topVendors[0]) {
    const totalVendorRevenue = topVendors.reduce((s, v) => s + v.revenue, 0)
    const share = totalVendorRevenue > 0 ? (topVendors[0].revenue / totalVendorRevenue) * 100 : 0
    if (share >= 30) {
      insights.push({
        id: 'vendor-concentration',
        tone: 'warning',
        title: `${topVendors[0].name} concentra ${share.toFixed(0)}% del revenue`,
        body: 'Alta dependencia de un único productor. Considera diversificar.',
      })
    } else {
      insights.push({
        id: 'top-vendor',
        tone: 'positive',
        title: `Líder: ${topVendors[0].name}`,
        body: `Representa ${share.toFixed(0)}% del revenue del top 10.`,
      })
    }
  }

  if (kpis.incidentRatePct.current >= 5) {
    insights.push({
      id: 'incident-rate',
      tone: 'warning',
      title: `Ratio de incidencias elevado: ${kpis.incidentRatePct.current.toFixed(1)}%`,
      body: 'Revisa la categoría o productores implicados para contener el impacto.',
    })
  }

  if (kpis.repeatRatePct.deltaPct != null && kpis.repeatRatePct.deltaPct > 10) {
    insights.push({
      id: 'repeat-customers',
      tone: 'positive',
      title: `Repetición de clientes al alza (${formatPct(kpis.repeatRatePct.deltaPct)})`,
      body: 'Señal de fidelización — buen momento para campañas de retención.',
    })
  }

  if (categoryBreakdown[0] && categoryBreakdown[0].sharePct >= 50) {
    insights.push({
      id: 'category-concentration',
      tone: 'warning',
      title: `${categoryBreakdown[0].name} acapara ${categoryBreakdown[0].sharePct.toFixed(0)}% del GMV`,
      body: 'Concentración de ventas en una sola categoría.',
    })
  }

  return insights
}
