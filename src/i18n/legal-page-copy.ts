import { SITE_NAME } from '@/lib/constants'
import type { Locale } from './locales'

type LabeledItem = {
  label: string
  text: string
}

type PrivacyCopy = {
  metadataTitle: string
  metadataDescription: string
  eyebrow: string
  updatedAtLabel: string
  title: string
  updatedAt: string
  intro: string
  sections: {
    introduction: {
      title: string
      body: string
    }
    dataCollected: {
      title: string
      providedTitle: string
      providedItems: string[]
      automaticTitle: string
      automaticItems: string[]
    }
    legalBasis: {
      title: string
      items: LabeledItem[]
    }
    rights: {
      title: string
      items: LabeledItem[]
      footnote: string
    }
    retention: {
      title: string
      items: LabeledItem[]
    }
    security: {
      title: string
      lead: string
      items: string[]
    }
    sharing: {
      title: string
      lead: string
      items: LabeledItem[]
    }
    changes: {
      title: string
      body: string
    }
    contact: {
      title: string
      lead: string
      cardTitle: string
      contactPrefix: string
      contactLink: string
      contactSuffix: string
      accountNote: string
    }
    legalNote: string
  }
}

type LegalPageCopy = {
  privacy: PrivacyCopy
}

const legalPageCopy: Record<Locale, LegalPageCopy> = {
  es: {
    privacy: {
      metadataTitle: 'Política de privacidad',
      metadataDescription: `Política de privacidad y protección de datos de ${SITE_NAME}.`,
      eyebrow: 'Información legal',
      updatedAtLabel: 'Última revisión',
      title: 'Política de Privacidad',
      updatedAt: '11 de abril de 2026',
      intro: `El Marketplace se compromete a proteger tus datos personales. Esta política explica cómo recopilamos, usamos y protegemos tu información de conformidad con el Reglamento General de Protección de Datos (RGPD).`,
      sections: {
        introduction: {
          title: '1. Introducción',
          body: 'El Marketplace se compromete a proteger tus datos personales. Esta política explica cómo recopilamos, usamos y protegemos tu información de conformidad con el Reglamento General de Protección de Datos (RGPD).',
        },
        dataCollected: {
          title: '2. Datos que recopilamos',
          providedTitle: 'Datos proporcionados por ti:',
          providedItems: [
            'Email y contraseña (autenticación)',
            'Nombre y apellidos',
            'Dirección de envío y facturación',
            'Número de teléfono (opcional)',
            'Reseñas y comentarios de productos',
          ],
          automaticTitle: 'Datos generados automáticamente:',
          automaticItems: [
            'Historial de pedidos y transacciones',
            'Dirección IP y datos de navegación',
            'Cookies y tecnologías similares',
            'Datos de interacción con el sitio',
          ],
        },
        legalBasis: {
          title: '3. Base legal del tratamiento',
          items: [
            { label: 'Consentimiento', text: 'Para marketing y uso de cookies no esenciales' },
            { label: 'Contrato', text: 'Para procesar tu pedido y proporcionar servicios' },
            { label: 'Obligación legal', text: 'Cumplimiento fiscal y contable' },
            { label: 'Interés legítimo', text: 'Seguridad, prevención de fraude y análisis operativos' },
          ],
        },
        rights: {
          title: '4. Tus derechos (RGPD Arts. 12-22)',
          items: [
            { label: 'Derecho de acceso (Art. 15)', text: 'Obtener una copia de tus datos personales' },
            { label: 'Derecho de rectificación (Art. 16)', text: 'Corregir datos inexactos' },
            { label: 'Derecho al olvido (Art. 17)', text: 'Solicitar la eliminación de tus datos' },
            { label: 'Derecho de limitación (Art. 18)', text: 'Restringir el procesamiento' },
            { label: 'Derecho de portabilidad (Art. 20)', text: 'Obtener datos en un formato legible' },
            { label: 'Derecho de oposición (Art. 21)', text: 'Oponerte a determinadas comunicaciones o tratamientos' },
          ],
          footnote: 'Para ejercer cualquiera de estos derechos, accede a tu cuenta → Privacidad y Datos.',
        },
        retention: {
          title: '5. Retención de datos',
          items: [
            { label: 'Cuenta activa', text: 'Mientras tu cuenta permanezca activa' },
            { label: 'Historial de pedidos', text: '5 años por obligación fiscal y contable' },
            { label: 'Datos de contacto', text: 'Hasta que solicites su eliminación o cierre de cuenta' },
            { label: 'Cookies', text: 'Según su configuración y con un máximo habitual de 2 años' },
          ],
        },
        security: {
          title: '6. Seguridad',
          lead: 'Implementamos medidas técnicas y organizativas para proteger tus datos:',
          items: [
            'Cifrado HTTPS en tránsito',
            'Hashing de contraseñas con bcryptjs (12 rondas)',
            'Bases de datos alojadas en servidores seguros',
            'Acceso restringido a personal autorizado',
            'Revisiones y auditorías de seguridad periódicas',
          ],
        },
        sharing: {
          title: '7. Compartición de datos con terceros',
          lead: 'Solo compartimos tus datos cuando es necesario:',
          items: [
            { label: 'Proveedores de pago', text: 'Stripe para el procesamiento de pagos' },
            { label: 'Vendedores', text: 'Información de envío necesaria para completar tu pedido' },
            { label: 'Autoridades', text: 'Cuando exista obligación legal' },
            { label: 'No vendemos', text: 'Tus datos no se venden a terceros' },
          ],
        },
        changes: {
          title: '8. Cambios en esta política',
          body: 'Nos reservamos el derecho de actualizar esta política. Te notificaremos por email si hay cambios significativos.',
        },
        contact: {
          title: '9. Contacto',
          lead: 'Si tienes preguntas sobre privacidad o deseas ejercer tus derechos RGPD:',
          cardTitle: 'Responsable de Protección de Datos',
          contactPrefix: 'Si necesitas ejercer tus derechos, usa el',
          contactLink: 'formulario de contacto',
          contactSuffix: 'indicando que se trata de una solicitud RGPD.',
          accountNote: 'También puedes revisar tus datos desde la sección de privacidad de tu cuenta.',
        },
        legalNote: 'Esta política está diseñada para cumplir con RGPD (UE), LOPDGDD (España) y otras regulaciones aplicables de protección de datos.',
      },
    },
  },
  en: {
    privacy: {
      metadataTitle: 'Privacy Policy',
      metadataDescription: `Privacy policy and data protection details for ${SITE_NAME}.`,
      eyebrow: 'Legal information',
      updatedAtLabel: 'Last updated',
      title: 'Privacy Policy',
      updatedAt: 'April 11, 2026',
      intro: `The marketplace is committed to protecting your personal data. This policy explains how we collect, use, and safeguard your information in line with the General Data Protection Regulation (GDPR).`,
      sections: {
        introduction: {
          title: '1. Introduction',
          body: 'The marketplace is committed to protecting your personal data. This policy explains how we collect, use, and safeguard your information in line with the General Data Protection Regulation (GDPR).',
        },
        dataCollected: {
          title: '2. Data we collect',
          providedTitle: 'Data you provide to us:',
          providedItems: [
            'Email and password (authentication)',
            'First and last name',
            'Shipping and billing address',
            'Phone number (optional)',
            'Product reviews and comments',
          ],
          automaticTitle: 'Data collected automatically:',
          automaticItems: [
            'Order and transaction history',
            'IP address and browsing data',
            'Cookies and similar technologies',
            'Site interaction data',
          ],
        },
        legalBasis: {
          title: '3. Legal basis for processing',
          items: [
            { label: 'Consent', text: 'For marketing communications and non-essential cookies' },
            { label: 'Contract', text: 'To process your order and provide the service' },
            { label: 'Legal obligation', text: 'Tax, accounting, and compliance requirements' },
            { label: 'Legitimate interest', text: 'Security, fraud prevention, and operational analysis' },
          ],
        },
        rights: {
          title: '4. Your rights (GDPR Arts. 12-22)',
          items: [
            { label: 'Right of access (Art. 15)', text: 'Receive a copy of your personal data' },
            { label: 'Right to rectification (Art. 16)', text: 'Correct inaccurate information' },
            { label: 'Right to erasure (Art. 17)', text: 'Request deletion of your data' },
            { label: 'Right to restriction (Art. 18)', text: 'Limit certain processing activities' },
            { label: 'Right to portability (Art. 20)', text: 'Receive your data in a readable format' },
            { label: 'Right to object (Art. 21)', text: 'Opt out of certain communications or processing' },
          ],
          footnote: 'To exercise any of these rights, go to your account → Privacy and data.',
        },
        retention: {
          title: '5. Data retention',
          items: [
            { label: 'Active account', text: 'For as long as your account remains active' },
            { label: 'Order history', text: '5 years to meet tax and accounting obligations' },
            { label: 'Contact details', text: 'Until you request deletion or account closure' },
            { label: 'Cookies', text: 'Based on their configuration, usually for up to 2 years' },
          ],
        },
        security: {
          title: '6. Security',
          lead: 'We apply technical and organisational measures to protect your data:',
          items: [
            'HTTPS encryption in transit',
            'Password hashing with bcryptjs (12 rounds)',
            'Databases hosted on secure infrastructure',
            'Restricted access for authorised staff only',
            'Regular security reviews and audits',
          ],
        },
        sharing: {
          title: '7. Data sharing with third parties',
          lead: 'We only share your data when it is necessary:',
          items: [
            { label: 'Payment providers', text: 'Stripe for payment processing' },
            { label: 'Sellers', text: 'Shipping information required to complete your order' },
            { label: 'Authorities', text: 'When required by law' },
            { label: 'We do not sell data', text: 'Your personal data is not sold to third parties' },
          ],
        },
        changes: {
          title: '8. Changes to this policy',
          body: 'We may update this policy from time to time. If the changes are significant, we will notify you by email.',
        },
        contact: {
          title: '9. Contact',
          lead: 'If you have privacy questions or want to exercise your GDPR rights:',
          cardTitle: 'Data Protection Contact',
          contactPrefix: 'If you need to exercise your rights, please use the',
          contactLink: 'contact form',
          contactSuffix: 'and mention that it is a GDPR request.',
          accountNote: 'You can also review your data from the privacy section of your account.',
        },
        legalNote: 'This policy is intended to comply with the GDPR (EU), the Spanish LOPDGDD, and other applicable data protection regulations.',
      },
    },
  },
}

export function getLegalPageCopy(locale: Locale): LegalPageCopy {
  return legalPageCopy[locale] ?? legalPageCopy.es
}
