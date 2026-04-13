export type DemoProductVisual = {
  title: string
  subtitle: string
  emoji: string
  gradientFrom: string
  gradientTo: string
  accent: string
}

const DEMO_PRODUCT_VISUALS = {
  'tomates-cherry-ecologicos': {
    title: 'Tomates cherry',
    subtitle: 'Huerta ecológica · demo',
    emoji: '🍅',
    gradientFrom: '#7f1d1d',
    gradientTo: '#ef4444',
    accent: '#fee2e2',
  },
  'calabacin-tierno-temporada': {
    title: 'Calabacín tierno',
    subtitle: 'Recolectado en temporada · demo',
    emoji: '🥒',
    gradientFrom: '#14532d',
    gradientTo: '#22c55e',
    accent: '#dcfce7',
  },
  'huevos-gallinas-camperas': {
    title: 'Huevos camperos',
    subtitle: 'Granja local · demo',
    emoji: '🥚',
    gradientFrom: '#92400e',
    gradientTo: '#f59e0b',
    accent: '#fef3c7',
  },
  'mermelada-artesana-fresa': {
    title: 'Mermelada de fresa',
    subtitle: 'Elaboración artesana · demo',
    emoji: '🍓',
    gradientFrom: '#9f1239',
    gradientTo: '#f43f5e',
    accent: '#ffe4e6',
  },
  'pimientos-padron-ecologicos': {
    title: 'Pimientos de Padrón',
    subtitle: 'Lote corto · demo',
    emoji: '🫑',
    gradientFrom: '#365314',
    gradientTo: '#84cc16',
    accent: '#ecfccb',
  },
  'cesta-mixta-huerta': {
    title: 'Cesta de huerta',
    subtitle: 'Selección variada · demo',
    emoji: '🧺',
    gradientFrom: '#854d0e',
    gradientTo: '#f59e0b',
    accent: '#fef3c7',
  },
  'patata-roja-lavada': {
    title: 'Patata roja',
    subtitle: 'Despensa básica · demo',
    emoji: '🥔',
    gradientFrom: '#7c2d12',
    gradientTo: '#fb923c',
    accent: '#ffedd5',
  },
  'cebolla-dulce-seleccionada': {
    title: 'Cebolla dulce',
    subtitle: 'Para sofritos y horno · demo',
    emoji: '🧅',
    gradientFrom: '#713f12',
    gradientTo: '#fbbf24',
    accent: '#fef3c7',
  },
  'lechuga-romana-fresca': {
    title: 'Lechuga romana',
    subtitle: 'Hoja fresca · demo',
    emoji: '🥬',
    gradientFrom: '#166534',
    gradientTo: '#4ade80',
    accent: '#dcfce7',
  },
  'naranjas-mesa-premium': {
    title: 'Naranjas premium',
    subtitle: 'Cítrico valenciano · demo',
    emoji: '🍊',
    gradientFrom: '#9a3412',
    gradientTo: '#fb923c',
    accent: '#ffedd5',
  },
  'fresas-dulces-bandeja': {
    title: 'Fresas dulces',
    subtitle: 'Bandeja fresca · demo',
    emoji: '🍓',
    gradientFrom: '#881337',
    gradientTo: '#fb7185',
    accent: '#ffe4e6',
  },
  'miel-cruda-azahar': {
    title: 'Miel de azahar',
    subtitle: 'Sin pasteurizar · demo',
    emoji: '🍯',
    gradientFrom: '#92400e',
    gradientTo: '#facc15',
    accent: '#fef9c3',
  },
  'queso-cabra-curado': {
    title: 'Queso curado',
    subtitle: 'Leche de cabra · demo',
    emoji: '🧀',
    gradientFrom: '#a16207',
    gradientTo: '#fde047',
    accent: '#fef9c3',
  },
  'yogur-oveja-natural': {
    title: 'Yogur natural',
    subtitle: 'Leche de oveja · demo',
    emoji: '🥛',
    gradientFrom: '#1d4ed8',
    gradientTo: '#93c5fd',
    accent: '#dbeafe',
  },
  'mantequilla-artesana-salada': {
    title: 'Mantequilla salada',
    subtitle: 'Elaboración diaria · demo',
    emoji: '🧈',
    gradientFrom: '#a16207',
    gradientTo: '#fcd34d',
    accent: '#fef3c7',
  },
  'aceite-oliva-virgen-extra': {
    title: 'AOVE',
    subtitle: 'Aceituna temprana · demo',
    emoji: '🫒',
    gradientFrom: '#365314',
    gradientTo: '#84cc16',
    accent: '#ecfccb',
  },
  'vino-tinto-joven-tempranillo': {
    title: 'Tempranillo joven',
    subtitle: 'Bodega local · demo',
    emoji: '🍷',
    gradientFrom: '#4c0519',
    gradientTo: '#be123c',
    accent: '#ffe4e6',
  },
  'pimientos-asados-conserva': {
    title: 'Pimientos asados',
    subtitle: 'Conserva artesana · demo',
    emoji: '🫙',
    gradientFrom: '#7f1d1d',
    gradientTo: '#f97316',
    accent: '#ffedd5',
  },
  'pan-pueblo-masa-madre': {
    title: 'Pan de pueblo',
    subtitle: 'Masa madre · demo',
    emoji: '🍞',
    gradientFrom: '#78350f',
    gradientTo: '#f59e0b',
    accent: '#fef3c7',
  },
  'croissants-mantequilla': {
    title: 'Croissants',
    subtitle: 'Hojaldre de mantequilla · demo',
    emoji: '🥐',
    gradientFrom: '#92400e',
    gradientTo: '#fbbf24',
    accent: '#fef3c7',
  },
  'galletas-avena-miel': {
    title: 'Galletas de avena',
    subtitle: 'Receta casera · demo',
    emoji: '🍪',
    gradientFrom: '#7c2d12',
    gradientTo: '#fdba74',
    accent: '#ffedd5',
  },
} satisfies Record<string, DemoProductVisual>

export function getDemoProductVisual(slug: string): DemoProductVisual | null {
  return DEMO_PRODUCT_VISUALS[slug as keyof typeof DEMO_PRODUCT_VISUALS] ?? null
}

export function getDemoProductImagePath(slug: string) {
  return `/demo-product-image/${encodeURIComponent(slug)}`
}

export function getDemoProductImages(slug: string, existingImages: string[] = []): string[] {
  if (existingImages.length > 0) return existingImages
  return getDemoProductVisual(slug) ? [getDemoProductImagePath(slug)] : existingImages
}
