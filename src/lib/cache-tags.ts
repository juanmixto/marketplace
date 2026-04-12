// Public catalog cache tags.
//
// Coarse tags (flush everything in that bucket):
// - `catalog`: filtered listing pages and featured product collections.
// - `products`: product detail queries and static params.
// - `vendors`: public vendor profile queries and vendor listings.
// - `categories`: category navigation and counts.
// - `home`: the storefront landing snapshot.
//
// Fine-grained tag builders (flush a single entity only). Attach these
// next to the coarse tag when wiring an unstable_cache so a mutation
// can choose the narrowest possible invalidation.
export const CACHE_TAGS = {
  catalog: 'catalog',
  products: 'products',
  vendors: 'vendors',
  categories: 'categories',
  home: 'home',
  product: (slugOrId: string) => `product:${slugOrId}`,
  vendor: (slugOrId: string) => `vendor:${slugOrId}`,
  category: (slugOrId: string) => `category:${slugOrId}`,
} as const
