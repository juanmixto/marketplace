import { renderBrandScreenshot } from '@/lib/pwa/brand-screenshot'

export const dynamic = 'force-static'
export const revalidate = false

export function GET() {
  return renderBrandScreenshot('narrow')
}
