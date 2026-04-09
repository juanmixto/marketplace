import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { getServerEnv } from '../src/lib/env'

const adapter = new PrismaPg({ connectionString: getServerEnv().databaseUrl })
const db = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Config ───────────────────────────────────────────────────────────────
  await db.marketplaceConfig.upsert({
    where: { key: 'commission_default' },
    update: {},
    create: { key: 'commission_default', value: 0.12, description: 'Comisión por defecto (12%)' },
  })
  await db.marketplaceConfig.upsert({
    where: { key: 'DEFAULT_COMMISSION_RATE' },
    update: {},
    create: { key: 'DEFAULT_COMMISSION_RATE', value: 0.12, description: 'Comisión por defecto (12%)' },
  })
  await db.marketplaceConfig.upsert({
    where: { key: 'sla_hours' },
    update: {},
    create: { key: 'sla_hours', value: 48, description: 'Horas SLA para incidencias' },
  })
  await db.marketplaceConfig.upsert({
    where: { key: 'FREE_SHIPPING_THRESHOLD' },
    update: {},
    create: { key: 'FREE_SHIPPING_THRESHOLD', value: 35, description: 'Importe mínimo para envío gratis' },
  })
  await db.marketplaceConfig.upsert({
    where: { key: 'FLAT_SHIPPING_COST' },
    update: {},
    create: { key: 'FLAT_SHIPPING_COST', value: 4.95, description: 'Coste fijo de envío estándar' },
  })
  await db.marketplaceConfig.upsert({
    where: { key: 'MAINTENANCE_MODE' },
    update: {},
    create: { key: 'MAINTENANCE_MODE', value: false, description: 'Modo mantenimiento del storefront' },
  })
  await db.marketplaceConfig.upsert({
    where: { key: 'HERO_BANNER_TEXT' },
    update: {},
    create: { key: 'HERO_BANNER_TEXT', value: '', description: 'Texto principal del banner de home' },
  })

  // ─── Commission rule ──────────────────────────────────────────────────────
  await db.commissionRule.upsert({
    where: { id: 'global-rule' },
    update: {},
    create: { id: 'global-rule', type: 'PERCENTAGE', rate: 0.12 },
  })

  // ─── Categories ───────────────────────────────────────────────────────────
  const categories = [
    { id: 'cat-verduras', name: 'Verduras y Hortalizas', slug: 'verduras', icon: '🥦' },
    { id: 'cat-frutas', name: 'Frutas', slug: 'frutas', icon: '🍎' },
    { id: 'cat-lacteos', name: 'Lácteos y Huevos', slug: 'lacteos', icon: '🧀' },
    { id: 'cat-carnicos', name: 'Cárnicos', slug: 'carnicos', icon: '🥩' },
    { id: 'cat-aceites', name: 'Aceites y Conservas', slug: 'aceites', icon: '🫒' },
    { id: 'cat-panaderia', name: 'Panadería y Repostería', slug: 'panaderia', icon: '🍞' },
    { id: 'cat-vinos', name: 'Vinos y Bebidas', slug: 'vinos', icon: '🍷' },
    { id: 'cat-miel', name: 'Miel y Mermeladas', slug: 'miel', icon: '🍯' },
  ]
  for (const cat of categories) {
    await db.category.upsert({ where: { slug: cat.slug }, update: {}, create: cat })
  }

  // ─── Admin user ───────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin1234', 12)
  const admin = await db.user.upsert({
    where: { email: 'admin@marketplace.com' },
    update: {},
    create: {
      email: 'admin@marketplace.com',
      passwordHash: adminHash,
      firstName: 'Admin',
      lastName: 'Marketplace',
      role: 'SUPERADMIN',
      emailVerified: new Date(),
    },
  })
  console.log(`  ✓ Admin: ${admin.email}`)

  // ─── Vendor user ──────────────────────────────────────────────────────────
  const vendorHash = await bcrypt.hash('vendor1234', 12)
  const vendorUser = await db.user.upsert({
    where: { email: 'productor@test.com' },
    update: {},
    create: {
      email: 'productor@test.com',
      passwordHash: vendorHash,
      firstName: 'Carlos',
      lastName: 'García',
      role: 'VENDOR',
      emailVerified: new Date(),
    },
  })

  const vendor = await db.vendor.upsert({
    where: { userId: vendorUser.id },
    update: {},
    create: {
      userId: vendorUser.id,
      slug: 'finca-garcia',
      displayName: 'Finca García',
      description: 'Productores ecológicos en la Sierra de Gredos. Más de 30 años cultivando con respeto a la tierra.',
      location: 'Ávila, Castilla y León',
      status: 'ACTIVE',
      commissionRate: 0.10,
      orderCutoffTime: '14:00',
      preparationDays: 2,
      stripeOnboarded: false,
    },
  })
  console.log(`  ✓ Vendor: ${vendorUser.email} → ${vendor.displayName}`)

  // ─── Products ─────────────────────────────────────────────────────────────
  const products = [
    {
      id: 'prod-tomates',
      vendorId: vendor.id,
      categoryId: 'cat-verduras',
      name: 'Tomates cherry ecológicos',
      slug: 'tomates-cherry-ecologicos',
      description: 'Tomates cherry cultivados sin pesticidas en invernadero solar. Recogidos en el día.',
      images: ['https://images.unsplash.com/photo-1546470427-e26264be0b0d?w=800'],
      status: 'ACTIVE' as const,
      basePrice: 3.5,
      taxRate: 0.04,
      unit: 'kg',
      stock: 50,
      certifications: ['ECO-ES', 'KM0'],
      originRegion: 'Ávila',
    },
    {
      id: 'prod-aceite',
      vendorId: vendor.id,
      categoryId: 'cat-aceites',
      name: 'Aceite de oliva virgen extra',
      slug: 'aceite-oliva-virgen-extra',
      description: 'AOVE de primera prensada en frío. Variedad Cornicabra. Cosecha 2024.',
      images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800'],
      status: 'ACTIVE' as const,
      basePrice: 12.0,
      compareAtPrice: 15.0,
      taxRate: 0.10,
      unit: 'botella 750ml',
      stock: 30,
      certifications: ['ECO-ES', 'DOP'],
      originRegion: 'Ávila',
    },
    {
      id: 'prod-huevos',
      vendorId: vendor.id,
      categoryId: 'cat-lacteos',
      name: 'Huevos de gallinas camperas',
      slug: 'huevos-gallinas-camperas',
      description: 'Huevos de gallinas criadas en libertad. Categoría A, clase L.',
      images: ['https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=800'],
      status: 'ACTIVE' as const,
      basePrice: 4.8,
      taxRate: 0.04,
      unit: 'docena',
      stock: 120,
      certifications: ['KM0'],
      originRegion: 'Ávila',
    },
  ]

  for (const p of products) {
    await db.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: p,
    })
  }
  console.log(`  ✓ ${products.length} productos creados`)

  // ─── Customer user ────────────────────────────────────────────────────────
  const customerHash = await bcrypt.hash('cliente1234', 12)
  const customer = await db.user.upsert({
    where: { email: 'cliente@test.com' },
    update: {},
    create: {
      email: 'cliente@test.com',
      passwordHash: customerHash,
      firstName: 'María',
      lastName: 'López',
      role: 'CUSTOMER',
      emailVerified: new Date(),
    },
  })
  console.log(`  ✓ Customer: ${customer.email}`)

  // ─── Shipping zones ───────────────────────────────────────────────────────
  const peninsula = await db.shippingZone.upsert({
    where: { id: 'zone-peninsula' },
    update: {},
    create: {
      id: 'zone-peninsula',
      name: 'Península Ibérica',
      provinces: ['28', '08', '41', '46', '29'],
      isActive: true,
    },
  })
  await db.shippingRate.upsert({
    where: { id: 'rate-peninsula-std' },
    update: {},
    create: {
      id: 'rate-peninsula-std',
      zoneId: peninsula.id,
      name: 'Estándar (3-5 días)',
      price: 4.95,
      freeAbove: 35.0,
    },
  })

  console.log('✅ Seed completado')
  console.log('')
  console.log('Credenciales de acceso:')
  console.log('  Admin:      admin@marketplace.com / admin1234')
  console.log('  Productor:  productor@test.com    / vendor1234')
  console.log('  Cliente:    cliente@test.com       / cliente1234')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
