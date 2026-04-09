'use client'

interface Props {
  current?: string
}

const OPTIONS = [
  { value: 'newest', label: 'Más recientes' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'popular', label: 'Más populares' },
]

export function SortSelect({ current }: Props) {
  return (
    <form>
      <select
        name="orden"
        defaultValue={current ?? 'newest'}
        onChange={e => {
          const form = e.target.closest('form') as HTMLFormElement
          form?.requestSubmit()
        }}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </form>
  )
}
