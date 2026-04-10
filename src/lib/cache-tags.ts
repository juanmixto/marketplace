// Public catalog cache tags.
// - `catalog`: filtered listing pages and featured product collections.
// - `products`: product detail queries and static params.
// - `vendors`: public vendor profile queries and vendor listings.
// - `categories`: category navigation and counts.
// - `home`: the storefront landing snapshot.
export const CACHE_TAGS = {
  catalog: 'catalog',
  products: 'products',
  vendors: 'vendors',
  categories: 'categories',
  home: 'home',
} as const
