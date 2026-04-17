import type { Category } from '@/generated/prisma/client'
import { TAX_RATES } from '@/lib/constants'

type CategoryRule = {
  slug: string
  taxRate: number
  defaultUnit?: string
  keywords: string[]
}

// Order matters: the first rule whose keyword is found wins.
// "pan" is listed before general "bollería" so plain bread maps to IVA
// reducido (4%) while cakes fall through to the 10% rule.
const CATEGORY_RULES: CategoryRule[] = [
  {
    slug: 'panaderia',
    taxRate: TAX_RATES.REDUCED,
    defaultUnit: 'unidad',
    keywords: [
      'pan', 'hogaza', 'barra', 'baguette', 'chapata', 'coca', 'mollete',
      'bollo', 'focaccia', 'pita', 'picos', 'regaña', 'biscote', 'colin',
      'candeal', 'payes', 'gallego', 'integral', 'centeno', 'espelta',
      'masa madre', 'rustico', 'rústico',
    ],
  },
  {
    slug: 'verduras',
    taxRate: TAX_RATES.REDUCED,
    defaultUnit: 'kg',
    keywords: [
      // Generic
      'verdura', 'hortaliza', 'brote', 'germinado',
      // Solanáceas / cucurbitáceas
      'tomate', 'pimiento', 'berenjena', 'calabacin', 'calabaza', 'pepino',
      'chayote', 'patata', 'boniato', 'batata', 'yuca',
      // Hojas
      'lechuga', 'escarola', 'endibia', 'endivia', 'canonigo', 'rucula',
      'espinaca', 'acelga', 'kale', 'col', 'repollo', 'lombarda', 'pak choi',
      'mizuna', 'achicoria', 'borraja', 'grelos', 'cardo',
      // Bulbos / raíces
      'cebolla', 'cebolleta', 'chalota', 'puerro', 'ajo', 'ajete', 'zanahoria',
      'remolacha', 'rabano', 'rabanito', 'nabo', 'chirivia', 'jengibre',
      'kohlrabi',
      // Crucíferas y otras
      'brocoli', 'brécol', 'coliflor', 'romanesco', 'alcachofa', 'apio',
      'hinojo', 'esparrago', 'judia verde', 'haba', 'guisante', 'tirabeque',
      // Setas
      'seta', 'champinon', 'champiñon', 'boletus', 'niscalo', 'rebozuelo',
      'shiitake', 'portobello',
      // Hierbas aromáticas
      'perejil', 'cilantro', 'hierbabuena', 'menta', 'albahaca', 'romero',
      'tomillo', 'oregano', 'laurel', 'eneldo', 'cebollino', 'estragon',
      'salvia',
    ],
  },
  {
    slug: 'frutas',
    taxRate: TAX_RATES.REDUCED,
    defaultUnit: 'kg',
    keywords: [
      // Generic
      'fruta',
      // Pepita
      'manzana', 'pera', 'membrillo',
      // Cítricos
      'naranja', 'mandarina', 'clementina', 'limon', 'lima', 'pomelo',
      'kumquat',
      // Hueso
      'melocoton', 'nectarina', 'paraguayo', 'platerina', 'ciruela',
      'albaricoque', 'cereza', 'picota', 'guinda',
      // Bayas
      'fresa', 'fresón', 'frambuesa', 'mora', 'arandano', 'grosella',
      'casis', 'cassis',
      // Tropicales
      'platano', 'banana', 'piña', 'mango', 'aguacate', 'papaya', 'maracuya',
      'lichi', 'coco', 'guayaba', 'guanabana', 'tamarindo', 'kiwi', 'kaki',
      'caqui', 'chirimoya',
      // Otras
      'uva', 'sandia', 'melon', 'higo', 'breva', 'granada', 'dátil', 'datil',
      // Frutos secos
      'almendra', 'nuez', 'avellana', 'pistacho', 'anacardo', 'pipa',
      'castaña', 'castana', 'piñon', 'pinon', 'fruto seco',
      // Deshidratados
      'pasa', 'orejon', 'higo seco', 'ciruela pasa',
    ],
  },
  {
    slug: 'lacteos',
    taxRate: TAX_RATES.REDUCED,
    defaultUnit: 'kg',
    keywords: [
      'queso', 'mantequilla', 'cuajada', 'requeson', 'mozzarella', 'lacteo',
      'ricotta', 'mascarpone', 'burrata', 'gouda', 'brie', 'camembert',
      'parmesano', 'parmigiano', 'cheddar', 'feta', 'roquefort', 'emmental',
      'gruyere', 'fontina', 'provolone', 'raclette', 'halloumi', 'paneer',
      'tetilla', 'curado', 'semicurado', 'tierno', 'añejo', 'anejo',
    ],
  },
  {
    slug: 'lacteos',
    taxRate: TAX_RATES.REDUCED,
    defaultUnit: 'l',
    keywords: [
      'leche', 'nata', 'kefir', 'suero', 'batido', 'smoothie', 'lassi',
    ],
  },
  {
    slug: 'lacteos',
    taxRate: TAX_RATES.REDUCED,
    defaultUnit: 'unidad',
    keywords: ['yogur', 'yogurt'],
  },
  {
    slug: 'lacteos',
    taxRate: TAX_RATES.REDUCED,
    defaultUnit: 'docena',
    keywords: ['huevo'],
  },
  {
    slug: 'panaderia',
    taxRate: TAX_RATES.STANDARD,
    defaultUnit: 'unidad',
    keywords: [
      'bolleria', 'reposteria', 'pastel', 'tarta', 'galleta', 'bizcocho',
      'magdalena', 'croissant', 'cruasan', 'ensaimada', 'palmera', 'churro',
      'donut', 'dona', 'brioche', 'roscon', 'napolitana', 'sobao', 'mantecado',
      'polvoron', 'alfajor', 'hojaldre', 'milhoja', 'eclair', 'profiterol',
      'financier', 'madeleine', 'scone', 'cookie', 'brownie', 'cupcake',
      'muffin', 'panellet', 'turron', 'mazapan', 'almendrado', 'pestiño',
      'pestino', 'torrija', 'buñuelo', 'bunuelo', 'rosquilla', 'panettone',
      'cannoli', 'baklava', 'cheesecake', 'tiramisu', 'macaron',
    ],
  },
  {
    slug: 'carnicos',
    taxRate: TAX_RATES.STANDARD,
    defaultUnit: 'kg',
    keywords: [
      // Generic
      'carne', 'embutido',
      // Aves
      'pollo', 'pavo', 'pato', 'oca', 'ganso', 'codorniz', 'perdiz', 'faisan',
      'pichon',
      // Mamíferos
      'ternera', 'vaca', 'buey', 'cerdo', 'cordero', 'lechazo', 'cabrito',
      'cabra', 'lechon', 'conejo', 'jabali', 'ciervo', 'venado', 'liebre',
      // Ibérico / curados
      'jamon', 'paleta', 'paletilla', 'serrano', 'iberico', 'bellota',
      'cebo', 'recebo', 'guijuelo',
      // Cortes
      'lomo', 'solomillo', 'chuleta', 'chuleton', 'costilla', 'entrecot',
      'entrecote', 'churrasco', 'secreto', 'presa', 'pluma', 'papada',
      'careta', 'codillo', 'oreja', 'manitas', 'callos', 'mollejas',
      'higado', 'riñon', 'rinon', 'lengua', 'rabo', 'carrillera', 'asadura',
      // Embutidos
      'chorizo', 'salchichon', 'morcilla', 'fuet', 'sobrasada', 'butifarra',
      'longaniza', 'txistorra', 'chistorra', 'cecina', 'mojama', 'lacon',
      'panceta', 'bacon', 'tocino', 'cabeza de jabali',
      // Procesados
      'salchicha', 'albondiga', 'hamburguesa', 'pate', 'foie',
    ],
  },
  {
    slug: 'aceites',
    taxRate: TAX_RATES.STANDARD,
    defaultUnit: 'l',
    keywords: [
      'aceite', 'oliva', 'aove', 'arbequina', 'picual', 'hojiblanca',
      'cornicabra', 'empeltre', 'verdial', 'royal', 'virgen', 'vinagre',
      'balsamico', 'modena', 'sidra', 'jerez',
    ],
  },
  {
    slug: 'aceites',
    taxRate: TAX_RATES.STANDARD,
    defaultUnit: 'unidad',
    keywords: [
      'conserva', 'anchoa', 'atun', 'bonito', 'sardina', 'caballa', 'melva',
      'ventresca', 'mejillon', 'almeja', 'berberecho', 'navaja', 'pulpo',
      'calamar', 'sepia', 'hueva', 'ahumado', 'salazon', 'mojama',
      'escabeche', 'encurtido', 'aceituna', 'pepinillo', 'alcaparra',
      'guindilla', 'banderilla', 'tapenade', 'hummus', 'gazpacho', 'salmorejo',
      'ajoblanco', 'sopa', 'crema', 'caldo', 'fondo', 'salsa', 'alioli',
      'mahonesa', 'mayonesa', 'mostaza', 'ketchup', 'sambal', 'sriracha',
      'tabasco', 'chimichurri', 'pesto', 'harissa', 'mojo', 'sofrito',
      'tomate frito', 'paté vegetal',
    ],
  },
  {
    slug: 'miel',
    taxRate: TAX_RATES.STANDARD,
    defaultUnit: 'unidad',
    keywords: [
      'miel', 'mermelada', 'confitura', 'jalea', 'compota', 'propoleo',
      'polen', 'jalea real', 'arrope', 'sirope', 'melaza', 'membrillo',
      'codoñate', 'codonate', 'crema de avellana', 'crema de cacahuete',
      'crema de cacao', 'praline', 'panela', 'dulce de leche', 'caramelo',
      'manjar', 'mostillo',
    ],
  },
  {
    slug: 'vinos',
    taxRate: TAX_RATES.GENERAL,
    defaultUnit: 'botella',
    keywords: [
      'vino', 'cava', 'champagne', 'champan', 'espumoso', 'brut', 'semiseco',
      'tinto', 'blanco', 'rosado', 'crianza', 'reserva', 'gran reserva',
      'joven', 'tempranillo', 'garnacha', 'monastrell', 'mencia', 'godello',
      'treixadura', 'loureira', 'palomino', 'pedro ximenez', 'ximenez',
      'malvasia', 'viura', 'macabeo', 'parellada', 'xarello', 'tannat',
      'syrah', 'merlot', 'cabernet', 'sauvignon', 'chardonnay', 'riesling',
      'gewurztraminer', 'pinot', 'verdejo', 'albarino', 'moscatel', 'fino',
      'oloroso', 'amontillado', 'palo cortado', 'generoso', 'manzanilla',
    ],
  },
  {
    slug: 'vinos',
    taxRate: TAX_RATES.GENERAL,
    defaultUnit: 'l',
    keywords: [
      'cerveza', 'ipa', 'lager', 'ale', 'stout', 'porter', 'pilsner',
      'artesana', 'kombucha', 'hidromiel', 'mosto', 'gaseosa', 'refresco',
      'zumo', 'granizado', 'horchata', 'licor', 'ginebra', 'whisky', 'ron',
      'vermut', 'vermouth', 'sidra',
    ],
  },
]

// Known DO/DOP/IGP terms and Spanish provinces/regions that map to a
// human-readable region string written into `originRegion`.
const REGION_KEYWORDS: ReadonlyArray<[string, string]> = [
  // Vinos DO/DOP
  ['rioja', 'La Rioja'],
  ['ribera del duero', 'Castilla y León'],
  ['ribera', 'Castilla y León'],
  ['rueda', 'Castilla y León'],
  ['toro', 'Castilla y León'],
  ['cigales', 'Castilla y León'],
  ['bierzo', 'León'],
  ['rias baixas', 'Pontevedra'],
  ['valdeorras', 'Ourense'],
  ['monterrei', 'Ourense'],
  ['ribeiro', 'Ourense'],
  ['ribeira sacra', 'Galicia'],
  ['priorat', 'Tarragona'],
  ['montsant', 'Tarragona'],
  ['penedes', 'Cataluña'],
  ['emporda', 'Girona'],
  ['conca de barbera', 'Tarragona'],
  ['terra alta', 'Tarragona'],
  ['somontano', 'Huesca'],
  ['campo de borja', 'Zaragoza'],
  ['carinena', 'Zaragoza'],
  ['calatayud', 'Zaragoza'],
  ['utiel', 'Valencia'],
  ['requena', 'Valencia'],
  ['jumilla', 'Murcia'],
  ['yecla', 'Murcia'],
  ['bullas', 'Murcia'],
  ['jerez', 'Cádiz'],
  ['manzanilla', 'Cádiz'],
  ['sanlucar', 'Cádiz'],
  ['montilla', 'Córdoba'],
  ['moriles', 'Córdoba'],
  ['malaga', 'Málaga'],
  ['sierras de malaga', 'Málaga'],
  // Aceites DOP
  ['baena', 'Córdoba'],
  ['priego', 'Córdoba'],
  ['estepa', 'Sevilla'],
  ['antequera', 'Málaga'],
  ['sierra de cazorla', 'Jaén'],
  ['sierra magina', 'Jaén'],
  ['siurana', 'Tarragona'],
  ['les garrigues', 'Lleida'],
  ['borges blanques', 'Lleida'],
  // Quesos DOP
  ['manchego', 'Castilla-La Mancha'],
  ['mancha', 'Castilla-La Mancha'],
  ['idiazabal', 'País Vasco'],
  ['mahon', 'Menorca'],
  ['cabrales', 'Asturias'],
  ['gamoneu', 'Asturias'],
  ['afuega', 'Asturias'],
  ['casin', 'Asturias'],
  ['roncal', 'Navarra'],
  ['zamorano', 'Zamora'],
  ['tetilla', 'Galicia'],
  ['arzua', 'Galicia'],
  ['san simon', 'Galicia'],
  ['cebreiro', 'Galicia'],
  ['torta del casar', 'Extremadura'],
  ['casar de caceres', 'Extremadura'],
  ['ibores', 'Extremadura'],
  ['serena', 'Extremadura'],
  ['valdeon', 'León'],
  ['camerano', 'La Rioja'],
  // Cárnicos DOP/IGP
  ['jabugo', 'Huelva'],
  ['guijuelo', 'Salamanca'],
  ['dehesa de extremadura', 'Extremadura'],
  ['los pedroches', 'Córdoba'],
  ['teruel', 'Teruel'],
  ['trevelez', 'Granada'],
  ['serrano', 'España'],
  // Hortalizas/frutas DOP/IGP
  ['padron', 'Galicia'],
  ['gernika', 'País Vasco'],
  ['piquillo', 'Navarra'],
  ['lodosa', 'Navarra'],
  ['calahorra', 'La Rioja'],
  ['calanda', 'Teruel'],
  ['fresa de huelva', 'Huelva'],
  ['platano de canarias', 'Canarias'],
  ['cherimoya', 'Granada'],
  // Arroz / legumbres DOP
  ['calasparra', 'Murcia'],
  ['bomba', 'Valencia'],
  ['valencia', 'Valencia'],
  // Turrón / dulces
  ['jijona', 'Alicante'],
  ['alicante', 'Alicante'],
  // Comunidades autónomas
  ['galicia', 'Galicia'],
  ['asturias', 'Asturias'],
  ['cantabria', 'Cantabria'],
  ['euskadi', 'País Vasco'],
  ['pais vasco', 'País Vasco'],
  ['navarra', 'Navarra'],
  ['aragon', 'Aragón'],
  ['cataluna', 'Cataluña'],
  ['cataluña', 'Cataluña'],
  ['catalunya', 'Cataluña'],
  ['valencia', 'Valencia'],
  ['comunidad valenciana', 'Comunidad Valenciana'],
  ['murcia', 'Murcia'],
  ['extremadura', 'Extremadura'],
  ['andalucia', 'Andalucía'],
  ['castilla y leon', 'Castilla y León'],
  ['castilla la mancha', 'Castilla-La Mancha'],
  ['madrid', 'Madrid'],
  ['la rioja', 'La Rioja'],
  ['baleares', 'Islas Baleares'],
  ['canarias', 'Canarias'],
  // Provincias norte / NW
  ['a coruña', 'A Coruña'],
  ['coruña', 'A Coruña'],
  ['coruna', 'A Coruña'],
  ['lugo', 'Lugo'],
  ['ourense', 'Ourense'],
  ['pontevedra', 'Pontevedra'],
  ['vizcaya', 'Vizcaya'],
  ['bizkaia', 'Vizcaya'],
  ['guipuzcoa', 'Guipúzcoa'],
  ['gipuzkoa', 'Guipúzcoa'],
  ['alava', 'Álava'],
  ['araba', 'Álava'],
  // Provincias Castilla y León
  ['burgos', 'Burgos'],
  ['leon', 'León'],
  ['palencia', 'Palencia'],
  ['salamanca', 'Salamanca'],
  ['segovia', 'Segovia'],
  ['soria', 'Soria'],
  ['valladolid', 'Valladolid'],
  ['zamora', 'Zamora'],
  ['avila', 'Ávila'],
  // Provincias Castilla-La Mancha
  ['albacete', 'Albacete'],
  ['ciudad real', 'Ciudad Real'],
  ['cuenca', 'Cuenca'],
  ['guadalajara', 'Guadalajara'],
  ['toledo', 'Toledo'],
  // Aragón
  ['huesca', 'Huesca'],
  ['zaragoza', 'Zaragoza'],
  // Cataluña
  ['lleida', 'Lleida'],
  ['girona', 'Girona'],
  ['barcelona', 'Barcelona'],
  ['tarragona', 'Tarragona'],
  // Comunidad Valenciana
  ['castellon', 'Castellón'],
  // Andalucía
  ['jaen', 'Jaén'],
  ['granada', 'Granada'],
  ['sevilla', 'Sevilla'],
  ['cordoba', 'Córdoba'],
  ['almeria', 'Almería'],
  ['cadiz', 'Cádiz'],
  ['huelva', 'Huelva'],
  // Extremadura
  ['caceres', 'Cáceres'],
  ['badajoz', 'Badajoz'],
  // Baleares
  ['mallorca', 'Islas Baleares'],
  ['menorca', 'Islas Baleares'],
  ['ibiza', 'Islas Baleares'],
  ['formentera', 'Islas Baleares'],
  // Canarias
  ['tenerife', 'Canarias'],
  ['gran canaria', 'Canarias'],
  ['lanzarote', 'Canarias'],
  ['fuerteventura', 'Canarias'],
  ['la palma', 'Canarias'],
  ['el hierro', 'Canarias'],
  ['gomera', 'Canarias'],
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function wordMatch(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Allow Spanish plural endings (+s / +es) so "manzana" matches "manzanas"
  // and "limon" matches "limones" without listing every plural form.
  return new RegExp(`\\b${escaped}(es|s)?\\b`).test(haystack)
}

export type DetectedCategory = {
  id: string
  name: string
  matchedKeyword: string
}

export type DetectedDefaults = {
  category?: DetectedCategory
  taxRate?: number
  unit?: string
  originRegion?: string
}

export function detectProductDefaults(
  name: string,
  categories: Pick<Category, 'id' | 'slug' | 'name'>[],
): DetectedDefaults {
  const normalized = normalize(name)
  if (normalized.length < 3) return {}

  const result: DetectedDefaults = {}

  for (const rule of CATEGORY_RULES) {
    const hit = rule.keywords.find(keyword => wordMatch(normalized, normalize(keyword)))
    if (!hit) continue
    const category = categories.find(c => c.slug === rule.slug)
    if (!category) continue
    result.category = { id: category.id, name: category.name, matchedKeyword: hit }
    result.taxRate = rule.taxRate
    if (rule.defaultUnit) result.unit = rule.defaultUnit
    break
  }

  for (const [keyword, region] of REGION_KEYWORDS) {
    if (wordMatch(normalized, normalize(keyword))) {
      result.originRegion = region
      break
    }
  }

  return result
}
