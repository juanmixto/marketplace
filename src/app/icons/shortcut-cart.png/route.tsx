import { renderBrandIcon } from '@/lib/pwa/brand-icon'

export const dynamic = 'force-static'
export const revalidate = false

export async function GET() {
  return await renderBrandIcon(96, 'any', '🛒')
}
