import { renderBrandIcon } from '@/lib/pwa/brand-icon'

export const dynamic = 'force-static'
export const revalidate = false

export function GET() {
  return renderBrandIcon(96, 'any', '📦')
}
