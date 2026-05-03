import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/client'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to bootstrap production')
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})

const categories = [
  { id: 'cat-verduras', name: 'Verduras y Hortalizas', slug: 'verduras', sortOrder: 1 },
  { id: 'cat-frutas', name: 'Frutas', slug: 'frutas', sortOrder: 2 },
  { id: 'cat-lacteos', name: 'Lácteos y Huevos', slug: 'lacteos', sortOrder: 3 },
  { id: 'cat-carnicos', name: 'Cárnicos', slug: 'carnicos', sortOrder: 4 },
  { id: 'cat-aceites', name: 'Aceites y Conservas', slug: 'aceites', sortOrder: 5 },
  { id: 'cat-panaderia', name: 'Panadería y Repostería', slug: 'panaderia', sortOrder: 6 },
  { id: 'cat-vinos', name: 'Vinos y Bebidas', slug: 'vinos', sortOrder: 7 },
  { id: 'cat-miel', name: 'Miel y Mermeladas', slug: 'miel', sortOrder: 8 },
] as const

const marketplaceConfig = [
  {
    key: 'DEFAULT_COMMISSION_RATE',
    value: 0.12,
    description: 'Comisión por defecto aplicada a nuevos productores',
  },
  {
    key: 'FREE_SHIPPING_THRESHOLD',
    value: 35,
    description: 'Importe mínimo para activar envío gratis',
  },
  {
    key: 'FLAT_SHIPPING_COST',
    value: 4.95,
    description: 'Coste fijo de envío estándar',
  },
  {
    key: 'MAINTENANCE_MODE',
    value: false,
    description: 'Bloqueo temporal del storefront público',
  },
  {
    key: 'HERO_BANNER_TEXT',
    value: '',
    description: 'Texto promocional principal mostrado en home',
  },
] as const

function requireProductionIntent() {
  if (process.env.APP_ENV !== 'production') {
    throw new Error('Refusing to bootstrap: APP_ENV must be production')
  }

  if (process.env.NEXT_PUBLIC_APP_URL !== 'https://raizdirecta.es') {
    throw new Error('Refusing to bootstrap: NEXT_PUBLIC_APP_URL must be https://raizdirecta.es')
  }
}

async function bootstrapConfig() {
  for (const config of marketplaceConfig) {
    await db.marketplaceConfig.upsert({
      where: { key: config.key },
      update: {
        value: config.value,
        description: config.description,
      },
      create: config,
    })
  }
}

async function bootstrapCategories() {
  for (const category of categories) {
    await db.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      create: {
        ...category,
        isActive: true,
      },
    })
  }
}

async function bootstrapAdmin() {
  const email = process.env.PROD_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.PROD_ADMIN_PASSWORD
  const firstName = process.env.PROD_ADMIN_FIRST_NAME?.trim() || 'Admin'
  const lastName = process.env.PROD_ADMIN_LAST_NAME?.trim() || 'Raíz Directa'

  if (!email && !password) {
    console.log('  - Superadmin: skipped (set PROD_ADMIN_EMAIL and PROD_ADMIN_PASSWORD to create one)')
    return
  }

  if (!email || !password) {
    throw new Error('Both PROD_ADMIN_EMAIL and PROD_ADMIN_PASSWORD are required to create a superadmin')
  }

  if (password.length < 16) {
    throw new Error('PROD_ADMIN_PASSWORD must be at least 16 characters')
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await db.user.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      passwordHash,
      role: 'SUPERADMIN',
      isActive: true,
      emailVerified: new Date(),
    },
    create: {
      email,
      firstName,
      lastName,
      passwordHash,
      role: 'SUPERADMIN',
      isActive: true,
      emailVerified: new Date(),
    },
  })

  console.log(`  - Superadmin: ${email}`)
}

async function main() {
  requireProductionIntent()

  console.log('Bootstrapping production baseline...')
  await bootstrapConfig()
  console.log(`  - Marketplace config: ${marketplaceConfig.length} keys`)
  await bootstrapCategories()
  console.log(`  - Categories: ${categories.length}`)
  await bootstrapAdmin()
  console.log('Production bootstrap completed.')
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
