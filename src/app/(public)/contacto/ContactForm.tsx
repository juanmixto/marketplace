'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trackAnalyticsEvent } from '@/lib/analytics'
import { useLocale } from '@/i18n'
import { getPublicPageCopy } from '@/i18n/public-page-copy'

const SUBJECT_KEYS = ['pedido', 'productores', 'tecnico', 'general', 'otros'] as const

type ContactFormCopy = ReturnType<typeof getPublicPageCopy>['contact']['form']

function buildContactSchema(formCopy: ContactFormCopy) {
  return z.object({
    nombre: z.string().min(2, formCopy.errors.nameTooShort).max(100),
    email: z.string().email(formCopy.errors.invalidEmail),
    asunto: z.preprocess(
      value => (value === '' ? undefined : value),
      z.enum(SUBJECT_KEYS, { error: () => formCopy.errors.subjectRequired })
    ),
    mensaje: z.string().min(20, formCopy.errors.messageTooShort).max(1000, formCopy.errors.messageTooLong),
    privacidad: z.literal(true, { error: () => formCopy.errors.privacyRequired }),
  })
}

type ContactFormInput = z.input<ReturnType<typeof buildContactSchema>>
type ContactFormData = z.output<ReturnType<typeof buildContactSchema>>

export function ContactForm() {
  const { locale } = useLocale()
  const formCopy = getPublicPageCopy(locale).contact.form
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contactSchema = useMemo(() => buildContactSchema(formCopy), [formCopy])

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormInput, unknown, ContactFormData>({
    resolver: zodResolver(contactSchema),
  })

  const onSubmit = async (data: ContactFormData) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error(formCopy.submitError)
      }

      setSuccess(true)
      trackAnalyticsEvent('contact_submit', {
        contact_subject: data.asunto,
        has_privacy_consent: data.privacidad,
      })
      reset()
      setTimeout(() => setSuccess(false), 5000)
    } catch {
      setError(formCopy.submitError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {success && <div className="rounded-lg bg-accent-soft p-4 text-foreground">{formCopy.success}</div>}

      {error && <div className="rounded-lg bg-red-50 p-4 text-red-800">✗ {error}</div>}

      <div>
        <label htmlFor="nombre" className="block text-sm font-medium text-foreground">
          {formCopy.nameLabel}
        </label>
        <input
          {...register('nombre')}
          type="text"
          id="nombre"
          placeholder={formCopy.namePlaceholder}
          className="mt-2 block w-full rounded-lg border border-border px-4 py-2 text-foreground placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre.message}</p>}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          {formCopy.emailLabel}
        </label>
        <input
          {...register('email')}
          type="email"
          id="email"
          placeholder={formCopy.emailPlaceholder}
          className="mt-2 block w-full rounded-lg border border-border px-4 py-2 text-foreground placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="asunto" className="block text-sm font-medium text-foreground">
          {formCopy.subjectLabel}
        </label>
        <select
          {...register('asunto')}
          id="asunto"
          className="mt-2 block w-full rounded-lg border border-border bg-surface px-4 py-2 text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft [&>option]:bg-surface [&>option]:text-foreground"
        >
          <option value="">{formCopy.subjectPlaceholder}</option>
          {Object.entries(formCopy.subjectOptions).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {errors.asunto && <p className="mt-1 text-sm text-red-600">{errors.asunto.message}</p>}
      </div>

      <div>
        <label htmlFor="mensaje" className="block text-sm font-medium text-foreground">
          {formCopy.messageLabel}
        </label>
        <textarea
          {...register('mensaje')}
          id="mensaje"
          rows={5}
          placeholder={formCopy.messagePlaceholder}
          className="mt-2 block w-full rounded-lg border border-border px-4 py-2 text-foreground placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {errors.mensaje && <p className="mt-1 text-sm text-red-600">{errors.mensaje.message}</p>}
      </div>

      <div className="flex items-start gap-3">
        <input
          {...register('privacidad')}
          type="checkbox"
          id="privacidad"
          className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
        />
        <label htmlFor="privacidad" className="text-sm text-foreground-soft">
          {formCopy.privacyLabel}{' '}
          <a href="/privacidad" className="text-accent hover:underline">
            {formCopy.privacyPolicy}
          </a>
          {errors.privacidad && <span className="text-red-600">*</span>}
        </label>
      </div>
      {errors.privacidad && <p className="text-sm text-red-600">{errors.privacidad.message}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? formCopy.submitLoading : formCopy.submitIdle}
      </button>
    </form>
  )
}
