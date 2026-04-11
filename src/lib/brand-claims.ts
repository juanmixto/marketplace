export type BrandClaim = {
  text: string
  owner: string
  source: string
  updateWhen: string
}

export const BRAND_CLAIMS = {
  directMarketplace: {
    text: 'Compra directa al productor',
    owner: 'Brand / Producto',
    source: 'Propuesta de valor definida para el storefront público',
    updateWhen: 'Cuando cambie el modelo de marketplace o la propuesta comercial',
  },
  paymentSecurity: {
    text: 'Pago seguro con Stripe',
    owner: 'Payments',
    source: 'Integración activa de Stripe en checkout',
    updateWhen: 'Cuando cambie el proveedor de pago o el flujo de checkout',
  },
  shippingCoverage: {
    text: 'Cobertura de envío según cada productor',
    owner: 'Operaciones',
    source: 'Configuración logística por vendedor',
    updateWhen: 'Cuando cambien las zonas o reglas de envío',
  },
  vendorReview: {
    text: 'Productores sujetos a revisión',
    owner: 'Operaciones',
    source: 'Flujo de alta y aprobación de vendors',
    updateWhen: 'Cuando cambien los criterios de validación de productores',
  },
  supportHours: {
    text: 'Respuesta en horario laboral',
    owner: 'Soporte',
    source: 'Horario publicado en la página de contacto',
    updateWhen: 'Cuando cambien las horas de atención',
  },
  verificationProcess: {
    text: 'Revisión manual de solicitudes',
    owner: 'Operaciones',
    source: 'Proceso interno de revisión de altas',
    updateWhen: 'Cuando cambie el SLA operativo del alta de productores',
  },
} as const satisfies Record<string, BrandClaim>
