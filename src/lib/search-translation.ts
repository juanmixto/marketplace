/**
 * English → Spanish search-term expansion for the product catalog.
 *
 * The catalog stores product names and descriptions in Spanish. When a buyer
 * types an English query like "honey" or "olive oil", the substring search
 * over `name`/`description`/`tags` finds nothing because the rows say "miel"
 * and "aceite de oliva".
 *
 * `expandSearchQuery` looks each query token (and 2-/3-word phrases) up in a
 * focused EN→ES food/grocery dictionary and returns the original query plus
 * any Spanish equivalents. The query layer ORs all returned terms together,
 * so a search for "olive oil" hits both "Aceite de oliva virgen extra" and
 * any product with "olive" in the name (e.g. an English-named import).
 *
 * Why locale-agnostic: a Spanish-speaking buyer who types an English word
 * (because they saw it on a label) gets the same benefit, and we keep the
 * Prisma cache key untouched.
 */

const EN_TO_ES: Record<string, string> = {
  // Top-level categories
  honey: 'miel',
  oil: 'aceite',
  oils: 'aceites',
  'olive oil': 'aceite de oliva',
  'extra virgin olive oil': 'aceite de oliva virgen extra',
  olive: 'oliva',
  olives: 'aceitunas',
  wine: 'vino',
  wines: 'vinos',
  cheese: 'queso',
  cheeses: 'quesos',
  bread: 'pan',
  bakery: 'panadería',
  vegetable: 'verdura',
  vegetables: 'verduras',
  veggies: 'verduras',
  fruit: 'fruta',
  fruits: 'frutas',
  meat: 'carne',
  meats: 'carnes',
  milk: 'leche',
  dairy: 'lácteos',

  // Meats / charcuterie
  beef: 'ternera',
  pork: 'cerdo',
  chicken: 'pollo',
  lamb: 'cordero',
  fish: 'pescado',
  ham: 'jamón',
  'cured ham': 'jamón curado',
  'iberian ham': 'jamón ibérico',
  iberian: 'ibérico',
  sausage: 'embutido',
  sausages: 'embutidos',
  chorizo: 'chorizo',

  // Fruits
  apple: 'manzana',
  apples: 'manzanas',
  orange: 'naranja',
  oranges: 'naranjas',
  lemon: 'limón',
  lemons: 'limones',
  strawberry: 'fresa',
  strawberries: 'fresas',
  grape: 'uva',
  grapes: 'uvas',
  peach: 'melocotón',
  peaches: 'melocotones',
  pear: 'pera',
  pears: 'peras',
  watermelon: 'sandía',
  melon: 'melón',
  fig: 'higo',
  figs: 'higos',
  cherry: 'cereza',
  cherries: 'cerezas',

  // Vegetables
  tomato: 'tomate',
  tomatoes: 'tomates',
  potato: 'patata',
  potatoes: 'patatas',
  garlic: 'ajo',
  onion: 'cebolla',
  onions: 'cebollas',
  pepper: 'pimiento',
  peppers: 'pimientos',
  carrot: 'zanahoria',
  carrots: 'zanahorias',
  lettuce: 'lechuga',
  cucumber: 'pepino',
  spinach: 'espinaca',
  zucchini: 'calabacín',
  pumpkin: 'calabaza',
  artichoke: 'alcachofa',
  artichokes: 'alcachofas',
  asparagus: 'espárrago',

  // Dairy
  yogurt: 'yogur',
  yoghurt: 'yogur',
  butter: 'mantequilla',
  cream: 'nata',

  // Pantry
  rice: 'arroz',
  flour: 'harina',
  salt: 'sal',
  sugar: 'azúcar',
  vinegar: 'vinagre',
  beans: 'judías',
  lentils: 'lentejas',
  chickpeas: 'garbanzos',
  almond: 'almendra',
  almonds: 'almendras',
  nuts: 'frutos secos',
  jam: 'mermelada',
  marmalade: 'mermelada',
  pasta: 'pasta',
  saffron: 'azafrán',

  // Wine descriptors (only safe in wine context, but harmless as extra OR clauses)
  'red wine': 'vino tinto',
  'white wine': 'vino blanco',
  'rosé wine': 'vino rosado',
  'rose wine': 'vino rosado',
  'sparkling wine': 'vino espumoso',
  cava: 'cava',

  // Quality / certifications
  organic: 'ecológico',
  ecological: 'ecológico',
  bio: 'bio',
  artisan: 'artesano',
  artisanal: 'artesanal',
  homemade: 'casero',
  handmade: 'hecho a mano',
  fresh: 'fresco',
  cured: 'curado',
  smoked: 'ahumado',
  'extra virgin': 'virgen extra',
  virgin: 'virgen',
  'gluten free': 'sin gluten',
  'lactose free': 'sin lactosa',
}

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Expand a search query into the original term plus any English→Spanish
 * translations of phrases or individual tokens it contains. Always returns
 * at least the normalized original query (when non-empty).
 *
 * Multi-word phrases are matched first (longest n-gram wins per position),
 * then per-token translations are added. Duplicates are deduped via Set.
 */
export function expandSearchQuery(query: string): string[] {
  const q = normalize(query)
  if (!q) return []

  const results = new Set<string>([q])

  const fullPhrase = EN_TO_ES[q]
  if (fullPhrase) results.add(fullPhrase)

  const words = q.split(' ')

  if (words.length >= 3) {
    for (let i = 0; i <= words.length - 3; i++) {
      const trigram = words.slice(i, i + 3).join(' ')
      const m = EN_TO_ES[trigram]
      if (m) results.add(m)
    }
  }

  if (words.length >= 2) {
    for (let i = 0; i <= words.length - 2; i++) {
      const bigram = words.slice(i, i + 2).join(' ')
      const m = EN_TO_ES[bigram]
      if (m) results.add(m)
    }
  }

  for (const word of words) {
    const m = EN_TO_ES[word]
    if (m) results.add(m)
  }

  return Array.from(results)
}
