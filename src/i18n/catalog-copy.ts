// Static page content module. See ./README.md for when to use *-copy.ts vs flat keys.
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
    topRated: string
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
    ratingAriaLabel: (rating: number) => string
    reviewCount: (count: number) => string
    verifiedPurchase: string
    reportLabel: string
    reportAria: string
    reportDone: string
    reportReasonTitle: string
    reportReasons: {
      SPAM: string
      OFFENSIVE: string
      OFF_TOPIC: string
      FAKE: string
      OTHER: string
    }
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
    shippingEtaPeninsula: string
    shippingCostFormat: (formattedPrice: string, zoneLabel: string) => string
    shippingZoneLabel: {
      peninsula: string
      baleares: string
      canarias: string
      ceuta: string
      melilla: string
    }
    shippingDisclaimerPeninsula: string
    shippingDisclaimerInsular: string
  }
  vendor: {
    heroImageAlt: (name: string) => string
    logoAlt: (name: string) => string
    ratingLabel: (rating: string, count: number) => string
    memberSinceDate: (date: string) => string
    preparationDays: (days: number) => string
    orderCutoff: (time: string) => string
    aboutTitle: string
    aboutEmpty: string
    trustDirectSale: string
    trustSmallBatch: string
    trustLocalOrigin: string
    productsTitle: (count: number) => string
    productsEmpty: string
    reviewsTitle: (count: number) => string
    breadcrumbProducers: string
    noReviews: string
  }
}

const ES_CATALOG_COPY: CatalogCopy = {
  page: {
    title: 'Productos',
    description: 'Explora el catálogo de productos locales disponibles en Raíz Directa.',
    searchTitle: 'Buscar',
    searchDescription: 'Busca productos, productores y categorías en Raíz Directa.',
    searchTitleWithQuery: query => `Buscar: ${query}`,
    searchDescriptionWithQuery: query => `Resultados de búsqueda para "${query}" en Raíz Directa.`,
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
    topRated: 'Mejor valorados',
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
    ratingAriaLabel: rating => `${rating.toFixed(1)} de 5 estrellas`,
    reviewCount: count => (count === 1 ? '1 reseña' : `${count} reseñas`),
    verifiedPurchase: 'Compra verificada',
    reportLabel: 'Reportar',
    reportAria: 'Reportar esta reseña',
    reportDone: 'Gracias, lo revisaremos.',
    reportReasonTitle: '¿Por qué reportas esta reseña?',
    reportReasons: {
      SPAM: 'Publicidad o spam',
      OFFENSIVE: 'Lenguaje ofensivo',
      OFF_TOPIC: 'No habla del producto',
      FAKE: 'Parece falsa',
      OTHER: 'Otro motivo',
    },
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
    shippingEtaPeninsula: 'Llega en 3–5 días laborables a península',
    shippingCostFormat: (price, zoneLabel) => `Envío ${price} a ${zoneLabel}`,
    shippingZoneLabel: {
      peninsula: 'península',
      baleares: 'Baleares',
      canarias: 'Canarias',
      ceuta: 'Ceuta',
      melilla: 'Melilla',
    },
    shippingDisclaimerPeninsula: 'El coste exacto se calcula en el checkout con tu código postal.',
    shippingDisclaimerInsular: 'Plazo y coste exactos según destino. Recalculados en el checkout.',
  },
  vendor: {
    heroImageAlt: name => `Portada de ${name}`,
    logoAlt: name => `Logo de ${name}`,
    ratingLabel: (rating, count) => `${rating} · ${count} valoración${count === 1 ? '' : 'es'}`,
    memberSinceDate: date => `Desde ${date}`,
    preparationDays: days => `Preparación en ${days} día${days === 1 ? '' : 's'}`,
    orderCutoff: time => `Pedidos antes de las ${time}`,
    aboutTitle: 'Nuestra historia',
    aboutEmpty: 'Este productor aún no ha añadido una descripción.',
    trustDirectSale: 'Venta directa',
    trustSmallBatch: 'Pequeño lote',
    trustLocalOrigin: 'Origen local',
    productsTitle: count => `Productos (${count})`,
    productsEmpty: 'Este productor aún no tiene productos publicados.',
    reviewsTitle: count => `Reseñas (${count})`,
    breadcrumbProducers: 'Productores',
    noReviews: 'Aún no hay reseñas. ¡Sé el primero en reseñar!',
  },
}

const EN_CATALOG_COPY: CatalogCopy = {
  page: {
    title: 'Products',
    description: 'Browse the local product catalogue available on Raíz Directa.',
    searchTitle: 'Search',
    searchDescription: 'Search products, producers and categories on Raíz Directa.',
    searchTitleWithQuery: query => `Search: ${query}`,
    searchDescriptionWithQuery: query => `Search results for "${query}" on Raíz Directa.`,
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
    topRated: 'Top rated',
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
    ratingAriaLabel: rating => `${rating.toFixed(1)} out of 5 stars`,
    reviewCount: count => (count === 1 ? '1 review' : `${count} reviews`),
    verifiedPurchase: 'Verified purchase',
    reportLabel: 'Report',
    reportAria: 'Report this review',
    reportDone: 'Thanks, we\'ll review it.',
    reportReasonTitle: 'Why are you reporting this review?',
    reportReasons: {
      SPAM: 'Spam or advertising',
      OFFENSIVE: 'Offensive language',
      OFF_TOPIC: 'Not about the product',
      FAKE: 'Looks fake',
      OTHER: 'Other reason',
    },
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
    shippingEtaPeninsula: 'Arrives in 3–5 business days to mainland Spain',
    shippingCostFormat: (price, zoneLabel) => `Shipping ${price} to ${zoneLabel}`,
    shippingZoneLabel: {
      peninsula: 'mainland Spain',
      baleares: 'the Balearic Islands',
      canarias: 'the Canary Islands',
      ceuta: 'Ceuta',
      melilla: 'Melilla',
    },
    shippingDisclaimerPeninsula: 'Exact cost is calculated at checkout with your postal code.',
    shippingDisclaimerInsular: 'Delivery time and cost depend on destination. Recalculated at checkout.',
  },
  vendor: {
    heroImageAlt: name => `${name} cover`,
    logoAlt: name => `${name} logo`,
    ratingLabel: (rating, count) => `${rating} · ${count} review${count === 1 ? '' : 's'}`,
    memberSinceDate: date => `Since ${date}`,
    preparationDays: days => `Ready in ${days} day${days === 1 ? '' : 's'}`,
    orderCutoff: time => `Orders before ${time}`,
    aboutTitle: 'Our story',
    aboutEmpty: 'This producer has not added a description yet.',
    trustDirectSale: 'Direct sale',
    trustSmallBatch: 'Small batch',
    trustLocalOrigin: 'Local origin',
    productsTitle: count => `Products (${count})`,
    productsEmpty: 'This producer has no published products yet.',
    reviewsTitle: count => `Reviews (${count})`,
    breadcrumbProducers: 'Producers',
    noReviews: 'No reviews yet. Be the first to leave a review!',
  },
}

const PRODUCT_COPY_EN: Record<string, { name: string; description?: string; unit?: string }> = {
  'tomates-cherry-ecologicos': {
    name: 'Organic cherry tomatoes',
    description: 'Thin-skinned cherry tomatoes with firm flesh and a sweetness you only get by letting them ripen on the vine. Grown in an unheated solar greenhouse with drip irrigation and organic compost from our own composting system.\n\nPicked every morning so they reach your table with freshness intact. Perfect for salads, pasta, homemade pizza or simply snacking straight from the punnet. During peak season (May–October) the flavour is even more intense.',
  },
  'calabacin-tierno-temporada': {
    name: 'Tender seasonal zucchini',
    description: 'Slim courgettes with soft skin and a delicate texture, ideal for slicing on the griddle, spiralising into veggie noodles or blending into full-bodied vegetable soups. We harvest them young so the seeds remain tiny and the flavour stays concentrated.\n\nWe plant in staggered batches for continuous production from April to November. Every piece is hand-selected for even size and leaves the farm on the same day it is picked.',
  },
  'huevos-gallinas-camperas': {
    name: 'Free-range eggs',
    description: 'Our hens roam freely across the farm, foraging on grass, insects and supplementary organic grain. The result: eggs with deep orange yolks, strong shells and a flavour that makes a real difference in omelettes, fried eggs and baking.\n\nGrade A, size L (63–73 g). Collected daily and date-stamped at laying. We skip industrial washing to preserve the natural protective cuticle. They reach your doorstep within 48 hours of being laid.',
  },
  'mermelada-artesana-fresa': {
    name: 'Artisan strawberry jam',
    description: 'Made with ripe strawberries from our own garden and just the right amount of cane sugar. Cooked slowly in copper pans so the fruit keeps its texture and natural aroma without turning watery.\n\nEach jar comes from a small batch — 60 jars per cook at most — and the consistency changes slightly with the season and ripeness of the fruit. Perfect on homemade bread for breakfast, as a cake filling or alongside mild cheeses.',
  },
  'pimientos-padron-ecologicos': {
    name: 'Organic Padrón peppers',
    description: 'Small, green and with that fine texture that fries quickly — crispy on the outside, tender inside. Ours are certified organic, grown in natural substrate with no chemical treatments.\n\nSold in 400 g trays, the ideal size for tapas. The classic method: toss in a hot pan with plenty of oil and finish with a generous pinch of coarse salt. They are our most popular item from Friday to Sunday, so order before Thursday to be safe.',
  },
  'cesta-mixta-huerta': {
    name: 'Mixed vegetable basket',
    description: 'Every week we put together a varied selection of the best the farm has to offer: tomatoes, courgettes, tender leaves, a handful of aromatic herbs and a surprise seasonal item that rotates so there is always something new.\n\nThe basket weighs roughly 4 kg and is designed for a household of 3–4 people or anyone who wants to cook varied meals through the week. Everything is organic, harvested on packing day and carefully wrapped to avoid transit damage.',
  },
  'naranjas-mesa-premium': {
    name: 'Premium table oranges',
    description: 'Navel Lane Late oranges — the most balanced variety for eating fresh. Thin skin, firm segments and a clean sweetness that never cloys. Hand-picked and never cold-stored: straight from the tree into the box.\n\nPerfect for eating in segments, in salads or for fresh morning juice. Even sizing (70–80 mm) and, because they receive no post-harvest treatment, they may show the odd surface mark that has zero effect on flavour or interior quality.',
  },
  'fresas-dulces-bandeja': {
    name: 'Sweet strawberry tray',
    description: 'San Andreas variety strawberries, naturally ripened without forcing. We pick them at first light when the sugars have built up overnight and the aroma is at its strongest. Each tray is prepared on the same day as harvesting.\n\nThe batch is deliberately small — we produce only enough to sell fresh. Ideal for dessert, paired with cream, with natural yogurt or simply eaten by the handful. During peak season (March–June), the flavour hits its absolute best.',
  },
  'miel-cruda-azahar': {
    name: 'Raw orange blossom honey',
    description: 'Unpasteurised, minimally filtered and unblended honey from our 30 hives set among the orange and lemon groves of the Valencian huerta. The orange blossom notes are unmistakable: sweet, smooth and with a delicate citrus undertone.\n\nBeing raw, it retains all its nutrients, enzymes and natural pollen. It may crystallise over time — a sign it has not been processed. A gentle bain-marie brings it back to liquid. Perfect for sweetening infusions, drizzling over yogurt or eating by the spoonful.',
  },
  'queso-cabra-curado': {
    name: 'Aged goat cheese',
    description: 'Made with raw milk from our own free-range goats grazing in the Picos de Europa. A 90-day cure in a natural stone cellar develops a firm paste and a lingering flavour with nutty overtones and a gentle peppery bite.\n\nEach piece weighs around 350 g and features a washed natural rind. Ideal on a cheese board, grated over fresh pasta or simply drizzled with honey and a few walnuts. Pairs beautifully with a young red wine or a natural Asturian cider.',
  },
  'yogur-oveja-natural': {
    name: 'Natural sheep yogurt',
    description: 'Made with Latxa sheep milk from nearby farms and house cultures we maintain in the dairy ourselves. The texture is creamy and dense, with a gentle tang that sets it apart from industrial yogurt. No added sugars, no thickeners, no colouring.\n\nSold in a two-pack of 125 g pots. Enjoy it plain, with orange blossom honey, fresh fruit or as a base for dressings and sauces. It is one of our most-reordered products among regular customers.',
  },
  'mantequilla-artesana-salada': {
    name: 'Artisan salted butter',
    description: 'Slow-churned with fresh cow cream and just the right touch of Añana sea salt. The result is a spreadable butter with a natural yellow colour and an intense flavour that transforms any slice of toast into a special breakfast.\n\nWe make it in small daily batches — no more than 30 pieces per run — each weighing 250 g and wrapped in parchment paper. It also works beautifully for cooking: it handles heat well and provides a depth of flavour no margarine can match.',
  },
  'aceite-oliva-virgen-extra': {
    name: 'Extra virgin olive oil',
    description: 'First cold-pressed oil made from Cornicabra olives harvested at early veraison. The result is a balanced EVOO with aromas of fresh-cut grass, a medium fruitiness and a gently peppery finish.\n\nBottled in dark glass to protect the oil from light. Each harvest is limited (around 3,000 bottles) and the nuances shift subtly from year to year. Equally at home drizzled raw over salads, toast and vegetables or used in gentle cooking and stewing.',
  },
  'vino-tinto-joven-tempranillo': {
    name: 'Young Tempranillo red wine',
    description: '100 % Tempranillo from our own 25- to 40-year-old vines in the Ribera del Duero. Fermented in temperature-controlled stainless steel and briefly aged in second-use French oak to round out the edges without masking the fruit.\n\nOn the nose: ripe cherry, blackcurrant and a hint of violet. On the palate it is approachable, with soft tannins and lively acidity that make it very easy to pair. Perfect with grilled meats, cured sausages, hearty legume stews or casual meals with friends. Serve at 14–16 °C.',
  },
  'pimientos-asados-conserva': {
    name: 'Fire-roasted peppers in a jar',
    description: 'Piquillo red peppers roasted directly over a wood fire, hand-peeled one by one and preserved in a light dressing of olive oil, sliced garlic and a pinch of salt. Nothing else.\n\nEach jar holds 8 to 10 peppers — enough for a generous tapa, a cod stuffing or an accompaniment to any spoon dish. Because they are hand-peeled, the texture is far more delicate than industrial versions.',
  },
  'pan-pueblo-masa-madre': {
    name: 'Sourdough country loaf',
    description: 'An 800 g loaf with a thick crust and moist crumb full of irregular air pockets. We use a natural sourdough starter fed daily, organic T80 stone-milled flour and a slow fermentation of at least 36 hours.\n\nThe result is a bread with character: slightly tangy taste, intense aroma and shelf life of 4–5 days without losing its charm. Baked on a refractory stone at 250 °C with steam. Ideal alongside any meal, for garlic soup or for making the best breakfast toast.',
  },
  'croissants-mantequilla': {
    name: 'Butter croissants',
    description: 'Artisan laminated pastry using quality French butter and a 24-hour cold proof that develops aroma and texture. The inside is honeycombed and light, with a clean butter taste that leaves no greasy aftertaste.\n\nBaked every morning between 5 and 7 am, they leave the bakery still warm. The pack includes four generously-sized pieces. Perfect on their own, with artisan jam or with a café con leche to start the day properly.',
  },
  'galletas-avena-miel': {
    name: 'Oat and honey cookies',
    description: 'A house recipe with wholegrain oats, flower honey, butter, egg and a pinch of cinnamon. Hand-shaped in small batches, the baking time is dialled in so they come out crispy on the outside and soft in the middle.\n\nEach bag holds 300 g of generously-sized cookies. Perfect with a mid-morning coffee, an afternoon glass of milk or as a sweet snack that does not rely on ultra-processing. We also use them as a tart base in the bakery.',
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
