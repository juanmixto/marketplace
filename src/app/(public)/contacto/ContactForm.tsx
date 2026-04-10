'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const contactSchema = z.object({
  nombre: z.string().min(2, 'El nombre es demasiado corto').max(100),
  email: z.string().email('Email inválido'),
  asunto: z.enum(['pedido', 'productores', 'tecnico', 'general', 'otros']),
  mensaje: z
    .string()
    .min(20, 'El mensaje debe tener al menos 20 caracteres')
    .max(1000, 'Máximo 1000 caracteres'),
  privacidad: z.literal(true),
})

type ContactFormData = z.infer<typeof contactSchema>

const asuntoLabels = {
  pedido: 'Soporte con un pedido',
  productores: 'Información para productores',
  tecnico: 'Problema técnico',
  general: 'Consulta general',
  otros: 'Otros',
}

export function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>({
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
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al enviar el mensaje')
      }

      setSuccess(true)
      reset()

      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar el formulario')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Success message */}
      {success && (
        <div className="rounded-lg bg-accent-soft p-4 text-foreground">
          ✓ Mensaje recibido. Nos pondremos en contacto en breve.
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-800">
          ✗ {error}
        </div>
      )}

      {/* Nombre */}
      <div>
        <label htmlFor="nombre" className="block text-sm font-medium text-foreground">
          Nombre *
        </label>
        <input
          {...register('nombre')}
          type="text"
          id="nombre"
          placeholder="Tu nombre"
          className="mt-2 block w-full rounded-lg border border-border px-4 py-2 text-foreground placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre.message}</p>}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          Email *
        </label>
        <input
          {...register('email')}
          type="email"
          id="email"
          placeholder="tu@email.com"
          className="mt-2 block w-full rounded-lg border border-border px-4 py-2 text-foreground placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
      </div>

      {/* Asunto */}
      <div>
        <label htmlFor="asunto" className="block text-sm font-medium text-foreground">
          Asunto *
        </label>
        <select
          {...register('asunto')}
          id="asunto"
          className="mt-2 block w-full rounded-lg border border-border px-4 py-2 text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
        >
          <option value="">Elige un asunto...</option>
          {Object.entries(asuntoLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {errors.asunto && <p className="mt-1 text-sm text-red-600">{errors.asunto.message}</p>}
      </div>

      {/* Mensaje */}
      <div>
        <label htmlFor="mensaje" className="block text-sm font-medium text-foreground">
          Mensaje *
        </label>
        <textarea
          {...register('mensaje')}
          id="mensaje"
          rows={5}
          placeholder="Cuéntanos lo que necesitas..."
          className="mt-2 block w-full rounded-lg border border-border px-4 py-2 text-foreground placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {errors.mensaje && <p className="mt-1 text-sm text-red-600">{errors.mensaje.message}</p>}
      </div>

      {/* Privacy checkbox */}
      <div className="flex items-start gap-3">
        <input
          {...register('privacidad')}
          type="checkbox"
          id="privacidad"
          className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
        />
        <label htmlFor="privacidad" className="text-sm text-foreground-soft">
          He leído y acepto la{' '}
          <a href="/privacidad" className="text-accent hover:underline">
            Política de Privacidad
          </a>
          {errors.privacidad && <span className="text-red-600">*</span>}
        </label>
      </div>
      {errors.privacidad && <p className="text-sm text-red-600">{errors.privacidad.message}</p>}

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Enviando...' : 'Enviar mensaje'}
      </button>
    </form>
  )
}
