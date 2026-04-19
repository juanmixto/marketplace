interface Labels {
  name: string
  namePlaceholder: string
  category: string
  location: string
  locationPlaceholder: string
  description: string
  descriptionPlaceholder: string
  submit: string
  footer: string
  categoryOptions: Array<{ value: string; label: string }>
}

interface Props {
  action: (formData: FormData) => Promise<void>
  labels: Labels
}

export function VendorApplicationForm({ action, labels }: Props) {
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="displayName" className="mb-1 block text-sm font-medium text-[var(--foreground)]">
          {labels.name} <span className="text-red-500">*</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          minLength={2}
          maxLength={80}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          placeholder={labels.namePlaceholder}
          aria-label={labels.name}
        />
      </div>

      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium text-[var(--foreground)]">
          {labels.category}
        </label>
        <select
          id="category"
          name="category"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          defaultValue=""
        >
          {labels.categoryOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="location" className="mb-1 block text-sm font-medium text-[var(--foreground)]">
          {labels.location}
        </label>
        <input
          id="location"
          name="location"
          type="text"
          maxLength={120}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          placeholder={labels.locationPlaceholder}
          aria-label={labels.location}
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-[var(--foreground)]">
          {labels.description}
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={1000}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          placeholder={labels.descriptionPlaceholder}
          aria-label={labels.description}
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        {labels.submit}
      </button>
      <p className="text-xs text-[var(--muted)]">{labels.footer}</p>
    </form>
  )
}
