import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/client'
import { getServerEnv } from '../src/lib/env'

const adapter = new PrismaPg({ connectionString: getServerEnv().databaseUrl })
const db = new PrismaClient({ adapter })

const categories = [
  { id: 'cat-verduras', name: 'Verduras y Hortalizas', slug: 'verduras', icon: '🥦', sortOrder: 1 },
  { id: 'cat-frutas', name: 'Frutas', slug: 'frutas', icon: '🍎', sortOrder: 2 },
  { id: 'cat-lacteos', name: 'Lácteos y Huevos', slug: 'lacteos', icon: '🧀', sortOrder: 3 },
  { id: 'cat-carnicos', name: 'Cárnicos', slug: 'carnicos', icon: '🥩', sortOrder: 4 },
  { id: 'cat-aceites', name: 'Aceites y Conservas', slug: 'aceites', icon: '🫒', sortOrder: 5 },
  { id: 'cat-panaderia', name: 'Panadería y Repostería', slug: 'panaderia', icon: '🍞', sortOrder: 6 },
  { id: 'cat-vinos', name: 'Vinos y Bebidas', slug: 'vinos', icon: '🍷', sortOrder: 7 },
  { id: 'cat-miel', name: 'Miel y Mermeladas', slug: 'miel', icon: '🍯', sortOrder: 8 },
]

const demoConfig = [
  { key: 'commission_default', value: 0.12, description: 'Comisión por defecto (12%)' },
  { key: 'DEFAULT_COMMISSION_RATE', value: 0.12, description: 'Comisión por defecto (12%)' },
  { key: 'sla_hours', value: 48, description: 'Horas SLA para incidencias' },
  { key: 'FREE_SHIPPING_THRESHOLD', value: 35, description: 'Importe mínimo para envío gratis' },
  { key: 'FLAT_SHIPPING_COST', value: 4.95, description: 'Coste fijo de envío estándar' },
  { key: 'MAINTENANCE_MODE', value: false, description: 'Modo mantenimiento del storefront' },
  {
    key: 'HERO_BANNER_TEXT',
    value: 'Demo activa: catálogo ampliado con productos, productores y reseñas de ejemplo.',
    description: 'Texto principal del banner de home',
  },
]

const vendorBlueprints = [
  {
    user: {
      email: 'productor@test.com',
      firstName: 'Carlos',
      lastName: 'García',
      password: 'vendor1234',
    },
    vendor: {
      slug: 'finca-garcia',
      displayName: 'Finca García',
      description: 'Productores ecológicos en la Sierra de Gredos. Temporada corta, recogida diaria y envíos directos desde finca.',
      location: 'Ávila, Castilla y León',
      logo: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400',
      coverImage: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=1200',
      status: 'ACTIVE' as const,
      commissionRate: 0.1,
      orderCutoffTime: '14:00',
      preparationDays: 2,
      iban: 'ES9121000418450200051332',
      bankAccountName: 'Carlos García',
      stripeOnboarded: false,
    },
    products: [
      {
        id: 'prod-tomates',
        categoryId: 'cat-verduras',
        name: 'Tomates cherry ecológicos',
        slug: 'tomates-cherry-ecologicos',
        description: 'Tomates cherry cultivados sin pesticidas en invernadero solar. Dulces, firmes y recogidos en el día.',
        images: [
          'https://images.unsplash.com/photo-1546470427-e26264be0b0d?w=1200',
          'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 3.5,
        taxRate: 0.04,
        unit: 'kg',
        stock: 50,
        certifications: ['ECO-ES', 'KM0'],
        originRegion: 'Ávila',
        tags: ['tomate', 'eco', 'ensalada', 'temporada'],
      },
      {
        id: 'prod-calabacin',
        categoryId: 'cat-verduras',
        name: 'Calabacín tierno de temporada',
        slug: 'calabacin-tierno-temporada',
        description: 'Pieza fina, piel suave y sabor delicado. Ideal para plancha, cremas y cocina rápida.',
        images: [
          'https://images.unsplash.com/photo-1603048719539-9ecb4f18ba90?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 2.9,
        taxRate: 0.04,
        unit: 'kg',
        stock: 34,
        certifications: ['ECO-ES'],
        originRegion: 'Ávila',
        tags: ['verdura', 'eco', 'plancha'],
      },
      {
        id: 'prod-huevos',
        categoryId: 'cat-lacteos',
        name: 'Huevos de gallinas camperas',
        slug: 'huevos-gallinas-camperas',
        description: 'Huevos de gallinas criadas en libertad. Categoría A, clase L, con yema intensa y fresca.',
        images: [
          'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 4.8,
        taxRate: 0.04,
        unit: 'docena',
        stock: 120,
        certifications: ['KM0'],
        originRegion: 'Ávila',
        tags: ['huevos', 'camperos', 'desayuno'],
      },
      {
        id: 'prod-mermelada-fresa',
        categoryId: 'cat-miel',
        name: 'Mermelada artesana de fresa',
        slug: 'mermelada-artesana-fresa',
        description: 'Elaborada en pequeños lotes con fruta madura y cocción lenta para conservar textura y aroma.',
        images: [
          'https://images.unsplash.com/photo-1514996937319-344454492b37?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 5.4,
        compareAtPrice: 6.2,
        taxRate: 0.1,
        unit: 'tarro 280g',
        stock: 18,
        certifications: ['KM0'],
        originRegion: 'Ávila',
        tags: ['mermelada', 'artesano', 'desayuno'],
      },
      {
        id: 'prod-pimientos-padron',
        categoryId: 'cat-verduras',
        name: 'Pimientos de Padrón ecológicos',
        slug: 'pimientos-padron-ecologicos',
        description: 'Caja corta de pimientos verdes con calibre pequeño y textura fina. Muy demandados en fin de semana.',
        images: [
          'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 3.9,
        taxRate: 0.04,
        unit: 'bandeja 400g',
        stock: 4,
        certifications: ['ECO-ES', 'KM0'],
        originRegion: 'Ávila',
        tags: ['pimiento', 'tapa', 'temporada'],
      },
      {
        id: 'prod-cesta-huerta',
        categoryId: 'cat-verduras',
        name: 'Cesta mixta de huerta',
        slug: 'cesta-mixta-huerta',
        description: 'Selección semanal con tomates, calabacín, hojas tiernas y producto sorpresa de temporada.',
        images: [
          'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 14.5,
        compareAtPrice: 16.2,
        taxRate: 0.04,
        unit: 'cesta 4kg',
        stock: 0,
        certifications: ['ECO-ES', 'KM0'],
        originRegion: 'Ávila',
        tags: ['cesta', 'huerta', 'familia'],
      },
      {
        id: 'prod-patatas-rojas',
        categoryId: 'cat-verduras',
        name: 'Patata roja lavada',
        slug: 'patata-roja-lavada',
        description: 'Patata firme para asado y guiso, lavada en origen y calibrada para cocina diaria.',
        images: [
          'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=1200',
        ],
        status: 'PENDING_REVIEW' as const,
        basePrice: 2.6,
        taxRate: 0.04,
        unit: 'kg',
        stock: 40,
        certifications: ['KM0'],
        originRegion: 'Ávila',
        tags: ['patata', 'guiso', 'despensa'],
      },
      {
        id: 'prod-cebolla-dulce',
        categoryId: 'cat-verduras',
        name: 'Cebolla dulce seleccionada',
        slug: 'cebolla-dulce-seleccionada',
        description: 'Lote de cebolla dulce para horno y sofritos largos. Producto pausado por etiquetado incompleto.',
        images: [
          'https://images.unsplash.com/photo-1508747703725-719777637510?w=1200',
        ],
        status: 'REJECTED' as const,
        basePrice: 2.2,
        taxRate: 0.04,
        unit: 'kg',
        stock: 18,
        certifications: ['KM0'],
        originRegion: 'Ávila',
        tags: ['cebolla', 'sofrito', 'cocina'],
        rejectionNote: 'Falta indicar el calibre y completar la información de trazabilidad del lote.',
      },
      {
        id: 'prod-lechuga-romana',
        categoryId: 'cat-verduras',
        name: 'Lechuga romana fresca',
        slug: 'lechuga-romana-fresca',
        description: 'Lechuga de hoja crujiente preparada para venta rápida. El lote de demo aparece caducado para probar alertas internas.',
        images: [
          'https://images.unsplash.com/photo-1622205313162-be1d5712a43d?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 1.9,
        taxRate: 0.04,
        unit: 'pieza',
        stock: 6,
        certifications: ['ECO-ES'],
        originRegion: 'Ávila',
        tags: ['lechuga', 'ensalada', 'fresco'],
        expiresAt: new Date('2026-04-05T08:00:00Z'),
      },
    ],
    variants: [
      { sku: 'TOM-250', productId: 'prod-tomates', name: 'Caja 250 g', priceModifier: -1.1, stock: 20 },
      { sku: 'TOM-1KG', productId: 'prod-tomates', name: 'Caja 1 kg', priceModifier: 0, stock: 30 },
      { sku: 'TOM-2KG', productId: 'prod-tomates', name: 'Caja 2 kg', priceModifier: 2.8, stock: 12 },
    ],
  },
  {
    user: {
      email: 'huerta@demo.com',
      firstName: 'Lucía',
      lastName: 'Martín',
      password: 'vendor1234',
    },
    vendor: {
      slug: 'huerta-la-solana',
      displayName: 'Huerta La Solana',
      description: 'Huerta familiar especializada en cítricos, fruta de hueso y lotes de temporada con recolección bajo pedido.',
      location: 'Valencia, Comunidad Valenciana',
      logo: 'https://images.unsplash.com/photo-1461354464878-ad92f492a5a0?w=400',
      coverImage: 'https://images.unsplash.com/photo-1471193945509-9ad0617afabf?w=1200',
      status: 'ACTIVE' as const,
      commissionRate: 0.11,
      orderCutoffTime: '13:00',
      preparationDays: 1,
      stripeOnboarded: false,
    },
    products: [
      {
        id: 'prod-naranjas',
        categoryId: 'cat-frutas',
        name: 'Naranjas de mesa premium',
        slug: 'naranjas-mesa-premium',
        description: 'Naranjas dulces, piel fina y calibre homogéneo. Recolectadas a mano y sin cámara.',
        images: [
          'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=1200',
          'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 3.2,
        compareAtPrice: 3.9,
        taxRate: 0.04,
        unit: 'kg',
        stock: 70,
        certifications: ['KM0'],
        originRegion: 'Valencia',
        tags: ['naranja', 'citrico', 'zumo'],
      },
      {
        id: 'prod-fresas',
        categoryId: 'cat-frutas',
        name: 'Fresas dulces en bandeja',
        slug: 'fresas-dulces-bandeja',
        description: 'Fresas aromáticas con maduración natural. Lote corto para mantener frescura y sabor.',
        images: [
          'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 4.1,
        taxRate: 0.04,
        unit: 'bandeja 500g',
        stock: 24,
        certifications: ['ECO-ES'],
        originRegion: 'Valencia',
        tags: ['fresa', 'fruta', 'postre'],
      },
      {
        id: 'prod-miel-azahar',
        categoryId: 'cat-miel',
        name: 'Miel cruda de azahar',
        slug: 'miel-cruda-azahar',
        description: 'Miel sin pasteurizar con notas florales y textura sedosa. Procede de colmenas cercanas a floración de cítrico.',
        images: [
          'https://images.unsplash.com/photo-1587049352851-8d4e89133924?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 8.9,
        taxRate: 0.1,
        unit: 'tarro 500g',
        stock: 16,
        certifications: ['BIO'],
        originRegion: 'Valencia',
        tags: ['miel', 'azahar', 'despensa'],
      },
    ],
    variants: [],
  },
  {
    user: {
      email: 'queseria@demo.com',
      firstName: 'Mateo',
      lastName: 'Suárez',
      password: 'vendor1234',
    },
    vendor: {
      slug: 'queseria-monteazul',
      displayName: 'Quesería Monteazul',
      description: 'Quesería artesanal de montaña con leche diaria y afinados lentos. Lotes pequeños, corteza natural y producción propia.',
      location: 'Cangas de Onís, Asturias',
      logo: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400',
      coverImage: 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?w=1200',
      status: 'ACTIVE' as const,
      commissionRate: 0.12,
      orderCutoffTime: '12:00',
      preparationDays: 2,
      stripeOnboarded: false,
    },
    products: [
      {
        id: 'prod-queso-cabra',
        categoryId: 'cat-lacteos',
        name: 'Queso de cabra curado',
        slug: 'queso-cabra-curado',
        description: 'Pasta compacta y sabor persistente. Curación de 90 días, ideal para tabla o rallado fino.',
        images: [
          'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 9.5,
        compareAtPrice: 11.2,
        taxRate: 0.1,
        unit: 'pieza 350g',
        stock: 14,
        certifications: ['DOP'],
        originRegion: 'Asturias',
        tags: ['queso', 'cabra', 'tabla'],
      },
      {
        id: 'prod-yogur-oveja',
        categoryId: 'cat-lacteos',
        name: 'Yogur de oveja natural',
        slug: 'yogur-oveja-natural',
        description: 'Yogur cremoso y ligeramente ácido, elaborado con fermentos propios y sin azúcares añadidos.',
        images: [
          'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 3.6,
        taxRate: 0.04,
        unit: 'pack 2 x 125g',
        stock: 22,
        certifications: ['BIO'],
        originRegion: 'Asturias',
        tags: ['yogur', 'lacteo', 'desayuno'],
      },
      {
        id: 'prod-mantequilla',
        categoryId: 'cat-lacteos',
        name: 'Mantequilla artesana salada',
        slug: 'mantequilla-artesana-salada',
        description: 'Batida lentamente y con un punto de sal marina. Untuosa, intensa y perfecta para tostas o cocina.',
        images: [
          'https://images.unsplash.com/photo-1589985270958-b3f6d0d4d04f?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 4.4,
        taxRate: 0.1,
        unit: 'pieza 250g',
        stock: 10,
        certifications: ['KM0'],
        originRegion: 'Asturias',
        tags: ['mantequilla', 'artesano', 'despensa'],
      },
    ],
    variants: [
      { sku: 'QCC-350', productId: 'prod-queso-cabra', name: 'Pieza 350 g', priceModifier: 0, stock: 8 },
      { sku: 'QCC-700', productId: 'prod-queso-cabra', name: 'Pieza 700 g', priceModifier: 8.2, stock: 6 },
    ],
  },
  {
    user: {
      email: 'bodega@demo.com',
      firstName: 'Ana',
      lastName: 'Herrero',
      password: 'vendor1234',
    },
    vendor: {
      slug: 'bodega-ribera-viva',
      displayName: 'Bodega Ribera Viva',
      description: 'Viñedo propio y producción limitada. Vinos frescos, honestos y pensados para mesa diaria y ocasiones especiales.',
      location: 'Valladolid, Castilla y León',
      logo: 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?w=400',
      coverImage: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1200',
      status: 'ACTIVE' as const,
      commissionRate: 0.13,
      orderCutoffTime: '16:00',
      preparationDays: 2,
      stripeOnboarded: false,
    },
    products: [
      {
        id: 'prod-aceite',
        categoryId: 'cat-aceites',
        name: 'Aceite de oliva virgen extra',
        slug: 'aceite-oliva-virgen-extra',
        description: 'AOVE de primera prensada en frío. Variedad Cornicabra, equilibrado y con final ligeramente picante.',
        images: [
          'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 12,
        compareAtPrice: 15,
        taxRate: 0.1,
        unit: 'botella 750ml',
        stock: 30,
        certifications: ['ECO-ES', 'DOP'],
        originRegion: 'Valladolid',
        tags: ['aceite', 'aove', 'despensa'],
      },
      {
        id: 'prod-vino-tinto',
        categoryId: 'cat-vinos',
        name: 'Vino tinto joven tempranillo',
        slug: 'vino-tinto-joven-tempranillo',
        description: 'Vino joven con fruta roja, paso amable y acidez viva. Muy fácil de beber y perfecto para compartir.',
        images: [
          'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 8.7,
        compareAtPrice: 10.4,
        taxRate: 0.21,
        unit: 'botella 750ml',
        stock: 44,
        certifications: ['IGP'],
        originRegion: 'Valladolid',
        tags: ['vino', 'tempranillo', 'bodega'],
      },
      {
        id: 'prod-conserva-pimientos',
        categoryId: 'cat-aceites',
        name: 'Pimientos asados en conserva',
        slug: 'pimientos-asados-conserva',
        description: 'Pimientos rojos asados al fuego, pelados a mano y conservados con un aliño suave.',
        images: [
          'https://images.unsplash.com/photo-1598514982841-7f4df73d1c4c?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 6.1,
        taxRate: 0.1,
        unit: 'tarro 400g',
        stock: 28,
        certifications: ['KM0'],
        originRegion: 'Valladolid',
        tags: ['conserva', 'pimiento', 'despensa'],
      },
    ],
    variants: [],
  },
  {
    user: {
      email: 'obrador@demo.com',
      firstName: 'Elena',
      lastName: 'Ibarra',
      password: 'vendor1234',
    },
    vendor: {
      slug: 'obrador-santa-ines',
      displayName: 'Obrador Santa Inés',
      description: 'Panadería y obrador de fermentación lenta. Harinas locales, masas madre activas y horneado diario.',
      location: 'Pamplona, Navarra',
      logo: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400',
      coverImage: 'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?w=1200',
      status: 'ACTIVE' as const,
      commissionRate: 0.09,
      orderCutoffTime: '11:00',
      preparationDays: 1,
      stripeOnboarded: false,
    },
    products: [
      {
        id: 'prod-pan-pueblo',
        categoryId: 'cat-panaderia',
        name: 'Pan de pueblo de masa madre',
        slug: 'pan-pueblo-masa-madre',
        description: 'Hogaza de corteza crujiente y miga húmeda. Fermentación larga y harina molida a piedra.',
        images: [
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 4.9,
        taxRate: 0.04,
        unit: 'pieza 800g',
        stock: 12,
        certifications: ['KM0'],
        originRegion: 'Navarra',
        tags: ['pan', 'masa madre', 'horno'],
      },
      {
        id: 'prod-croissants',
        categoryId: 'cat-panaderia',
        name: 'Croissants de mantequilla',
        slug: 'croissants-mantequilla',
        description: 'Hojaldre ligero, interior alveolado y mantequilla con sabor limpio. Recién hechos cada mañana.',
        images: [
          'https://images.unsplash.com/photo-1555507036-ab794f4ade0a?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 6.8,
        taxRate: 0.1,
        unit: 'pack 4 uds',
        stock: 9,
        certifications: ['ARTESANO'],
        originRegion: 'Navarra',
        tags: ['bolleria', 'desayuno', 'mantequilla'],
      },
      {
        id: 'prod-galletas-avena',
        categoryId: 'cat-panaderia',
        name: 'Galletas de avena y miel',
        slug: 'galletas-avena-miel',
        description: 'Crujientes por fuera, tiernas por dentro y con dulzor suave. Perfectas para café o merienda.',
        images: [
          'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=1200',
        ],
        status: 'ACTIVE' as const,
        basePrice: 5.1,
        taxRate: 0.1,
        unit: 'bolsa 300g',
        stock: 26,
        certifications: ['KM0'],
        originRegion: 'Navarra',
        tags: ['galletas', 'avena', 'merienda'],
      },
    ],
    variants: [],
  },
]

const customerBlueprints = [
  {
    email: 'cliente@test.com',
    firstName: 'María',
    lastName: 'López',
    password: 'cliente1234',
  },
  {
    email: 'marta@demo.com',
    firstName: 'Marta',
    lastName: 'Santos',
    password: 'cliente1234',
  },
  {
    email: 'javier@demo.com',
    firstName: 'Javier',
    lastName: 'Romero',
    password: 'cliente1234',
  },
]

const adminSideVendorBlueprints = [
  {
    user: {
      email: 'almazara@demo.com',
      firstName: 'Diego',
      lastName: 'Morales',
      password: 'vendor1234',
    },
    vendor: {
      slug: 'almazara-nueva-era',
      displayName: 'Almazara Nueva Era',
      description: 'Solicitud pendiente de revisión documental y validación del registro sanitario.',
      location: 'Jaén, Andalucía',
      status: 'APPLYING' as const,
      commissionRate: 0.12,
      orderCutoffTime: '15:00',
      preparationDays: 2,
      stripeOnboarded: false,
    },
  },
  {
    user: {
      email: 'granja@demo.com',
      firstName: 'Paula',
      lastName: 'Rey',
      password: 'vendor1234',
    },
    vendor: {
      slug: 'granja-los-almendros',
      displayName: 'Granja Los Almendros',
      description: 'Alta iniciada, a la espera de completar documentación bancaria y fiscal.',
      location: 'Segovia, Castilla y León',
      status: 'PENDING_DOCS' as const,
      commissionRate: 0.12,
      orderCutoffTime: '12:30',
      preparationDays: 2,
      stripeOnboarded: false,
    },
  },
  {
    user: {
      email: 'secano@demo.com',
      firstName: 'Rosa',
      lastName: 'Navarro',
      password: 'vendor1234',
    },
    vendor: {
      slug: 'secano-del-sur',
      displayName: 'Secano del Sur',
      description: 'Cuenta suspendida temporalmente por incidencias reiteradas en preparación de pedidos.',
      location: 'Almería, Andalucía',
      status: 'SUSPENDED_TEMP' as const,
      commissionRate: 0.15,
      orderCutoffTime: '13:30',
      preparationDays: 3,
      stripeOnboarded: true,
    },
  },
]

const extraCommissionRules = [
  { id: 'rule-vendor-finca', vendorSlug: 'finca-garcia', type: 'PERCENTAGE' as const, rate: 0.1, isActive: true },
  { id: 'rule-vendor-obrador', vendorSlug: 'obrador-santa-ines', type: 'PERCENTAGE' as const, rate: 0.09, isActive: true },
  { id: 'rule-cat-panaderia', categoryId: 'cat-panaderia', type: 'PERCENTAGE' as const, rate: 0.08, isActive: true },
  { id: 'rule-cat-vinos', categoryId: 'cat-vinos', type: 'FIXED' as const, rate: 1.25, isActive: false },
]

async function upsertUser({
  email,
  password,
  role,
  firstName,
  lastName,
}: {
  email: string
  password: string
  role: 'SUPERADMIN' | 'VENDOR' | 'CUSTOMER'
  firstName: string
  lastName: string
}) {
  const passwordHash = await bcrypt.hash(password, 12)

  return db.user.upsert({
    where: { email },
    update: {
      passwordHash,
      firstName,
      lastName,
      role,
      emailVerified: new Date(),
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      firstName,
      lastName,
      role,
      emailVerified: new Date(),
      isActive: true,
    },
  })
}

async function main() {
  console.log('🌱 Seeding database...')

  for (const config of demoConfig) {
    await db.marketplaceConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: config,
    })
  }

  // Global commission rule - commented out as it violates the check constraint
  // (CommissionRule requires at least vendorId or categoryId)
  // await db.commissionRule.upsert({
  //   where: { id: 'global-rule' },
  //   update: { type: 'PERCENTAGE', rate: 0.12, isActive: true },
  //   create: { id: 'global-rule', type: 'PERCENTAGE', rate: 0.12, isActive: true },
  // })

  for (const category of categories) {
    await db.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    })
  }

  const admin = await upsertUser({
    email: 'admin@marketplace.com',
    password: 'admin1234',
    firstName: 'Admin',
    lastName: 'Marketplace',
    role: 'SUPERADMIN',
  })
  console.log(`  ✓ Admin: ${admin.email}`)

  const vendorsBySlug = new Map<string, { id: string; displayName: string; userEmail: string }>()

  for (const blueprint of vendorBlueprints) {
    const user = await upsertUser({
      email: blueprint.user.email,
      password: blueprint.user.password,
      firstName: blueprint.user.firstName,
      lastName: blueprint.user.lastName,
      role: 'VENDOR',
    })

    const vendor = await db.vendor.upsert({
      where: { userId: user.id },
      update: blueprint.vendor,
      create: {
        ...blueprint.vendor,
        userId: user.id,
      },
    })

    vendorsBySlug.set(vendor.slug, {
      id: vendor.id,
      displayName: vendor.displayName,
      userEmail: user.email,
    })

    for (const product of blueprint.products) {
      await db.product.upsert({
        where: { slug: product.slug },
        update: {
          ...product,
          vendorId: vendor.id,
        },
        create: {
          ...product,
          vendorId: vendor.id,
        },
      })
    }

    for (const variant of blueprint.variants) {
      const product = blueprint.products.find(item => item.id === variant.productId)
      if (!product) continue

      await db.productVariant.upsert({
        where: { sku: variant.sku },
        update: {
          productId: variant.productId,
          name: variant.name,
          priceModifier: variant.priceModifier,
          stock: variant.stock,
          isActive: true,
        },
        create: {
          sku: variant.sku,
          productId: variant.productId,
          name: variant.name,
          priceModifier: variant.priceModifier,
          stock: variant.stock,
          isActive: true,
        },
      })
    }

    console.log(`  ✓ Vendor: ${user.email} → ${vendor.displayName} (${blueprint.products.length} productos)`)
  }

  for (const blueprint of adminSideVendorBlueprints) {
    const user = await upsertUser({
      email: blueprint.user.email,
      password: blueprint.user.password,
      firstName: blueprint.user.firstName,
      lastName: blueprint.user.lastName,
      role: 'VENDOR',
    })

    await db.vendor.upsert({
      where: { userId: user.id },
      update: blueprint.vendor,
      create: {
        ...blueprint.vendor,
        userId: user.id,
      },
    })
  }
  console.log(`  ✓ ${adminSideVendorBlueprints.length} productores extra para moderación`)

  const customersByEmail = new Map<string, { id: string; firstName: string; lastName: string }>()
  for (const customer of customerBlueprints) {
    const user = await upsertUser({
      email: customer.email,
      password: customer.password,
      firstName: customer.firstName,
      lastName: customer.lastName,
      role: 'CUSTOMER',
    })
    customersByEmail.set(user.email, {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    })
  }
  console.log(`  ✓ ${customerBlueprints.length} clientes demo disponibles`)

  const primaryCustomer = customersByEmail.get('cliente@test.com')
  const secondaryCustomer = customersByEmail.get('marta@demo.com')
  const thirdCustomer = customersByEmail.get('javier@demo.com')

  if (!primaryCustomer || !secondaryCustomer || !thirdCustomer) {
    throw new Error('No se pudieron crear los clientes demo')
  }

  const primaryAddress = await db.address.upsert({
    where: { id: 'addr-cliente-main' },
    update: {
      userId: primaryCustomer.id,
      label: 'Casa',
      firstName: primaryCustomer.firstName,
      lastName: primaryCustomer.lastName,
      line1: 'Calle Mayor 18',
      city: 'Madrid',
      province: '28',
      postalCode: '28013',
      country: 'ES',
      phone: '600123123',
      isDefault: true,
    },
    create: {
      id: 'addr-cliente-main',
      userId: primaryCustomer.id,
      label: 'Casa',
      firstName: primaryCustomer.firstName,
      lastName: primaryCustomer.lastName,
      line1: 'Calle Mayor 18',
      city: 'Madrid',
      province: '28',
      postalCode: '28013',
      country: 'ES',
      phone: '600123123',
      isDefault: true,
    },
  })

  await db.shippingZone.upsert({
    where: { id: 'zone-peninsula' },
    update: {
      name: 'Península Ibérica',
      provinces: [
        '01', '02', '03', '04', '05', '06', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17',
        '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33',
        '34', '36', '37', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
      ],
      isActive: true,
    },
    create: {
      id: 'zone-peninsula',
      name: 'Península Ibérica',
      provinces: [
        '01', '02', '03', '04', '05', '06', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17',
        '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33',
        '34', '36', '37', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
      ],
      isActive: true,
    },
  })

  await db.shippingRate.upsert({
    where: { id: 'rate-peninsula-std' },
    update: {
      zoneId: 'zone-peninsula',
      name: 'Estándar (3-5 días)',
      price: 4.95,
      freeAbove: 35,
      isActive: true,
    },
    create: {
      id: 'rate-peninsula-std',
      zoneId: 'zone-peninsula',
      name: 'Estándar (3-5 días)',
      price: 4.95,
      freeAbove: 35,
      isActive: true,
    },
  })

  await db.shippingZone.upsert({
    where: { id: 'zone-baleares' },
    update: {
      name: 'Baleares',
      provinces: ['07'],
      isActive: true,
    },
    create: {
      id: 'zone-baleares',
      name: 'Baleares',
      provinces: ['07'],
      isActive: true,
    },
  })

  await db.shippingRate.upsert({
    where: { id: 'rate-peninsula-premium' },
    update: {
      zoneId: 'zone-peninsula',
      name: 'Premium 24-48 h',
      minOrderAmount: 25,
      price: 7.9,
      freeAbove: 69,
      isActive: true,
    },
    create: {
      id: 'rate-peninsula-premium',
      zoneId: 'zone-peninsula',
      name: 'Premium 24-48 h',
      minOrderAmount: 25,
      price: 7.9,
      freeAbove: 69,
      isActive: true,
    },
  })

  await db.shippingRate.upsert({
    where: { id: 'rate-baleares-std' },
    update: {
      zoneId: 'zone-baleares',
      name: 'Estándar insular',
      price: 8.5,
      freeAbove: 95,
      isActive: true,
    },
    create: {
      id: 'rate-baleares-std',
      zoneId: 'zone-baleares',
      name: 'Estándar insular',
      price: 8.5,
      freeAbove: 95,
      isActive: true,
    },
  })

  const orders = [
    {
      id: 'order-demo-001',
      orderNumber: 'DEMO-1001',
      customerId: primaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'DELIVERED' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 24.3,
      shippingCost: 4.95,
      taxAmount: 2.12,
      grandTotal: 31.37,
      placedAt: new Date('2026-03-18T10:30:00Z'),
      lines: [
        {
          id: 'line-demo-001',
          productId: 'prod-tomates',
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          quantity: 2,
          unitPrice: 3.5,
          taxRate: 0.04,
          productSnapshot: { name: 'Tomates cherry ecológicos', unit: 'kg', vendor: 'Finca García' },
        },
        {
          id: 'line-demo-002',
          productId: 'prod-aceite',
          vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
          quantity: 1,
          unitPrice: 12,
          taxRate: 0.1,
          productSnapshot: { name: 'Aceite de oliva virgen extra', unit: 'botella 750ml', vendor: 'Bodega Ribera Viva' },
        },
        {
          id: 'line-demo-003',
          productId: 'prod-pan-pueblo',
          vendorId: vendorsBySlug.get('obrador-santa-ines')!.id,
          quantity: 1,
          unitPrice: 4.9,
          taxRate: 0.04,
          productSnapshot: { name: 'Pan de pueblo de masa madre', unit: 'pieza 800g', vendor: 'Obrador Santa Inés' },
        },
      ],
    },
    {
      id: 'order-demo-002',
      orderNumber: 'DEMO-1002',
      customerId: secondaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'DELIVERED' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 21.8,
      shippingCost: 0,
      taxAmount: 1.94,
      grandTotal: 23.74,
      placedAt: new Date('2026-03-26T16:45:00Z'),
      lines: [
        {
          id: 'line-demo-004',
          productId: 'prod-queso-cabra',
          vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
          quantity: 1,
          unitPrice: 9.5,
          taxRate: 0.1,
          productSnapshot: { name: 'Queso de cabra curado', unit: 'pieza 350g', vendor: 'Quesería Monteazul' },
        },
        {
          id: 'line-demo-005',
          productId: 'prod-miel-azahar',
          vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
          quantity: 1,
          unitPrice: 8.9,
          taxRate: 0.1,
          productSnapshot: { name: 'Miel cruda de azahar', unit: 'tarro 500g', vendor: 'Huerta La Solana' },
        },
        {
          id: 'line-demo-006',
          productId: 'prod-croissants',
          vendorId: vendorsBySlug.get('obrador-santa-ines')!.id,
          quantity: 1,
          unitPrice: 6.8,
          taxRate: 0.1,
          productSnapshot: { name: 'Croissants de mantequilla', unit: 'pack 4 uds', vendor: 'Obrador Santa Inés' },
        },
      ],
    },
    {
      id: 'order-demo-003',
      orderNumber: 'DEMO-1003',
      customerId: thirdCustomer.id,
      addressId: primaryAddress.id,
      status: 'DELIVERED' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 16,
      shippingCost: 4.95,
      taxAmount: 1.63,
      grandTotal: 22.58,
      placedAt: new Date('2026-04-02T09:15:00Z'),
      lines: [
        {
          id: 'line-demo-007',
          productId: 'prod-naranjas',
          vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
          quantity: 2,
          unitPrice: 3.2,
          taxRate: 0.04,
          productSnapshot: { name: 'Naranjas de mesa premium', unit: 'kg', vendor: 'Huerta La Solana' },
        },
        {
          id: 'line-demo-008',
          productId: 'prod-vino-tinto',
          vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
          quantity: 1,
          unitPrice: 8.7,
          taxRate: 0.21,
          productSnapshot: { name: 'Vino tinto joven tempranillo', unit: 'botella 750ml', vendor: 'Bodega Ribera Viva' },
        },
      ],
    },
    {
      id: 'order-demo-004',
      orderNumber: 'DEMO-1004',
      customerId: primaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'PAYMENT_CONFIRMED' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 18.3,
      shippingCost: 4.95,
      taxAmount: 1.3,
      grandTotal: 24.55,
      placedAt: new Date('2026-04-07T09:20:00Z'),
      lines: [
        {
          id: 'line-demo-009',
          productId: 'prod-pimientos-padron',
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          quantity: 2,
          unitPrice: 3.9,
          taxRate: 0.04,
          productSnapshot: { name: 'Pimientos de Padrón ecológicos', unit: 'bandeja 400g', vendor: 'Finca García' },
        },
        {
          id: 'line-demo-010',
          productId: 'prod-fresas',
          vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
          quantity: 1,
          unitPrice: 4.1,
          taxRate: 0.04,
          productSnapshot: { name: 'Fresas dulces en bandeja', unit: 'bandeja 500g', vendor: 'Huerta La Solana' },
        },
        {
          id: 'line-demo-011',
          productId: 'prod-pan-pueblo',
          vendorId: vendorsBySlug.get('obrador-santa-ines')!.id,
          quantity: 1,
          unitPrice: 4.9,
          taxRate: 0.04,
          productSnapshot: { name: 'Pan de pueblo de masa madre', unit: 'pieza 800g', vendor: 'Obrador Santa Inés' },
        },
      ],
      fulfillments: [
        { vendorId: vendorsBySlug.get('finca-garcia')!.id, status: 'PENDING' as const },
        { vendorId: vendorsBySlug.get('huerta-la-solana')!.id, status: 'CONFIRMED' as const },
        { vendorId: vendorsBySlug.get('obrador-santa-ines')!.id, status: 'PREPARING' as const },
      ],
    },
    {
      id: 'order-demo-005',
      orderNumber: 'DEMO-1005',
      customerId: secondaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'PROCESSING' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 17.3,
      shippingCost: 4.95,
      taxAmount: 1.31,
      grandTotal: 23.56,
      placedAt: new Date('2026-04-08T12:10:00Z'),
      lines: [
        {
          id: 'line-demo-012',
          productId: 'prod-miel-azahar',
          vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
          quantity: 1,
          unitPrice: 8.9,
          taxRate: 0.1,
          productSnapshot: { name: 'Miel cruda de azahar', unit: 'tarro 500g', vendor: 'Huerta La Solana' },
        },
        {
          id: 'line-demo-013',
          productId: 'prod-pimientos-padron',
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          quantity: 1,
          unitPrice: 3.9,
          taxRate: 0.04,
          productSnapshot: { name: 'Pimientos de Padrón ecológicos', unit: 'bandeja 400g', vendor: 'Finca García' },
        },
        {
          id: 'line-demo-014',
          productId: 'prod-vino-tinto',
          vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
          quantity: 1,
          unitPrice: 8.7,
          taxRate: 0.21,
          productSnapshot: { name: 'Vino tinto joven tempranillo', unit: 'botella 750ml', vendor: 'Bodega Ribera Viva' },
        },
      ],
      fulfillments: [
        { vendorId: vendorsBySlug.get('huerta-la-solana')!.id, status: 'PREPARING' as const },
        { vendorId: vendorsBySlug.get('finca-garcia')!.id, status: 'READY' as const },
        { vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id, status: 'CONFIRMED' as const },
      ],
    },
    {
      id: 'order-demo-006',
      orderNumber: 'DEMO-1006',
      customerId: thirdCustomer.id,
      addressId: primaryAddress.id,
      status: 'SHIPPED' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 14.3,
      shippingCost: 4.95,
      taxAmount: 1.19,
      grandTotal: 20.44,
      placedAt: new Date('2026-04-06T08:00:00Z'),
      lines: [
        {
          id: 'line-demo-015',
          productId: 'prod-tomates',
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          quantity: 1,
          unitPrice: 3.5,
          taxRate: 0.04,
          productSnapshot: { name: 'Tomates cherry ecológicos', unit: 'kg', vendor: 'Finca García' },
        },
        {
          id: 'line-demo-016',
          productId: 'prod-queso-cabra',
          vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
          quantity: 1,
          unitPrice: 9.5,
          taxRate: 0.1,
          productSnapshot: { name: 'Queso de cabra curado', unit: 'pieza 350g', vendor: 'Quesería Monteazul' },
        },
      ],
      fulfillments: [
        {
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          status: 'SHIPPED' as const,
          carrier: 'Demo Express',
          trackingNumber: 'TRK-006-FGAR',
          shippedAt: new Date('2026-04-07T07:30:00Z'),
        },
        {
          vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
          status: 'DELIVERED' as const,
          carrier: 'Frio Norte',
          trackingNumber: 'TRK-006-QMON',
          shippedAt: new Date('2026-04-06T14:00:00Z'),
          deliveredAt: new Date('2026-04-08T11:00:00Z'),
        },
      ],
    },
    {
      id: 'order-demo-007',
      orderNumber: 'DEMO-1007',
      customerId: primaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'CANCELLED' as const,
      paymentStatus: 'FAILED' as const,
      subtotal: 8.2,
      shippingCost: 0,
      taxAmount: 0.33,
      grandTotal: 8.53,
      placedAt: new Date('2026-04-01T18:10:00Z'),
      lines: [
        {
          id: 'line-demo-017',
          productId: 'prod-fresas',
          vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
          quantity: 2,
          unitPrice: 4.1,
          taxRate: 0.04,
          productSnapshot: { name: 'Fresas dulces en bandeja', unit: 'bandeja 500g', vendor: 'Huerta La Solana' },
        },
      ],
      fulfillments: [
        { vendorId: vendorsBySlug.get('huerta-la-solana')!.id, status: 'CANCELLED' as const },
      ],
    },
    {
      id: 'order-demo-008',
      orderNumber: 'DEMO-1008',
      customerId: secondaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'REFUNDED' as const,
      paymentStatus: 'REFUNDED' as const,
      subtotal: 9.5,
      shippingCost: 4.95,
      taxAmount: 0.95,
      grandTotal: 15.4,
      placedAt: new Date('2026-03-29T13:40:00Z'),
      lines: [
        {
          id: 'line-demo-018',
          productId: 'prod-queso-cabra',
          vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
          quantity: 1,
          unitPrice: 9.5,
          taxRate: 0.1,
          productSnapshot: { name: 'Queso de cabra curado', unit: 'pieza 350g', vendor: 'Quesería Monteazul' },
        },
      ],
      fulfillments: [
        { vendorId: vendorsBySlug.get('queseria-monteazul')!.id, status: 'DELIVERED' as const },
      ],
    },
    {
      id: 'order-demo-009',
      orderNumber: 'DEMO-1009',
      customerId: primaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'PLACED' as const,
      paymentStatus: 'PENDING' as const,
      subtotal: 27.6,
      shippingCost: 0,
      taxAmount: 1.91,
      grandTotal: 29.51,
      placedAt: new Date('2026-04-09T08:05:00Z'),
      lines: [
        {
          id: 'line-demo-019',
          productId: 'prod-huevos',
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          quantity: 2,
          unitPrice: 4.8,
          taxRate: 0.04,
          productSnapshot: { name: 'Huevos de gallinas camperas', unit: 'docena', vendor: 'Finca García' },
        },
        {
          id: 'line-demo-020',
          productId: 'prod-yogur-oveja',
          vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
          quantity: 2,
          unitPrice: 3.6,
          taxRate: 0.04,
          productSnapshot: { name: 'Yogur de oveja natural', unit: 'pack 2 x 125g', vendor: 'Quesería Monteazul' },
        },
        {
          id: 'line-demo-021',
          productId: 'prod-croissants',
          vendorId: vendorsBySlug.get('obrador-santa-ines')!.id,
          quantity: 1,
          unitPrice: 6.8,
          taxRate: 0.1,
          productSnapshot: { name: 'Croissants de mantequilla', unit: 'pack 4 uds', vendor: 'Obrador Santa Inés' },
        },
      ],
      fulfillments: [
        { vendorId: vendorsBySlug.get('finca-garcia')!.id, status: 'PENDING' as const },
        { vendorId: vendorsBySlug.get('queseria-monteazul')!.id, status: 'PENDING' as const },
        { vendorId: vendorsBySlug.get('obrador-santa-ines')!.id, status: 'PENDING' as const },
      ],
    },
    {
      id: 'order-demo-010',
      orderNumber: 'DEMO-1010',
      customerId: secondaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'PAYMENT_CONFIRMED' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 22.8,
      shippingCost: 4.95,
      taxAmount: 1.74,
      grandTotal: 29.49,
      placedAt: new Date('2026-04-09T09:10:00Z'),
      lines: [
        {
          id: 'line-demo-022',
          productId: 'prod-tomates',
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          quantity: 2,
          unitPrice: 3.5,
          taxRate: 0.04,
          productSnapshot: { name: 'Tomates cherry ecológicos', unit: 'kg', vendor: 'Finca García' },
        },
        {
          id: 'line-demo-023',
          productId: 'prod-miel-azahar',
          vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
          quantity: 1,
          unitPrice: 8.9,
          taxRate: 0.1,
          productSnapshot: { name: 'Miel cruda de azahar', unit: 'tarro 500g', vendor: 'Huerta La Solana' },
        },
        {
          id: 'line-demo-024',
          productId: 'prod-pan-pueblo',
          vendorId: vendorsBySlug.get('obrador-santa-ines')!.id,
          quantity: 1,
          unitPrice: 4.9,
          taxRate: 0.04,
          productSnapshot: { name: 'Pan de pueblo de masa madre', unit: 'pieza 800g', vendor: 'Obrador Santa Inés' },
        },
      ],
      fulfillments: [
        { vendorId: vendorsBySlug.get('finca-garcia')!.id, status: 'CONFIRMED' as const },
        { vendorId: vendorsBySlug.get('huerta-la-solana')!.id, status: 'PREPARING' as const },
        { vendorId: vendorsBySlug.get('obrador-santa-ines')!.id, status: 'READY' as const },
      ],
    },
    {
      id: 'order-demo-011',
      orderNumber: 'DEMO-1011',
      customerId: thirdCustomer.id,
      addressId: primaryAddress.id,
      status: 'PROCESSING' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 18.2,
      shippingCost: 4.95,
      taxAmount: 1.82,
      grandTotal: 24.97,
      placedAt: new Date('2026-04-09T10:25:00Z'),
      lines: [
        {
          id: 'line-demo-025',
          productId: 'prod-pimientos-padron',
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          quantity: 1,
          unitPrice: 3.9,
          taxRate: 0.04,
          productSnapshot: { name: 'Pimientos de Padrón ecológicos', unit: 'bandeja 400g', vendor: 'Finca García' },
        },
        {
          id: 'line-demo-026',
          productId: 'prod-aceite',
          vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
          quantity: 1,
          unitPrice: 12,
          taxRate: 0.1,
          productSnapshot: { name: 'Aceite de oliva virgen extra', unit: 'botella 750ml', vendor: 'Bodega Ribera Viva' },
        },
        {
          id: 'line-demo-027',
          productId: 'prod-lechuga-romana',
          vendorId: vendorsBySlug.get('finca-garcia')!.id,
          quantity: 1,
          unitPrice: 1.9,
          taxRate: 0.04,
          productSnapshot: { name: 'Lechuga romana fresca', unit: 'pieza', vendor: 'Finca García' },
        },
      ],
      fulfillments: [
        { vendorId: vendorsBySlug.get('finca-garcia')!.id, status: 'PREPARING' as const },
        { vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id, status: 'CONFIRMED' as const },
      ],
    },
    {
      id: 'order-demo-012',
      orderNumber: 'DEMO-1012',
      customerId: primaryCustomer.id,
      addressId: primaryAddress.id,
      status: 'PARTIALLY_SHIPPED' as const,
      paymentStatus: 'SUCCEEDED' as const,
      subtotal: 21.9,
      shippingCost: 4.95,
      taxAmount: 2.18,
      grandTotal: 29.03,
      placedAt: new Date('2026-04-08T17:40:00Z'),
      lines: [
        {
          id: 'line-demo-028',
          productId: 'prod-queso-cabra',
          vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
          quantity: 1,
          unitPrice: 9.5,
          taxRate: 0.1,
          productSnapshot: { name: 'Queso de cabra curado', unit: 'pieza 350g', vendor: 'Quesería Monteazul' },
        },
        {
          id: 'line-demo-029',
          productId: 'prod-vino-tinto',
          vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
          quantity: 1,
          unitPrice: 8.7,
          taxRate: 0.21,
          productSnapshot: { name: 'Vino tinto joven tempranillo', unit: 'botella 750ml', vendor: 'Bodega Ribera Viva' },
        },
        {
          id: 'line-demo-030',
          productId: 'prod-galletas-avena',
          vendorId: vendorsBySlug.get('obrador-santa-ines')!.id,
          quantity: 1,
          unitPrice: 5.1,
          taxRate: 0.1,
          productSnapshot: { name: 'Galletas de avena y miel', unit: 'bolsa 300g', vendor: 'Obrador Santa Inés' },
        },
      ],
      fulfillments: [
        {
          vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
          status: 'SHIPPED' as const,
          carrier: 'Frio Norte',
          trackingNumber: 'TRK-012-QMON',
          shippedAt: new Date('2026-04-09T07:10:00Z'),
        },
        { vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id, status: 'READY' as const },
        { vendorId: vendorsBySlug.get('obrador-santa-ines')!.id, status: 'PREPARING' as const },
      ],
    },
  ]

  for (const order of orders) {
    await db.order.upsert({
      where: { id: order.id },
      update: {
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        addressId: order.addressId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        taxAmount: order.taxAmount,
        grandTotal: order.grandTotal,
        placedAt: order.placedAt,
      },
      create: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        addressId: order.addressId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        taxAmount: order.taxAmount,
        grandTotal: order.grandTotal,
        placedAt: order.placedAt,
      },
    })

    await db.payment.upsert({
      where: { providerRef: `mock_pi_${order.id}` },
      update: {
        orderId: order.id,
        provider: 'mock',
        amount: order.grandTotal,
        currency: 'EUR',
        status: 'SUCCEEDED',
      },
      create: {
        orderId: order.id,
        provider: 'mock',
        providerRef: `mock_pi_${order.id}`,
        amount: order.grandTotal,
        currency: 'EUR',
        status: 'SUCCEEDED',
      },
    })

    const fulfillmentEntries = order.fulfillments ?? [...new Set(order.lines.map(line => line.vendorId))].map(vendorId => ({
      vendorId,
      status: 'DELIVERED' as const,
      carrier: 'Demo Express',
      trackingNumber: `TRK-${order.id.slice(-3)}-${vendorId.slice(-4)}`,
      shippedAt: new Date(order.placedAt.getTime() + 86400000),
      deliveredAt: new Date(order.placedAt.getTime() + 3 * 86400000),
    }))

    for (const fulfillment of fulfillmentEntries) {
      const carrier = 'carrier' in fulfillment ? fulfillment.carrier ?? null : null
      const trackingNumber = 'trackingNumber' in fulfillment ? fulfillment.trackingNumber ?? null : null
      const shippedAt = 'shippedAt' in fulfillment ? fulfillment.shippedAt ?? null : null
      const deliveredAt = 'deliveredAt' in fulfillment ? fulfillment.deliveredAt ?? null : null

      await db.vendorFulfillment.upsert({
        where: { id: `fulfillment-${order.id}-${fulfillment.vendorId}` },
        update: {
          orderId: order.id,
          vendorId: fulfillment.vendorId,
          status: fulfillment.status,
          carrier,
          trackingNumber,
          shippedAt,
          deliveredAt,
        },
        create: {
          id: `fulfillment-${order.id}-${fulfillment.vendorId}`,
          orderId: order.id,
          vendorId: fulfillment.vendorId,
          status: fulfillment.status,
          carrier,
          trackingNumber,
          shippedAt,
          deliveredAt,
        },
      })
    }

    for (const line of order.lines) {
      await db.orderLine.upsert({
        where: { id: line.id },
        update: {
          orderId: order.id,
          productId: line.productId,
          vendorId: line.vendorId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          productSnapshot: line.productSnapshot,
        },
        create: {
          ...line,
          orderId: order.id,
        },
      })
    }
  }
  console.log(`  ✓ ${orders.length} pedidos demo con estados variados`)

  await db.refund.upsert({
    where: { id: 'refund-demo-001' },
    update: {
      paymentId: (await db.payment.findUniqueOrThrow({ where: { providerRef: 'mock_pi_order-demo-008' }, select: { id: true } })).id,
      amount: 15.4,
      reason: 'Calidad del producto por debajo de lo esperado',
      fundedBy: 'MARKETPLACE',
      providerRef: 'mock_ref_order-demo-008',
    },
    create: {
      id: 'refund-demo-001',
      paymentId: (await db.payment.findUniqueOrThrow({ where: { providerRef: 'mock_pi_order-demo-008' }, select: { id: true } })).id,
      amount: 15.4,
      reason: 'Calidad del producto por debajo de lo esperado',
      fundedBy: 'MARKETPLACE',
      providerRef: 'mock_ref_order-demo-008',
    },
  })

  const incidents = [
    {
      id: 'incident-demo-001',
      orderId: 'order-demo-008',
      customerId: secondaryCustomer.id,
      type: 'QUALITY_ISSUE' as const,
      status: 'AWAITING_ADMIN' as const,
      description: 'El queso llegó con sabor demasiado fuerte y textura reseca. Se aportaron fotos del embalaje y del interior del producto.',
      resolution: 'REFUND_FULL' as const,
      fundedBy: 'MARKETPLACE',
      refundAmount: 15.4,
      internalNote: 'Se propone refund total para proteger la experiencia del cliente.',
      slaDeadline: new Date('2026-04-10T13:00:00Z'),
      resolvedAt: null,
      createdAt: new Date('2026-04-03T13:00:00Z'),
      updatedAt: new Date('2026-04-08T09:00:00Z'),
    },
    {
      id: 'incident-demo-002',
      orderId: 'order-demo-001',
      customerId: primaryCustomer.id,
      type: 'ITEM_DAMAGED' as const,
      status: 'RESOLVED' as const,
      description: 'Una de las botellas de aceite llegó con la caja húmeda y el precinto deteriorado.',
      resolution: 'REFUND_PARTIAL' as const,
      fundedBy: 'VENDOR',
      refundAmount: 4.5,
      internalNote: 'Incidencia resuelta con abono parcial y refuerzo de packaging.',
      slaDeadline: new Date('2026-03-21T10:30:00Z'),
      resolvedAt: new Date('2026-03-20T18:00:00Z'),
      createdAt: new Date('2026-03-19T08:30:00Z'),
      updatedAt: new Date('2026-03-20T18:00:00Z'),
    },
    {
      id: 'incident-demo-003',
      orderId: 'order-demo-004',
      customerId: primaryCustomer.id,
      type: 'MISSING_ITEMS' as const,
      status: 'OPEN' as const,
      description: 'Falta una de las bandejas de pimientos incluidas en el pedido confirmado.',
      resolution: null,
      fundedBy: null,
      refundAmount: null,
      internalNote: 'Pendiente de validación con productor y revisión de picking.',
      slaDeadline: new Date('2026-04-10T09:20:00Z'),
      resolvedAt: null,
      createdAt: new Date('2026-04-08T09:20:00Z'),
      updatedAt: new Date('2026-04-08T09:20:00Z'),
    },
  ]

  for (const incident of incidents) {
    await db.incident.upsert({
      where: { id: incident.id },
      update: incident,
      create: incident,
    })
  }

  const incidentMessages = [
    {
      id: 'incident-msg-001',
      incidentId: 'incident-demo-001',
      authorId: secondaryCustomer.id,
      authorRole: 'CUSTOMER',
      body: 'Adjunto fotos y número de lote. El sabor era demasiado fuerte y no apto para consumo.',
      attachments: ['photo://queso-lote', 'photo://embalaje'],
    },
    {
      id: 'incident-msg-002',
      incidentId: 'incident-demo-001',
      authorId: admin.id,
      authorRole: 'SUPERADMIN',
      body: 'Incidencia revisada. Se solicita confirmación final para tramitar reembolso completo.',
      attachments: [],
    },
    {
      id: 'incident-msg-003',
      incidentId: 'incident-demo-002',
      authorId: primaryCustomer.id,
      authorRole: 'CUSTOMER',
      body: 'La botella llegó manchada de aceite aunque el producto interior estaba utilizable.',
      attachments: ['photo://aceite-caja'],
    },
    {
      id: 'incident-msg-004',
      incidentId: 'incident-demo-002',
      authorId: admin.id,
      authorRole: 'SUPERADMIN',
      body: 'Se acuerda abono parcial y refuerzo en embalaje para próximos envíos.',
      attachments: [],
    },
  ]

  for (const message of incidentMessages) {
    await db.incidentMessage.upsert({
      where: { id: message.id },
      update: message,
      create: message,
    })
  }

  const settlements = [
    {
      id: 'settlement-demo-001',
      vendorId: vendorsBySlug.get('finca-garcia')!.id,
      periodFrom: new Date('2026-03-01T00:00:00Z'),
      periodTo: new Date('2026-03-31T23:59:59Z'),
      grossSales: 126.8,
      commissions: 12.68,
      refunds: 0,
      adjustments: 0,
      netPayable: 114.12,
      status: 'PAID' as const,
      paidAt: new Date('2026-04-05T12:00:00Z'),
    },
    {
      id: 'settlement-demo-002',
      vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
      periodFrom: new Date('2026-03-16T00:00:00Z'),
      periodTo: new Date('2026-03-31T23:59:59Z'),
      grossSales: 84.6,
      commissions: 9.31,
      refunds: 0,
      adjustments: 0,
      netPayable: 75.29,
      status: 'APPROVED' as const,
      paidAt: null,
    },
    {
      id: 'settlement-demo-003',
      vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
      periodFrom: new Date('2026-03-16T00:00:00Z'),
      periodTo: new Date('2026-03-31T23:59:59Z'),
      grossSales: 49.5,
      commissions: 5.94,
      refunds: 15.4,
      adjustments: -2,
      netPayable: 26.16,
      status: 'PENDING_APPROVAL' as const,
      paidAt: null,
    },
    {
      id: 'settlement-demo-004',
      vendorId: vendorsBySlug.get('obrador-santa-ines')!.id,
      periodFrom: new Date('2026-04-01T00:00:00Z'),
      periodTo: new Date('2026-04-15T23:59:59Z'),
      grossSales: 32.1,
      commissions: 2.89,
      refunds: 0,
      adjustments: 0,
      netPayable: 29.21,
      status: 'DRAFT' as const,
      paidAt: null,
    },
  ]

  for (const settlement of settlements) {
    await db.settlement.upsert({
      where: { id: settlement.id },
      update: settlement,
      create: settlement,
    })
  }

  for (const rule of extraCommissionRules) {
    await db.commissionRule.upsert({
      where: { id: rule.id },
      update: {
        vendorId: rule.vendorSlug ? vendorsBySlug.get(rule.vendorSlug)?.id ?? null : null,
        categoryId: rule.categoryId ?? null,
        type: rule.type,
        rate: rule.rate,
        isActive: rule.isActive,
      },
      create: {
        id: rule.id,
        vendorId: rule.vendorSlug ? vendorsBySlug.get(rule.vendorSlug)?.id ?? null : null,
        categoryId: rule.categoryId ?? null,
        type: rule.type,
        rate: rule.rate,
        isActive: rule.isActive,
      },
    })
  }

  const reviews = [
    {
      id: 'review-demo-001',
      orderId: 'order-demo-001',
      productId: 'prod-tomates',
      vendorId: vendorsBySlug.get('finca-garcia')!.id,
      customerId: primaryCustomer.id,
      rating: 5,
      body: 'Muy dulces y con piel fina. Llegaron perfectos y duraron varios días en la nevera.',
    },
    {
      id: 'review-demo-002',
      orderId: 'order-demo-001',
      productId: 'prod-aceite',
      vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
      customerId: primaryCustomer.id,
      rating: 4,
      body: 'Buen aroma y sabor equilibrado. Botella cuidada y envío rápido.',
    },
    {
      id: 'review-demo-003',
      orderId: 'order-demo-002',
      productId: 'prod-queso-cabra',
      vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
      customerId: secondaryCustomer.id,
      rating: 5,
      body: 'Sabor intenso pero elegante. Repetiré para tabla de quesos.',
    },
    {
      id: 'review-demo-004',
      orderId: 'order-demo-002',
      productId: 'prod-miel-azahar',
      vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
      customerId: secondaryCustomer.id,
      rating: 4,
      body: 'Textura muy agradable y notas florales claras. Ideal para yogur y tostadas.',
    },
    {
      id: 'review-demo-005',
      orderId: 'order-demo-003',
      productId: 'prod-naranjas',
      vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
      customerId: thirdCustomer.id,
      rating: 5,
      body: 'Perfectas para mesa y zumo. Muy jugosas.',
    },
    {
      id: 'review-demo-006',
      orderId: 'order-demo-003',
      productId: 'prod-vino-tinto',
      vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
      customerId: thirdCustomer.id,
      rating: 4,
      body: 'Fácil de beber y con buena fruta. Muy bien para comidas informales.',
    },
  ]

  for (const review of reviews) {
    await db.review.upsert({
      where: { orderId_productId: { orderId: review.orderId, productId: review.productId } },
      update: {
        vendorId: review.vendorId,
        customerId: review.customerId,
        rating: review.rating,
        body: review.body,
      },
      create: review,
    })
  }

  for (const vendor of vendorsBySlug.values()) {
    const aggregate = await db.review.aggregate({
      where: { vendorId: vendor.id },
      _avg: { rating: true },
      _count: { _all: true },
    })

    await db.vendor.update({
      where: { id: vendor.id },
      data: {
        avgRating: aggregate._avg.rating ?? null,
        totalReviews: aggregate._count._all,
      },
    })
  }

  const auditLogs = [
    {
      id: 'audit-demo-001',
      action: 'PRODUCT_APPROVED',
      entityType: 'Product',
      entityId: 'prod-patatas-rojas',
      before: { status: 'DRAFT' },
      after: { status: 'PENDING_REVIEW' },
      actorId: admin.id,
      actorRole: 'SUPERADMIN',
      ip: '127.0.0.1',
      createdAt: new Date('2026-04-07T08:40:00Z'),
    },
    {
      id: 'audit-demo-002',
      action: 'PRODUCT_REJECTED',
      entityType: 'Product',
      entityId: 'prod-cebolla-dulce',
      before: { status: 'PENDING_REVIEW' },
      after: { status: 'REJECTED', rejectionNote: 'Falta trazabilidad' },
      actorId: admin.id,
      actorRole: 'SUPERADMIN',
      ip: '127.0.0.1',
      createdAt: new Date('2026-04-07T09:15:00Z'),
    },
    {
      id: 'audit-demo-003',
      action: 'VENDOR_STATUS_UPDATED',
      entityType: 'Vendor',
      entityId: vendorsBySlug.get('finca-garcia')!.id,
      before: { stripeOnboarded: false },
      after: { stripeOnboarded: false, iban: true },
      actorId: admin.id,
      actorRole: 'SUPERADMIN',
      ip: '127.0.0.1',
      createdAt: new Date('2026-04-06T10:10:00Z'),
    },
    {
      id: 'audit-demo-004',
      action: 'INCIDENT_ESCALATED',
      entityType: 'Incident',
      entityId: 'incident-demo-001',
      before: { status: 'OPEN' },
      after: { status: 'AWAITING_ADMIN' },
      actorId: admin.id,
      actorRole: 'SUPERADMIN',
      ip: '127.0.0.1',
      createdAt: new Date('2026-04-08T09:05:00Z'),
    },
    {
      id: 'audit-demo-005',
      action: 'SETTLEMENT_APPROVED',
      entityType: 'Settlement',
      entityId: 'settlement-demo-002',
      before: { status: 'PENDING_APPROVAL' },
      after: { status: 'APPROVED' },
      actorId: admin.id,
      actorRole: 'SUPERADMIN',
      ip: '127.0.0.1',
      createdAt: new Date('2026-04-09T07:20:00Z'),
    },
  ]

  for (const log of auditLogs) {
    await db.auditLog.upsert({
      where: { id: log.id },
      update: log,
      create: log,
    })
  }

  const totalProducts = vendorBlueprints.reduce((sum, vendor) => sum + vendor.products.length, 0)

  console.log(`  ✓ ${vendorBlueprints.length + adminSideVendorBlueprints.length} productores demo totales`)
  console.log(`  ✓ ${totalProducts} productos sembrados para catálogo y backoffice`)
  console.log(`  ✓ ${reviews.length} reseñas demo creadas`)
  console.log(`  ✓ ${incidents.length} incidencias y ${settlements.length} liquidaciones demo`)
  console.log(`  ✓ ${auditLogs.length} eventos de auditoría`)
  console.log('✅ Seed completado')
  console.log('')
  console.log('Credenciales de acceso:')
  console.log('  Admin:      admin@marketplace.com / admin1234')
  console.log('  Productor:  productor@test.com    / vendor1234')
  console.log('  Cliente:    cliente@test.com      / cliente1234')
  console.log('  Extras:     huerta@demo.com, queseria@demo.com, bodega@demo.com, obrador@demo.com / vendor1234')
}

main()
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
