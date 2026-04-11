import type { Locale } from './locales'

type ProductLike = {
  slug: string
  name: string
  description?: string | null
  unit?: string | null
}

type CertificationCopy = {
  label: string
  description: string
}

export type ProductTranslationMeta = {
  isAutoTranslated: boolean
  sourceLocale: Locale | null
  badgeLabel: string
  badgeTitle: string
}

type CatalogCopy = {
  page: {
    title: string
    description: string
    searchTitle: string
    searchDescription: string
    searchTitleWithQuery: (query: string) => string
    searchDescriptionWithQuery: (query: string) => string
    allProducts: string
    fallbackTitle: string
    results: (count: number, hasMore?: boolean) => string
    noResultsTitle: string
    noResultsDescription: string
    previous: string
    next: string
    searchPromptTitle: string
    searchPromptDescription: string
    searchResultsFor: (query: string) => string
    noProductsFor: (query: string) => string
    searchTryAgain: string
    browseAllProducts: string
    browseByCategory: string
    productNotFoundTitle: string
    productNotFoundDescription: string
  }
  filters: {
    title: string
    clearAll: string
    clearAllAria: string
    category: string
    all: string
    certifications: string
  }
  sort: {
    ariaLabel: string
    newest: string
    priceAsc: string
    priceDesc: string
    popular: string
  }
  actions: {
    viewDetail: string
    outOfStock: string
    onlyLeft: (count: number) => string
    vatIncluded: (rate: number) => string
    selectFormat: string
    noSurcharge: string
    overBase: (amount: string, isPositive: boolean) => string
    selectVariant: string
    selectVariantForStock: string
    inStock: (count: number) => string
    available: string
    quantity: string
    quantityHint: string
    maxUnits: (count: number) => string
    decreaseQuantity: string
    increaseQuantity: string
    quantityOf: (productName: string) => string
    add: string
    addCompact: (count: number) => string
    addMany: (count: number) => string
    addToCart: string
    added: string
    addedMany: (count: number) => string
    addedToCart: string
    viewVendorProducts: string
  }
  reviews: {
    title: string
    description: string
    unrated: string
    count: (count: number) => string
    empty: string
    relatedProducts: string
  }
  breadcrumbs: {
    home: string
    products: string
  }
  translation: {
    autoTranslatedFrom: (language: string) => string
    originalLanguageHint: (language: string) => string
  }
  certifications: Record<string, CertificationCopy>
  product: {
    ratingLabel: (rating: string, count: number) => string
    originTitle: string
    originFrom: string
    trustDirectPurchase: string
    trustNoIntermediaries: string
    trustQuality: string
    aboutProducer: string
    viewProducerProfile: string
  }
}

const ES_CATALOG_COPY: CatalogCopy = {
  page: {
    title: 'Productos',
    description: 'Explora el catálogo de productos locales disponibles en Mercado Productor.',
    searchTitle: 'Buscar',
    searchDescription: 'Busca productos, productores y categorías en Mercado Productor.',
    searchTitleWithQuery: query => `Buscar: ${query}`,
    searchDescriptionWithQuery: query => `Resultados de búsqueda para "${query}" en Mercado Productor.`,
    allProducts: 'Todos los productos',
    fallbackTitle: 'Productos',
    results: (count, hasMore = false) => `${count} resultado${count === 1 ? '' : 's'}${hasMore ? '+' : ''}`,
    noResultsTitle: 'Sin resultados',
    noResultsDescription: 'Prueba con otros filtros o términos de búsqueda',
    previous: 'Anterior',
    next: 'Siguiente',
    searchPromptTitle: '¿Qué estás buscando?',
    searchPromptDescription: 'Usa el campo de búsqueda para encontrar productos',
    searchResultsFor: query => `Resultados para "${query}"`,
    noProductsFor: query => `No encontramos productos para "${query}"`,
    searchTryAgain: 'Prueba con otros términos de búsqueda o explora por categoría',
    browseAllProducts: 'Ver todos los productos',
    browseByCategory: 'Explorar por categoría',
    productNotFoundTitle: 'Producto no encontrado',
    productNotFoundDescription: 'No hemos podido encontrar este producto.',
  },
  filters: {
    title: 'Filtros',
    clearAll: 'Limpiar todo',
    clearAllAria: 'Limpiar todos los filtros',
    category: 'Categoría',
    all: 'Todas',
    certifications: 'Certificaciones',
  },
  sort: {
    ariaLabel: 'Ordenar productos',
    newest: 'Más recientes',
    priceAsc: 'Precio: menor a mayor',
    priceDesc: 'Precio: mayor a menor',
    popular: 'Más populares',
  },
  actions: {
    viewDetail: 'Ver detalle',
    outOfStock: 'Sin stock',
    onlyLeft: count => `Quedan ${count} uds.`,
    vatIncluded: rate => `IVA incluido (${rate}%)`,
    selectFormat: 'Selecciona formato',
    noSurcharge: 'Sin recargo',
    overBase: (amount, isPositive) => `${isPositive ? '+' : '-'}${amount} sobre base`,
    selectVariant: 'Selecciona una variante antes de añadir el producto al carrito.',
    selectVariantForStock: 'Selecciona una variante para ver el stock disponible',
    inStock: count => `${count} en stock`,
    available: 'Disponible',
    quantity: 'Cantidad',
    quantityHint: 'Añade varias unidades en un solo toque',
    maxUnits: count => `Máx. ${count} ${count === 1 ? 'unidad' : 'unidades'}`,
    decreaseQuantity: 'Reducir cantidad',
    increaseQuantity: 'Aumentar cantidad',
    quantityOf: productName => `Cantidad de ${productName}`,
    add: 'Añadir',
    addCompact: count => `Añadir ${count}`,
    addMany: count => `Añadir ${count} unidades`,
    addToCart: 'Añadir al carrito',
    added: 'Añadido',
    addedMany: count => `${count} unidades añadidas`,
    addedToCart: 'Añadido al carrito',
    viewVendorProducts: 'Ver todos sus productos →',
  },
  reviews: {
    title: 'Reseñas del producto',
    description: 'Opiniones verificadas de compradores que ya recibieron este producto.',
    unrated: 'Sin nota',
    count: count => `${count} reseña${count === 1 ? '' : 's'}`,
    empty: 'Aún no hay reseñas para este producto.',
    relatedProducts: 'Productos relacionados',
  },
  breadcrumbs: {
    home: 'Inicio',
    products: 'Productos',
  },
  translation: {
    autoTranslatedFrom: language => `Traducido automáticamente desde ${language}`,
    originalLanguageHint: language => `Este producto se escribió originalmente en ${language}.`,
  },
  certifications: {
    'ECO-ES': {
      label: 'Ecológico ES',
      description: 'Certificación ecológica oficial para productos agrarios y alimentarios en España.',
    },
    DOP: {
      label: 'DOP',
      description: 'Sello para productos cuya calidad o características dependen de su origen geográfico.',
    },
    IGP: {
      label: 'IGP',
      description: 'Reconoce productos ligados a una región concreta por su reputación o proceso productivo.',
    },
    BIO: {
      label: 'BIO',
      description: 'Identifica productos obtenidos conforme a estándares de agricultura biológica.',
    },
    KM0: {
      label: 'KM0',
      description: 'Destaca productos de cercanía con circuitos cortos de producción y distribución.',
    },
    ARTESANO: {
      label: 'ARTESANO',
      description: 'Elaborado en pequeños lotes con un proceso tradicional y cuidado artesanal.',
    },
  },
  product: {
    ratingLabel: (rating, count) => `${rating} · ${count} valoracion${count === 1 ? '' : 'es'}`,
    originTitle: 'Origen del producto',
    originFrom: 'Producido en',
    trustDirectPurchase: 'Compra directa al productor',
    trustNoIntermediaries: 'Sin intermediarios',
    trustQuality: 'Calidad garantizada',
    aboutProducer: 'Conoce al productor',
    viewProducerProfile: 'Ver perfil completo',
  },
}

const EN_CATALOG_COPY: CatalogCopy = {
  page: {
    title: 'Products',
    description: 'Browse the local product catalogue available on Mercado Productor.',
    searchTitle: 'Search',
    searchDescription: 'Search products, producers and categories on Mercado Productor.',
    searchTitleWithQuery: query => `Search: ${query}`,
    searchDescriptionWithQuery: query => `Search results for "${query}" on Mercado Productor.`,
    allProducts: 'All products',
    fallbackTitle: 'Products',
    results: (count, hasMore = false) => `${count} result${count === 1 ? '' : 's'}${hasMore ? '+' : ''}`,
    noResultsTitle: 'No results',
    noResultsDescription: 'Try other filters or search terms',
    previous: 'Previous',
    next: 'Next',
    searchPromptTitle: 'What are you looking for?',
    searchPromptDescription: 'Use the search field to find products',
    searchResultsFor: query => `Results for "${query}"`,
    noProductsFor: query => `We could not find products for "${query}"`,
    searchTryAgain: 'Try other search terms or browse by category',
    browseAllProducts: 'View all products',
    browseByCategory: 'Browse by category',
    productNotFoundTitle: 'Product not found',
    productNotFoundDescription: 'We could not find this product.',
  },
  filters: {
    title: 'Filters',
    clearAll: 'Clear all',
    clearAllAria: 'Clear all filters',
    category: 'Category',
    all: 'All',
    certifications: 'Certifications',
  },
  sort: {
    ariaLabel: 'Sort products',
    newest: 'Newest first',
    priceAsc: 'Price: low to high',
    priceDesc: 'Price: high to low',
    popular: 'Most popular',
  },
  actions: {
    viewDetail: 'View details',
    outOfStock: 'Out of stock',
    onlyLeft: count => `Only ${count} left`,
    vatIncluded: rate => `VAT included (${rate}%)`,
    selectFormat: 'Select format',
    noSurcharge: 'No extra charge',
    overBase: (amount, isPositive) => `${isPositive ? '+' : '-'}${amount} over base`,
    selectVariant: 'Select a variant before adding the product to your cart.',
    selectVariantForStock: 'Select a variant to see the available stock',
    inStock: count => `${count} in stock`,
    available: 'Available',
    quantity: 'Quantity',
    quantityHint: 'Add several units in one tap',
    maxUnits: count => `Max. ${count} ${count === 1 ? 'unit' : 'units'}`,
    decreaseQuantity: 'Decrease quantity',
    increaseQuantity: 'Increase quantity',
    quantityOf: productName => `Quantity of ${productName}`,
    add: 'Add',
    addCompact: count => `Add ${count}`,
    addMany: count => `Add ${count} units`,
    addToCart: 'Add to cart',
    added: 'Added',
    addedMany: count => `${count} units added`,
    addedToCart: 'Added to cart',
    viewVendorProducts: 'View all their products →',
  },
  reviews: {
    title: 'Product reviews',
    description: 'Verified feedback from buyers who already received this product.',
    unrated: 'No rating yet',
    count: count => `${count} review${count === 1 ? '' : 's'}`,
    empty: 'There are no reviews for this product yet.',
    relatedProducts: 'Related products',
  },
  breadcrumbs: {
    home: 'Home',
    products: 'Products',
  },
  translation: {
    autoTranslatedFrom: language => `Auto-translated from ${language}`,
    originalLanguageHint: language => `This product was originally written in ${language}.`,
  },
  certifications: {
    'ECO-ES': {
      label: 'ECO-ES',
      description: 'Official organic certification for agricultural and food products in Spain.',
    },
    DOP: {
      label: 'PDO',
      description: 'Seal for products whose quality or characteristics depend on their geographical origin.',
    },
    IGP: {
      label: 'PGI',
      description: 'Recognizes products linked to a specific region through reputation or production process.',
    },
    BIO: {
      label: 'BIO',
      description: 'Identifies products made according to organic farming standards.',
    },
    KM0: {
      label: 'KM0',
      description: 'Highlights nearby products with short production and distribution circuits.',
    },
    ARTESANO: {
      label: 'ARTISAN',
      description: 'Made in small batches using a careful traditional process.',
    },
  },
  product: {
    ratingLabel: (rating, count) => `${rating} · ${count} review${count === 1 ? '' : 's'}`,
    originTitle: 'Product origin',
    originFrom: 'Produced in',
    trustDirectPurchase: 'Direct from the producer',
    trustNoIntermediaries: 'No intermediaries',
    trustQuality: 'Quality guaranteed',
    aboutProducer: 'Meet the producer',
    viewProducerProfile: 'View full profile',
  },
}

const PRODUCT_COPY_EN: Record<string, { name: string; description?: string; unit?: string }> = {
  'tomates-cherry-ecologicos': {
    name: 'Organic cherry tomatoes',
    description: 'Cherry tomatoes grown without pesticides in a solar greenhouse. Sweet, firm and picked the same day.',
  },
  'calabacin-tierno-temporada': {
    name: 'Tender seasonal zucchini',
    description: 'Slim zucchini with soft skin and a delicate flavour. Ideal for grilling, soups and quick cooking.',
  },
  'huevos-gallinas-camperas': {
    name: 'Free-range eggs',
    description: 'Eggs from hens raised outdoors. Grade A, size L, with rich yolks and exceptional freshness.',
  },
  'mermelada-artesana-fresa': {
    name: 'Artisan strawberry jam',
    description: 'Made in small batches with ripe fruit and slow cooking to preserve texture and aroma.',
  },
  'pimientos-padron-ecologicos': {
    name: 'Organic Padrón peppers',
    description: 'Small-batch green peppers with a fine texture and small size, perfect for weekend tapas.',
  },
  'cesta-mixta-huerta': {
    name: 'Mixed vegetable basket',
    description: 'Weekly selection with tomatoes, zucchini, tender greens and a surprise seasonal product.',
  },
  'naranjas-mesa-premium': {
    name: 'Premium table oranges',
    description: 'Sweet oranges with thin skin and even sizing. Hand-picked and never stored in cold chambers.',
  },
  'fresas-dulces-bandeja': {
    name: 'Sweet strawberry tray',
    description: 'Aromatic strawberries ripened naturally. A short batch to preserve freshness and flavour.',
  },
  'miel-cruda-azahar': {
    name: 'Raw orange blossom honey',
    description: 'Unpasteurized honey with floral notes and a silky texture from hives near citrus blossom.',
  },
  'queso-cabra-curado': {
    name: 'Aged goat cheese',
    description: 'Firm paste and lingering flavour. A 90-day maturation, ideal for cheese boards or fine grating.',
  },
  'yogur-oveja-natural': {
    name: 'Natural sheep yogurt',
    description: 'Creamy, lightly tangy yogurt made with house cultures and no added sugars.',
  },
  'mantequilla-artesana-salada': {
    name: 'Artisan salted butter',
    description: 'Slow-churned with a touch of sea salt. Rich, smooth and perfect for toast or cooking.',
  },
  'aceite-oliva-virgen-extra': {
    name: 'Extra virgin olive oil',
    description: 'First cold-pressed EVOO. Cornicabra variety, balanced and with a lightly peppery finish.',
  },
  'vino-tinto-joven-tempranillo': {
    name: 'Young Tempranillo red wine',
    description: 'A young red with ripe berry notes, smooth body and lively acidity. Easy to enjoy and perfect for sharing.',
  },
  'pimientos-asados-conserva': {
    name: 'Fire-roasted peppers in a jar',
    description: 'Red peppers roasted over fire, hand-peeled and preserved with a gentle dressing.',
  },
  'pan-pueblo-masa-madre': {
    name: 'Sourdough country loaf',
    description: 'A crusty loaf with a moist crumb. Long fermentation and stone-milled flour.',
  },
  'croissants-mantequilla': {
    name: 'Butter croissants',
    description: 'Light laminated pastry with an airy interior and clean butter flavour. Baked fresh every morning.',
  },
  'galletas-avena-miel': {
    name: 'Oat and honey cookies',
    description: 'Crispy on the outside, soft inside and gently sweet. Perfect with coffee or as an afternoon treat.',
  },
}

const UNIT_TRANSLATIONS: Array<{ es: string; en: string }> = [
  { es: 'bandeja', en: 'tray' },
  { es: 'bolsa', en: 'bag' },
  { es: 'botella', en: 'bottle' },
  { es: 'tarro', en: 'jar' },
  { es: 'cesta', en: 'basket' },
  { es: 'caja', en: 'box' },
  { es: 'pieza', en: 'piece' },
  { es: 'docena', en: 'dozen' },
  { es: 'unidades', en: 'units' },
  { es: 'uds.', en: 'units' },
  { es: 'uds', en: 'units' },
  { es: 'unidad', en: 'unit' },
]

const AUTO_TRANSLATION_GLOSSARY: Array<{ es: string; en: string }> = [
  { es: 'queso de cabra con miel', en: 'goat cheese with honey' },
  { es: 'galletas de avena y miel', en: 'oat and honey cookies' },
  { es: 'aceite de oliva virgen extra', en: 'extra virgin olive oil' },
  { es: 'miel cruda de azahar', en: 'raw orange blossom honey' },
  { es: 'mermelada artesana de fresa', en: 'artisan strawberry jam' },
  { es: 'pan de pueblo de masa madre', en: 'sourdough country loaf' },
  { es: 'producto artesano y natural', en: 'artisan and natural product' },
  { es: 'producto artesano', en: 'artisan product' },
  { es: 'ideal para compartir', en: 'ideal for sharing' },
  { es: 'recien recogido', en: 'freshly picked' },
  { es: 'recién recogido', en: 'freshly picked' },
  { es: 'sin pesticidas', en: 'without pesticides' },
  { es: 'con miel', en: 'with honey' },
  { es: 'de cabra', en: 'goat' },
  { es: 'de oveja', en: 'sheep' },
  { es: 'virgen extra', en: 'extra virgin' },
  { es: 'de temporada', en: 'seasonal' },
  { es: 'artesana', en: 'artisan' },
  { es: 'artesano', en: 'artisan' },
  { es: 'ecológicas', en: 'organic' },
  { es: 'ecologicas', en: 'organic' },
  { es: 'ecológicos', en: 'organic' },
  { es: 'ecologicos', en: 'organic' },
  { es: 'ecológica', en: 'organic' },
  { es: 'ecologica', en: 'organic' },
  { es: 'ecológico', en: 'organic' },
  { es: 'ecologico', en: 'organic' },
  { es: 'crujientes', en: 'crispy' },
  { es: 'crujiente', en: 'crispy' },
  { es: 'tiernas', en: 'tender' },
  { es: 'tiernos', en: 'tender' },
  { es: 'tierna', en: 'tender' },
  { es: 'tierno', en: 'tender' },
  { es: 'dulce', en: 'sweet' },
  { es: 'fresco', en: 'fresh' },
  { es: 'fresca', en: 'fresh' },
  { es: 'natural', en: 'natural' },
  { es: 'local', en: 'local' },
  { es: 'queso', en: 'cheese' },
  { es: 'miel', en: 'honey' },
  { es: 'avena', en: 'oat' },
  { es: 'galletas', en: 'cookies' },
  { es: 'aceite', en: 'oil' },
  { es: 'oliva', en: 'olive' },
  { es: 'vino', en: 'wine' },
  { es: 'pan', en: 'bread' },
  { es: 'tomates', en: 'tomatoes' },
  { es: 'tomate', en: 'tomato' },
  { es: 'naranjas', en: 'oranges' },
  { es: 'naranja', en: 'orange' },
  { es: 'fresas', en: 'strawberries' },
  { es: 'fresa', en: 'strawberry' },
  { es: 'huevos', en: 'eggs' },
  { es: 'huevo', en: 'egg' },
  { es: 'mantequilla', en: 'butter' },
  { es: 'yogur', en: 'yogurt' },
  { es: 'pimientos', en: 'peppers' },
  { es: 'pimiento', en: 'pepper' },
  { es: 'producto', en: 'product' },
  { es: 'compartir', en: 'sharing' },
  { es: 'para', en: 'for' },
  { es: 'con', en: 'with' },
  { es: 'sin', en: 'without' },
  { es: ' y ', en: ' and ' },
]

const SPANISH_HINTS = [' queso ', ' miel ', ' avena ', ' con ', ' sin ', ' para ', ' de ', ' artesan', ' ecologic', ' producto ', ' caja ', ' bolsa ', ' bandeja ', ' tomate ', ' aceite ', ' yogur ', ' pan ', ' vino ', ' uds ', ' uds. ', ' unidades ', ' unidad ']
const ENGLISH_HINTS = [' cheese ', ' honey ', ' oat ', ' with ', ' without ', ' for ', ' of ', ' artisan', ' organic', ' product ', ' box ', ' bag ', ' tray ', ' tomato ', ' olive ', ' yogurt ', ' bread ', ' wine ', ' units ', ' unit ']

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeForLanguageChecks(value: string) {
  return ` ${value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')} `
}

function applyCaseFromSource(source: string, replacement: string) {
  if (source === source.toUpperCase()) return replacement.toUpperCase()
  if (source[0] && source[0] === source[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

function buildPhrasePattern(phrase: string) {
  const escaped = escapeRegExp(phrase.trim()).replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${escaped}\\b`, 'gi')
}

function cleanTranslatedText(value: string) {
  return value
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function fixProductTitleOrder(value: string, locale: Locale) {
  if (locale === 'en') {
    return value
      .replace(/\bGoat with honey cheese\b/gi, 'Goat cheese with honey')
      .replace(/\bCookies oat and honey\b/gi, 'Oat and honey cookies')
      .replace(/\bOil olive extra virgin\b/gi, 'Extra virgin olive oil')
      .replace(/\bTomatoes cherry organic\b/gi, 'Organic cherry tomatoes')
      .replace(/\bJam strawberry artisan\b/gi, 'Artisan strawberry jam')
  }

  return value
    .replace(/\bQueso de cabra con miel\b/gi, 'Queso de cabra con miel')
    .replace(/\bGalletas de avena y miel\b/gi, 'Galletas de avena y miel')
}

function getLanguageLabel(locale: Locale, displayLocale: Locale) {
  if (displayLocale === 'en') return locale === 'es' ? 'Spanish' : 'English'
  return locale === 'es' ? 'español' : 'inglés'
}

function detectTextLocale(value: string): Locale | null {
  if (!value.trim()) return null

  const normalized = normalizeForLanguageChecks(value)
  let spanishScore = /[áéíóúñ]/i.test(value) ? 2 : 0
  let englishScore = 0

  for (const hint of SPANISH_HINTS) {
    if (normalized.includes(hint)) spanishScore += 1
  }

  for (const hint of ENGLISH_HINTS) {
    if (normalized.includes(hint)) englishScore += 1
  }

  if (spanishScore === 0 && englishScore === 0) return null
  return spanishScore >= englishScore ? 'es' : 'en'
}

function detectProductSourceLocale(product: ProductLike): Locale | null {
  const sample = [product.name, product.description, product.unit].filter(Boolean).join(' ')
  return detectTextLocale(sample)
}

function translateWithGlossary(
  value: string,
  glossary: Array<{ es: string; en: string }>,
  sourceLocale: Locale,
  targetLocale: Locale
) {
  return glossary
    .slice()
    .sort((left, right) => right[sourceLocale].length - left[sourceLocale].length)
    .reduce((current, entry) => {
      const source = entry[sourceLocale]
      const replacement = entry[targetLocale]
      return current.replace(buildPhrasePattern(source), match => applyCaseFromSource(match, replacement))
    }, value)
}

function autoTranslateText(value: string, sourceLocale: Locale, targetLocale: Locale) {
  if (!value || sourceLocale === targetLocale) return value

  const translated = translateWithGlossary(value, AUTO_TRANSLATION_GLOSSARY, sourceLocale, targetLocale)
  return fixProductTitleOrder(cleanTranslatedText(translated), targetLocale)
}

export function getCatalogCopy(locale: Locale): CatalogCopy {
  return locale === 'en' ? EN_CATALOG_COPY : ES_CATALOG_COPY
}

export function translateProductUnit(value: string, locale: Locale): string {
  if (!value) return value

  const sourceLocale = detectTextLocale(value)
  if (!sourceLocale || sourceLocale === locale) return value

  return cleanTranslatedText(translateWithGlossary(value, UNIT_TRANSLATIONS, sourceLocale, locale))
}

export function translateProductLabel(value: string, locale: Locale): string {
  if (!value) return value

  const sourceLocale = detectTextLocale(value)
  const translated = sourceLocale && sourceLocale !== locale
    ? autoTranslateText(value, sourceLocale, locale)
    : translateProductUnit(value, locale)

  if (locale !== 'en' || !translated) return translated
  return translated.charAt(0).toUpperCase() + translated.slice(1)
}

export function getLocalizedCertificationCopy(certification: string, locale: Locale): CertificationCopy {
  return getCatalogCopy(locale).certifications[certification] ?? { label: certification, description: certification }
}

export function getLocalizedProductCopy<T extends ProductLike>(product: T, locale: Locale) {
  const sourceLocale = detectProductSourceLocale(product)
  const copy = getCatalogCopy(locale)
  const shouldTranslate = Boolean(sourceLocale && sourceLocale !== locale)
  const curatedEnglishCopy = locale === 'en' ? PRODUCT_COPY_EN[product.slug] : undefined

  return {
    ...product,
    name: curatedEnglishCopy?.name ?? (shouldTranslate && sourceLocale ? autoTranslateText(product.name, sourceLocale, locale) : product.name),
    description:
      curatedEnglishCopy?.description ??
      (shouldTranslate && sourceLocale && product.description
        ? autoTranslateText(product.description, sourceLocale, locale)
        : product.description),
    unit: translateProductUnit(curatedEnglishCopy?.unit ?? product.unit ?? '', locale),
    translation: {
      isAutoTranslated: shouldTranslate,
      sourceLocale,
      badgeLabel: shouldTranslate && sourceLocale
        ? copy.translation.autoTranslatedFrom(getLanguageLabel(sourceLocale, locale))
        : '',
      badgeTitle: shouldTranslate && sourceLocale
        ? copy.translation.originalLanguageHint(getLanguageLabel(sourceLocale, locale))
        : '',
    } satisfies ProductTranslationMeta,
  }
}
