type VendorVisualInput = {
  slug: string
  displayName: string
  description?: string | null
  coverImage?: string | null
}

type VendorVisualRule = {
  match: RegExp
  image: string
  label: string
}

const DEFAULT_VENDOR_IMAGE = 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80'

const VENDOR_IMAGE_BY_SLUG = {
  'finca-garcia': 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
  'huerta-la-solana': 'https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=1200&q=80',
  'queseria-monteazul': 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?auto=format&fit=crop&w=1200&q=80',
  'bodega-ribera-viva': 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1200&q=80',
  'obrador-santa-ines': 'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=1200&q=80',
  'almazara-nueva-era': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=1200&q=80',
  'granja-los-almendros': 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&w=1200&q=80',
  'secano-del-sur': 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
  'test-vendor': DEFAULT_VENDOR_IMAGE,
} as const

const VENDOR_VISUAL_RULES: VendorVisualRule[] = [
  {
    match: /(obrador|pan|masa madre|panader)/i,
    image: 'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=1200&q=80',
    label: 'Panadería artesanal',
  },
  {
    match: /(queser|queso|l[aá]cteo|oveja|cabra)/i,
    image: 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?auto=format&fit=crop&w=1200&q=80',
    label: 'Quesería artesanal',
  },
  {
    match: /(bodega|vino|viñedo|tempranillo)/i,
    image: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1200&q=80',
    label: 'Bodega local',
  },
  {
    match: /(huerta|fruta|naranja|c[ií]tric|finca|verdura|tomate)/i,
    image: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
    label: 'Huerta de temporada',
  },
  {
    match: /(almazara|aceite|oliva)/i,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=1200&q=80',
    label: 'Aceite y olivar',
  },
  {
    match: /(granja|huevo|gallina|almendro)/i,
    image: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&w=1200&q=80',
    label: 'Granja familiar',
  },
  {
    match: /(secano|cereal|campo|sur)/i,
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
    label: 'Campo de secano',
  },
]

function getVendorVisualRule(vendor: Pick<VendorVisualInput, 'displayName' | 'description'>) {
  const haystack = `${vendor.displayName} ${vendor.description ?? ''}`
  return VENDOR_VISUAL_RULES.find(rule => rule.match.test(haystack)) ?? null
}

export function getVendorHeroImage(vendor: VendorVisualInput) {
  if (vendor.coverImage?.trim()) return vendor.coverImage

  return (
    VENDOR_IMAGE_BY_SLUG[vendor.slug as keyof typeof VENDOR_IMAGE_BY_SLUG] ??
    getVendorVisualRule(vendor)?.image ??
    DEFAULT_VENDOR_IMAGE
  )
}

export function getVendorVisualLabel(vendor: Pick<VendorVisualInput, 'displayName' | 'description'>) {
  return getVendorVisualRule(vendor)?.label ?? 'Productor local'
}
