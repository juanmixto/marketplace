import { db } from '@/lib/db'

export async function getFilterOptions() {
  const [vendors, categories] = await Promise.all([
    db.vendor.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    }),
    db.category.findMany({
      where: { isActive: true, parentId: null },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])
  return {
    vendors: vendors.map(v => ({ id: v.id, label: v.displayName })),
    categories: categories.map(c => ({ id: c.id, label: c.name })),
  }
}
