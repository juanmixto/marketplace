import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/client'
import { getDemoProductImages } from '../src/lib/demo-product-images'
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
      description: 'Somos Carlos y Pilar, tercera generación en la Sierra de Gredos. Cultivamos hortalizas y huevos camperos en 12 hectáreas de tierra heredada, siguiendo las prácticas que nos enseñó el abuelo Tomás: rotación de cultivos, compost propio y cero químicos desde 1987.\n\nNuestra finca funciona con temporada corta y recogida diaria. No almacenamos: lo que se recolecta por la mañana sale hacia tu casa esa misma tarde. Trabajamos con variedades locales —tomates de Barco, pimientos de asar, judiones del valle— porque creemos que el sabor no se negocia.\n\nDurante los meses de invierno hacemos conservas, mermeladas y encurtidos con el excedente de temporada, siempre en lotes pequeños y con recetas de casa. Si tienes alguna duda sobre nuestros productos o quieres saber qué hay disponible esta semana, escríbenos sin compromiso.',
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
        description: 'Cherry de piel fina, pulpa firme y un dulzor que solo se consigue dejándolos madurar en la mata. Los cultivamos en invernadero solar sin calefacción, con riego por goteo controlado y abono orgánico de nuestra propia compostera.\n\nRecogemos cada mañana para que lleguen a tu mesa con la frescura intacta. Son perfectos para ensaladas, pasta, pizzas caseras o simplemente para picar tal cual. En temporada alta (mayo-octubre) el sabor es todavía más intenso.',
        images: [
          'https://images.unsplash.com/photo-1518977822534-7049a61ee0c2?w=1200&q=80', // cherry tomatoes on vine
          'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80', // bowl of cherry tomatoes
          'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=1200&q=80', // tomatoes closeup
          'https://images.unsplash.com/photo-1558160074-4d7d8bdf4256?w=1200&q=80', // fresh tomatoes
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
        description: 'Pieza fina con piel suave y textura delicada, ideal para cortar en rodajas a la plancha, en espirales para pasta vegetal o para cremas de verduras con buen cuerpo. Lo recolectamos joven para que la semilla sea pequeña y el sabor más concentrado.\n\nPlantamos en turnos escalonados para tener producción continua de abril a noviembre. El calibre es homogéneo porque seleccionamos a mano, y sale de nuestra finca el mismo día de la recolección.',
        images: [
          'https://images.unsplash.com/photo-1572453800999-e8d2d1589b7c?w=1200&q=80', // zucchini whole
          'https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=1200&q=80', // zucchini sliced
          'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=1200&q=80', // green vegetables
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
        description: 'Nuestras gallinas pastan libres por la finca, picotean hierba, insectos y grano ecológico complementario. El resultado son huevos con yema naranja intensa, cáscara resistente y un sabor que marca la diferencia en tortillas, huevos fritos y repostería casera.\n\nSon categoría A, clase L (entre 63 y 73 gramos). Los recogemos a diario y los marcamos con fecha de puesta. No los lavamos industrialmente para conservar la cutícula protectora natural. Llegan a tu casa en un plazo máximo de 48 horas desde la puesta.',
        images: [
          'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=1200&q=80', // eggs in carton
          'https://images.unsplash.com/photo-1573246123716-6b1782bfc499?w=1200&q=80', // eggs in nest
          'https://images.unsplash.com/photo-1510693206972-df098062cb71?w=1200&q=80', // farm eggs
          'https://images.unsplash.com/photo-1491524062933-cb0289261700?w=1200&q=80', // fresh eggs close
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
        description: 'Elaborada con fresas maduras de nuestra huerta y azúcar de caña en proporción justa. La cocción es lenta, en cazos de cobre, para que la fruta conserve su textura y su aroma natural sin quedarse aguada.\n\nCada tarro es un lote pequeño —60 tarros por cocción como máximo—, y la consistencia cambia ligeramente según la temporada y el punto de madurez de la fruta. Es perfecta para desayunos con pan casero, relleno de bizcochos o acompañamiento de quesos suaves.',
        images: [
          'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=1200&q=80', // strawberries
          'https://images.unsplash.com/photo-1553530979-7ee52a2670c4?w=1200&q=80', // strawberry jam jar
          'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=1200&q=80', // jam on toast
          'https://images.unsplash.com/photo-1514996937319-344454492b37?w=1200&q=80', // preserve jar
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
        description: 'Verdes, pequeños y con esa textura fina que hace que se frían rápido y queden crujientes por fuera y tiernos por dentro. Los nuestros son eco certificados, cultivados con sustrato natural y sin tratamientos químicos.\n\nVienen en bandejas de 400 gramos, calibre ideal para tapa. El clásico: vuelta y vuelta en sartén con aceite bien caliente y un buen golpe de sal gorda. Son los más demandados de viernes a domingo, así que conviene pedirlos antes del jueves.',
        images: [
          'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=1200&q=80', // padrón peppers plate
          'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=1200&q=80', // green peppers
          'https://images.unsplash.com/photo-1564325724739-bae0bd08762c?w=1200&q=80', // peppers in pan
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
        description: 'Cada semana preparamos una selección variada con lo mejor que da la finca: tomates, calabacín, hojas tiernas, alguna hierba aromática y un producto sorpresa de temporada que rotamos para que siempre haya novedad.\n\nLa cesta pesa aproximadamente 4 kg y está pensada para una familia de 3-4 personas o para quien quiera cocinar variado durante la semana. Todo ecológico, recolectado el día de preparación y embalado con cuidado para evitar golpes en el transporte.',
        images: [
          'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=1200&q=80', // vegetable basket
          'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80', // farmers market
          'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=1200&q=80', // fresh vegetables
          'https://images.unsplash.com/photo-1590165482129-1b8b27698780?w=1200&q=80', // mixed produce
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
        description: 'Patata firme de piel roja y carne amarilla, ideal para asados al horno, guisos de invierno y purés con cuerpo. La lavamos en origen para que llegue lista para pelar o para cocinar directamente con piel.\n\nCalibre medio-grande, seleccionada a mano y embolsada en malla transpirable. Es nuestra patata de despensa básica: aguanta bien 2-3 semanas en lugar fresco y oscuro sin brotar ni perder textura.',
        images: [
          'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=1200&q=80', // red potatoes
          'https://images.unsplash.com/photo-1508747703725-719777637510?w=1200&q=80', // potatoes pile
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
        description: 'Cebolla de variedad dulce, perfecta para largas cocciones lentas: confitada en el horno a baja temperatura, en sofritos de base o caramelizada como acompañamiento. Su contenido en azúcares naturales es alto, y al cocinarla libera un dulzor intenso sin necesidad de añadir nada.\n\nProducto pausado temporalmente por etiquetado incompleto — estamos actualizando la información de trazabilidad del lote.',
        images: [
          'https://images.unsplash.com/photo-1508747703725-719777637510?w=1200&q=80', // onions
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
        description: 'Lechuga de hoja crujiente y nervio firme, cultivada en bancal protegido y recogida antes del amanecer para conservar la hidratación. El sabor es suave, ligeramente dulce y muy refrescante.\n\nLa presentamos entera con raíz para prolongar su frescura en nevera. Si la sumerges en agua fría 10 minutos antes de servir, recupera todo su crujiente. Ideal como base de ensaladas, para wraps o para acompañar a la brasa.',
        images: [
          'https://images.unsplash.com/photo-1524179091875-bf99a9a6af57?w=1200&q=80', // romaine lettuce
          'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?w=1200&q=80', // lettuce
          'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?w=1200&q=80', // salad leaves
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
      description: 'Nos dedicamos al cítrico y la fruta de hueso desde hace más de cuarenta años. Lo que empezó como un pequeño huerto familiar entre naranjos se ha convertido en una finca de 8 hectáreas donde cultivamos naranjas, mandarinas, fresas y fruta de temporada.\n\nCada pieza se recolecta bajo pedido: no usamos cámaras frigoríficas ni tratamientos de postcosecha. Del árbol a tu mesa en 24-48 horas. También producimos miel cruda de azahar, porque nuestras colmenas conviven con los naranjos y el resultado merece la pena.\n\nEstamos en plena huerta valenciana, a pocos kilómetros de la Albufera. Si pasas por la zona, avísanos y te enseñamos la finca encantados.',
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
        description: 'Naranjas Navel Lane Late, la variedad más equilibrada para mesa. Piel fina, gajos firmes y un dulzor limpio que no empalaga. Las recolectamos a mano y no pasan por cámara: del árbol a la caja directamente.\n\nSon perfectas para comer en gajos, en ensaladas o para hacer zumo natural por las mañanas. El calibre es homogéneo (70-80 mm) y por tratarse de producto sin tratamiento postcosecha, pueden presentar alguna marca superficial que no afecta en nada al sabor ni a la calidad interior.',
        images: [
          'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=1200&q=80', // oranges pile
          'https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=1200&q=80', // oranges halved
          'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?w=1200&q=80', // citrus fruits
          'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=1200&q=80', // citrus close
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
        description: 'Fresas de la variedad San Andreas, con maduración natural y sin forzar. Las recogemos a primera hora cuando el azúcar se ha acumulado durante la noche y el aroma es más intenso. Cada bandeja se prepara el mismo día de la recolección.\n\nEl lote es corto a propósito —producimos lo justo para que cada bandeja se venda fresca—. Son ideales para postre, combinadas con nata, con yogur natural o directamente a bocados. En temporada alta (marzo-junio), el sabor alcanza su punto máximo.',
        images: [
          'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=1200&q=80', // strawberries
          'https://images.unsplash.com/photo-1587393855524-087f83d95bc9?w=1200&q=80', // strawberries bowl
          'https://images.unsplash.com/photo-1495147466023-ac5c588e2e94?w=1200&q=80', // strawberries close
          'https://images.unsplash.com/photo-1518635017498-87f514b751ba?w=1200&q=80', // strawberries field
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
        description: 'Miel sin pasteurizar, sin filtrar en exceso y sin mezcla. Procede de nuestras 30 colmenas situadas entre naranjos y limoneros de la huerta valenciana. Las notas florales de azahar son inconfundibles: dulce, suave y con un fondo cítrico muy delicado.\n\nAl ser cruda, conserva todos los nutrientes, enzimas y polen natural. Puede cristalizar con el tiempo, lo cual es señal de que no ha sido procesada. Para devolverla a estado líquido, basta con un baño maría suave. Perfecta para endulzar infusiones, aliñar yogur o tomar a cucharadas.',
        images: [
          'https://images.unsplash.com/photo-1587049352851-8d4e89133924?w=1200&q=80', // honey jar
          'https://images.unsplash.com/photo-1471943311424-646960669fbc?w=1200&q=80', // honey dripping
          'https://images.unsplash.com/photo-1558642891-54be180ea339?w=1200&q=80', // honeycomb
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
      description: 'En Monteazul hacemos queso como se hacía antes: con leche cruda del día, cuajo natural y el tiempo que cada pieza necesita. Nuestro rebaño de 120 cabras pasta libre en los Picos de Europa, y la diferencia se nota en la leche.\n\nTenemos tres líneas de producto: queso fresco (de 3 a 7 días), semicurado (45 días en cava de piedra) y curado (mínimo 90 días, con corteza natural lavada). También elaboramos yogur de oveja con fermentos propios y mantequilla batida a diario.\n\nMateo, el maestro quesero, lleva 22 años perfeccionando las recetas. Cada lote es pequeño —entre 40 y 60 piezas— y cada uno tiene su propio carácter. No hay dos quesos iguales, y eso es exactamente lo que buscamos.',
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
        description: 'Elaborado con leche cruda de nuestras propias cabras que pastan libres en los Picos de Europa. La curación de 90 días en cava de piedra natural desarrolla una pasta compacta y un sabor persistente con matices a frutos secos y un ligero punto picante.\n\nCada pieza pesa alrededor de 350 gramos y se presenta con corteza natural lavada. Ideal para tabla de quesos, rallado sobre pasta fresca o simplemente con un hilo de miel y unas nueces. Maridaje perfecto con un vino tinto joven o una sidra natural asturiana.',
        images: [
          'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=1200&q=80', // goat cheese wheel
          'https://images.unsplash.com/photo-1589881133595-a3c085cb731d?w=1200&q=80', // cheese board
          'https://images.unsplash.com/photo-1557142046-c704a3adf364?w=1200&q=80', // artisan cheese
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
        description: 'Yogur elaborado con leche de oveja Latxa de ganaderías cercanas y fermentos propios que cultivamos en el obrador. La textura es cremosa y densa, con una acidez suave que lo diferencia del yogur industrial. Sin azúcares añadidos, sin espesantes, sin colorantes.\n\nViene en pack de dos tarrinas de 125 gramos cada una. Se puede tomar solo, con miel de azahar, con fruta fresca o como base para salsas y aliños. Es uno de nuestros productos más repetidos entre clientes habituales.',
        images: [
          'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=1200&q=80', // yogurt bowl
          'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=1200&q=80', // yogurt jar
          'https://images.unsplash.com/photo-1481391243133-f96216dcb5d2?w=1200&q=80', // creamy yogurt
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
        description: 'Batida lentamente con nata fresca de vaca y un punto justo de sal marina de Añana. El resultado es una mantequilla untuosa, con un color amarillo natural y un sabor intenso que transforma cualquier tostada en un desayuno especial.\n\nLa elaboramos en pequeños lotes diarios —no más de 30 piezas por tanda— y cada una pesa 250 gramos, envuelta en papel vegetal. También funciona de maravilla para cocinar: resiste bien la temperatura y aporta un fondo de sabor que la margarina no puede igualar.',
        images: [
          'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=1200&q=80', // artisan butter
          'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=1200&q=80', // butter on bread
          'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=1200&q=80', // butter close
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
      description: 'Somos una bodega familiar en la Ribera del Duero con 6 hectáreas de viñedo propio y una producción que rara vez supera las 15.000 botellas al año. Nos gusta decir que hacemos vinos honestos: sin adornos, sin trucos, con la expresión pura de la uva y el terreno.\n\nNuestras cepas de tempranillo tienen entre 25 y 40 años, y las trabajamos en ecológico desde 2018. Ana se encarga de la viña y la cosecha, y Pablo del trabajo en bodega. Criamos en barrica cuando la uva lo pide, pero nunca como obligación.\n\nAdemás del vino, elaboramos aceite de oliva virgen extra con aceitunas de la finca y conservas artesanas con producto de nuestra huerta. Todo bajo el mismo principio: buen producto, sin intermediarios, directo a tu mesa.',
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
        description: 'Aceite de primera prensada en frío elaborado con aceitunas de la variedad Cornicabra recolectadas en envero temprano. El resultado es un aceite equilibrado, con aromas a hierba recién cortada, un frutado medio y un final ligeramente picante.\n\nEmbotellamos en vidrio oscuro para proteger las propiedades del aceite de la luz. Cada cosecha es limitada (unas 3.000 botellas) y varía ligeramente en matices según el año. Va bien tanto para aliñar en crudo —ensaladas, tostadas, verduras— como para guisos y frituras suaves.',
        images: [
          'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1200&q=80', // olive oil bottle
          'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80', // olives and oil
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
        description: 'Tempranillo 100% de nuestras viñas de entre 25 y 40 años en la Ribera del Duero. Fermentación en depósito de acero inoxidable a temperatura controlada y un breve paso por barrica de roble francés de segundo uso para redondear sin tapar la fruta.\n\nEn nariz encontrarás cereza madura, grosella negra y un toque de violeta. En boca es amable, con taninos suaves y una acidez viva que lo hace muy fácil de maridar. Perfecto para carnes a la brasa, embutidos, legumbres y comidas informales entre amigos. Servir a 14-16 °C.',
        images: [
          'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&q=80', // wine bottle
          'https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=1200&q=80', // wine cellar bottles
          'https://images.unsplash.com/photo-1507434965515-61970f2bd7c6?w=1200&q=80', // wine glass red
          'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1200&q=80', // vineyard
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
        description: 'Pimientos rojos del piquillo asados directamente sobre fuego de leña, pelados a mano uno a uno y conservados en un aliño suave de aceite de oliva, ajo laminado y una pizca de sal. Nada más.\n\nCada tarro contiene entre 8 y 10 pimientos, suficientes para una buena tapa, un relleno de bacalao o para acompañar cualquier plato de cuchara. Al ser pelados a mano, la textura es mucho más delicada que los industriales.',
        images: [
          'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=1200&q=80', // roasted red peppers
          'https://images.unsplash.com/photo-1598518619776-eae3f8a34eac?w=1200&q=80', // jarred peppers
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
      description: 'Nuestro obrador nació en 2019 con una idea simple: recuperar el pan de verdad. Usamos harinas ecológicas molidas a piedra, masas madre que alimentamos a diario y fermentaciones de entre 24 y 48 horas. No tenemos prisa, y se nota en cada bocado.\n\nElena aprendió el oficio en panaderías de Francia y Alemania antes de abrir Santa Inés en el casco antiguo de Pamplona. Hoy somos un equipo de cuatro personas que hornea cada mañana a las cinco. Pan de pueblo, hogazas integrales, chapatas, croissants de mantequilla y bollería de temporada.\n\nTambién hacemos galletas, bizcochos y repostería seca que aguanta bien el envío. Todo sale del mismo obrador, con los mismos ingredientes y el mismo cuidado. Si quieres probar nuestro pan, te recomendamos hacer el pedido antes de las 11:00 para que salga en el horneado del día siguiente.',
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
        description: 'Hogaza de ochocientos gramos con corteza gruesa y miga húmeda llena de alveolos irregulares. Usamos masa madre natural que alimentamos a diario, harina T80 ecológica molida a piedra y una fermentación lenta de 36 horas mínimo.\n\nEl resultado es un pan con carácter: sabor ligeramente ácido, aroma intenso y una conservación que dura 4-5 días sin perder la gracia. Se hornea sobre piedra refractaria a 250 °C con vapor. Ideal para acompañar cualquier comida, para sopas de ajo o para hacer las mejores tostadas del desayuno.',
        images: [
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80', // sourdough loaf
          'https://images.unsplash.com/photo-1598373182133-52452f7691ef?w=1200&q=80', // bread crust closeup
          'https://images.unsplash.com/photo-1559548331-f9cb98001426?w=1200&q=80', // artisan bread sliced
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
        description: 'Laminado artesanal con mantequilla francesa de calidad y una fermentación en frío de 24 horas que desarrolla aroma y textura. El interior es alveolado y ligero, con un sabor a mantequilla limpio que no deja sensación grasa.\n\nLos horneamos cada mañana entre las 5 y las 7, y salen del obrador todavía calientes. El pack incluye cuatro piezas de buen tamaño. Son perfectos solos, con mermelada artesana o con un café con leche para empezar el día como manda.',
        images: [
          'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=1200&q=80', // croissants
          'https://images.unsplash.com/photo-1530610476181-d83430b64dcd?w=1200&q=80', // croissant layers
          'https://images.unsplash.com/photo-1555099962-4199c345e5dd?w=1200&q=80', // croissant closeup
          'https://images.unsplash.com/photo-1549903072-7e6e0bedb7fb?w=1200&q=80', // pastry basket
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
        description: 'Receta de casa con avena integral, miel de flores, mantequilla, huevo y una pizca de canela. Las hacemos a mano en tandas pequeñas, y el punto de cocción está estudiado para que queden crujientes por fuera y tiernas por dentro.\n\nCada bolsa lleva 300 gramos de galletas de tamaño generoso. Son perfectas para el café de media mañana, para la merienda con un vaso de leche o para picar algo dulce sin recurrir a ultraprocesados. También las usamos como base de tartas en el obrador.',
        images: [
          'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=1200&q=80', // oat cookies
          'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=1200&q=80', // homemade cookies
          'https://images.unsplash.com/photo-1506224772180-d75b3efbe9be?w=1200&q=80', // cookie jar
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
      const images = getDemoProductImages(product.slug, product.images)

      await db.product.upsert({
        where: { slug: product.slug },
        update: {
          ...product,
          vendorId: vendor.id,
          images,
        },
        create: {
          ...product,
          vendorId: vendor.id,
          images,
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
      body: 'Muy dulces y con piel fina, se nota que están recogidos en el día. Los usé para una ensalada caprese y el sabor era increíble. Llegaron bien embalados y duraron varios días en la nevera sin perder firmeza.',
    },
    {
      id: 'review-demo-002',
      orderId: 'order-demo-001',
      productId: 'prod-aceite',
      vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
      customerId: primaryCustomer.id,
      rating: 4,
      body: 'Buen aroma nada más abrir la botella. Sabor equilibrado con un toque picante al final que le da carácter. Lo usé para aliñar una ensalada y para mojar pan, y en ambos casos estaba estupendo. El envío llegó rápido y la botella venía bien protegida.',
    },
    {
      id: 'review-demo-003',
      orderId: 'order-demo-002',
      productId: 'prod-queso-cabra',
      vendorId: vendorsBySlug.get('queseria-monteazul')!.id,
      customerId: secondaryCustomer.id,
      rating: 5,
      body: 'Un queso con carácter de verdad. Sabor intenso pero elegante, con un punto de frutos secos que lo hace perfecto para tabla. Lo probé con un hilo de miel y unas nueces y la combinación era espectacular. Repetiré seguro para la próxima cena con amigos.',
    },
    {
      id: 'review-demo-004',
      orderId: 'order-demo-002',
      productId: 'prod-miel-azahar',
      vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
      customerId: secondaryCustomer.id,
      rating: 4,
      body: 'Textura sedosa y notas florales de azahar muy claras, nada que ver con la miel industrial. La probé con yogur natural y unas fresas y fue una combinación 10. También va genial con tostadas y queso fresco. El tarro es generoso y creo que me va a durar bastante.',
    },
    {
      id: 'review-demo-005',
      orderId: 'order-demo-003',
      productId: 'prod-naranjas',
      vendorId: vendorsBySlug.get('huerta-la-solana')!.id,
      customerId: thirdCustomer.id,
      rating: 5,
      body: 'Perfectas para mesa y para zumo. Muy jugosas, con una dulzor equilibrado y sin semillas apenas. Pedí 2 kg y no duró ni la semana. El calibre es homogéneo y la piel finísima. Se nota que van del árbol a la caja sin pasar por cámara. Repetiré antes de que acabe la temporada.',
    },
    {
      id: 'review-demo-006',
      orderId: 'order-demo-003',
      productId: 'prod-vino-tinto',
      vendorId: vendorsBySlug.get('bodega-ribera-viva')!.id,
      customerId: thirdCustomer.id,
      rating: 4,
      body: 'Fácil de beber, con buena fruta y un paso muy amable. Lo abrimos para una comida informal con amigos y desapareció en un momento. Tiene personalidad pero no es demasiado complejo, que es justo lo que buscaba. Servido a unos 15 grados está perfecto. Buena relación calidad-precio.',
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
