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

function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/\p{M}/gu, '')
}

// Characters whose accented/unaccented forms we treat as interchangeable when
// generating search variants for terms that already carry an accent or `ñ`.
// This keeps queries like "honey" from exploding into nonsense variants while
// still letting "ecológico" also search for "ecologico".
const ACCENT_VARIANTS: Record<string, string[]> = {
  a: ['a', 'á'],
  e: ['e', 'é'],
  i: ['i', 'í'],
  o: ['o', 'ó'],
  u: ['u', 'ú', 'ü'],
  n: ['n', 'ñ'],
}

// Cap per-term explosion: 2^4 = 16 variants is plenty for typical Spanish
// grocery tokens (jamón, aceite, manzana…) without hammering the OR list.
const MAX_VARIANT_POSITIONS = 4

function wordAccentVariants(word: string): string[] {
  const base = stripDiacritics(word)
  const positions: number[] = []
  for (let i = 0; i < base.length; i++) {
    if (ACCENT_VARIANTS[base[i]]) positions.push(i)
  }

  const out = new Set<string>([word, base])

  if (positions.length <= MAX_VARIANT_POSITIONS) {
    // Full cartesian for short tokens.
    const chars = base.split('')
    const emit = (idx: number) => {
      if (idx === positions.length) {
        out.add(chars.join(''))
        return
      }
      const pos = positions[idx]
      for (const variant of ACCENT_VARIANTS[base[pos]]) {
        chars[pos] = variant
        emit(idx + 1)
      }
    }
    emit(0)
  } else {
    // Long tokens (calabacín, berenjena, mantequilla…) would blow up. Spanish
    // words almost always carry at most one accented vowel on the stressed
    // syllable, so emit "one accent at a time" variants over EVERY candidate
    // position (including near the end) instead of truncating. This yields
    // O(positions · variants) ≈ a dozen forms per word and, crucially,
    // "calabacin" → "calabacín" still appears.
    for (const pos of positions) {
      for (const variant of ACCENT_VARIANTS[base[pos]]) {
        if (variant === base[pos]) continue
        out.add(base.slice(0, pos) + variant + base.slice(pos + 1))
      }
    }
  }

  return Array.from(out)
}

// Per-phrase cap on the cartesian product of word variants. Typical
// "aceite de oliva virgen" stays well under this; pathological queries
// degrade gracefully instead of generating hundreds of OR clauses.
const MAX_PHRASE_VARIANTS = 32

function expandAccentVariants(term: string, into: Set<string>): void {
  into.add(term)
  const base = stripDiacritics(term)
  if (base === term) return

  into.add(base)

  const words = term.split(' ')
  let phrases: string[] = ['']
  for (const word of words) {
    const variants = wordAccentVariants(word)
    const next: string[] = []
    for (const prefix of phrases) {
      for (const variant of variants) {
        next.push(prefix ? `${prefix} ${variant}` : variant)
        if (next.length >= MAX_PHRASE_VARIANTS) break
      }
      if (next.length >= MAX_PHRASE_VARIANTS) break
    }
    phrases = next
  }
  for (const phrase of phrases) into.add(phrase)
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

  // Expand every term (original query, translations, partial phrases) into its
  // accent variants so buyers typing "jamon" match DB rows with "jamón", and
  // vice versa. Done last so the dictionary lookups (which are keyed on
  // unaccented English) aren't affected.
  const withAccents = new Set<string>()
  for (const term of results) {
    expandAccentVariants(term, withAccents)
  }

  return Array.from(withAccents)
}
