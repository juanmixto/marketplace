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

type LegalNoticeCopy = {
  metadataTitle: string
  metadataDescription: string
  eyebrow: string
  updatedAtLabel: string
  title: string
  updatedAt: string
  intro: string
  sections: {
    ownership: {
      title: string
      bodyPrefix: string
      contactLink: string
      bodySuffix: string
    }
    usage: {
      title: string
      items: string[]
    }
    ip: {
      title: string
      body: string
    }
    liability: {
      title: string
      body: string
    }
  }
}

type CookiesCopy = {
  metadataTitle: string
  metadataDescription: string
  eyebrow: string
  updatedAtLabel: string
  title: string
  updatedAt: string
  intro: string
  sections: {
    what: {
      title: string
      body: string
    }
    types: {
      title: string
      items: LabeledItem[]
    }
    consent: {
      title: string
      body: string
    }
    disable: {
      title: string
      body: string
    }
  }
}

type TermsCopy = {
  metadataTitle: string
  metadataDescription: string
  eyebrow: string
  updatedAtLabel: string
  title: string
  updatedAt: string
  intro: string
  sections: {
    accounts: {
      title: string
      body: string
    }
    purchases: {
      title: string
      body: string
    }
    shipping: {
      title: string
      body: string
    }
    acceptable: {
      title: string
      items: string[]
    }
    changes: {
      title: string
      body: string
    }
  }
}

type LegalPageCopy = {
  privacy: PrivacyCopy
  legalNotice: LegalNoticeCopy
  cookies: CookiesCopy
  terms: TermsCopy
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
    legalNotice: {
      metadataTitle: 'Aviso legal',
      metadataDescription: `Aviso legal y condiciones de uso de ${SITE_NAME}.`,
      eyebrow: 'Información legal',
      updatedAtLabel: 'Última revisión',
      title: 'Aviso legal',
      updatedAt: '11 de abril de 2026',
      intro: `Este aviso legal regula el acceso y uso del sitio de ${SITE_NAME}, así como las responsabilidades generales de la plataforma y de las personas usuarias.`,
      sections: {
        ownership: {
          title: '1. Titularidad del sitio',
          bodyPrefix: `${SITE_NAME} opera como un marketplace que conecta productores, compradores y equipos operativos. La información de contacto para soporte y consultas está disponible en la página de`,
          contactLink: 'contacto',
          bodySuffix: '.',
        },
        usage: {
          title: '2. Condiciones de uso',
          items: [
            'No se permite usar la plataforma para actividades ilícitas o fraudulentas.',
            'Las personas usuarias deben proporcionar información veraz y mantener sus credenciales seguras.',
            'El acceso a áreas privadas puede requerir registro y autenticación.',
          ],
        },
        ip: {
          title: '3. Propiedad intelectual',
          body: 'Los contenidos de marca, diseño, textos y estructura del sitio están protegidos por la normativa aplicable de propiedad intelectual e industrial. Los contenidos aportados por vendedores o terceros siguen siendo de su titularidad, salvo que se indique lo contrario.',
        },
        liability: {
          title: '4. Responsabilidad',
          body: 'La plataforma actúa como intermediaria técnica entre compradores y vendedores. Cada parte es responsable de cumplir sus obligaciones legales, comerciales y fiscales en el marco de sus operaciones.',
        },
      },
    },
    cookies: {
      metadataTitle: 'Política de cookies',
      metadataDescription: `Información sobre el uso de cookies en ${SITE_NAME}.`,
      eyebrow: 'Información legal',
      updatedAtLabel: 'Última revisión',
      title: 'Política de cookies',
      updatedAt: '11 de abril de 2026',
      intro: `Esta política explica qué tipos de cookies puede usar ${SITE_NAME} y para qué se emplean.`,
      sections: {
        what: {
          title: '1. Qué son las cookies',
          body: 'Las cookies son pequeños archivos que el navegador almacena para recordar preferencias, mantener la sesión y mejorar el funcionamiento del sitio.',
        },
        types: {
          title: '2. Tipos de cookies que usamos',
          items: [
            { label: 'Técnicas', text: 'necesarias para iniciar sesión, mantener el carrito y proteger formularios.' },
            { label: 'Preferencias', text: 'recuerdan idioma, tema visual y otras opciones de experiencia.' },
            { label: 'Analíticas', text: 'se usan para medir el uso del sitio cuando están habilitadas en la configuración de la plataforma.' },
          ],
        },
        consent: {
          title: '3. Gestión del consentimiento',
          body: 'Cuando el sitio active cookies no esenciales, el consentimiento deberá gestionarse de forma clara antes de su uso. También puedes bloquear o eliminar cookies desde la configuración de tu navegador.',
        },
        disable: {
          title: '4. Cómo desactivarlas',
          body: 'Puedes restringir, bloquear o eliminar cookies desde las preferencias de tu navegador. Ten en cuenta que deshabilitar cookies técnicas puede afectar al inicio de sesión y al carrito.',
        },
      },
    },
    terms: {
      metadataTitle: 'Términos de uso',
      metadataDescription: `Términos y condiciones de uso de ${SITE_NAME}.`,
      eyebrow: 'Información legal',
      updatedAtLabel: 'Última revisión',
      title: 'Términos de uso',
      updatedAt: '11 de abril de 2026',
      intro: `Estos términos describen cómo se usa ${SITE_NAME}, qué obligaciones tiene cada parte y cómo se gestiona la compra en la plataforma.`,
      sections: {
        accounts: {
          title: '1. Registro y cuentas',
          body: 'Cuando una funcionalidad requiera cuenta, la persona usuaria debe aportar datos veraces, mantener su contraseña segura y avisar de cualquier uso no autorizado de su cuenta.',
        },
        purchases: {
          title: '2. Compras y disponibilidad',
          body: 'Los pedidos están sujetos a disponibilidad de stock, validación de pago y condiciones logísticas. Los precios y promociones pueden actualizarse antes de completar la compra.',
        },
        shipping: {
          title: '3. Envíos y devoluciones',
          body: 'Las condiciones de envío, plazos y posibles devoluciones se muestran en el proceso de compra y pueden variar según la zona o el producto.',
        },
        acceptable: {
          title: '4. Uso aceptable',
          items: [
            'No se permite el uso automatizado abusivo ni la manipulación de precios o pedidos.',
            'Está prohibida la publicación de contenido engañoso, ilícito o que infrinja derechos de terceros.',
            'La plataforma puede restringir accesos si detecta uso indebido o riesgo para la operación.',
          ],
        },
        changes: {
          title: '5. Cambios en los términos',
          body: `${SITE_NAME} puede actualizar estos términos cuando cambien la operación, la normativa o la propia plataforma. La versión vigente será la publicada en esta página.`,
        },
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
    legalNotice: {
      metadataTitle: 'Legal Notice',
      metadataDescription: `Legal notice and terms of use for ${SITE_NAME}.`,
      eyebrow: 'Legal information',
      updatedAtLabel: 'Last updated',
      title: 'Legal Notice',
      updatedAt: 'April 11, 2026',
      intro: `This legal notice governs access to and use of the ${SITE_NAME} site, as well as the general responsibilities of the platform and its users.`,
      sections: {
        ownership: {
          title: '1. Site ownership',
          bodyPrefix: `${SITE_NAME} operates as a marketplace that connects producers, buyers, and operations teams. Contact information for support and inquiries is available on the`,
          contactLink: 'contact page',
          bodySuffix: '.',
        },
        usage: {
          title: '2. Terms of use',
          items: [
            'The platform may not be used for unlawful or fraudulent activities.',
            'Users must provide accurate information and keep their credentials secure.',
            'Access to private areas may require registration and authentication.',
          ],
        },
        ip: {
          title: '3. Intellectual property',
          body: 'Brand assets, design, copy, and site structure are protected by applicable intellectual and industrial property regulations. Content contributed by sellers or third parties remains the property of its respective owners unless stated otherwise.',
        },
        liability: {
          title: '4. Liability',
          body: 'The platform acts as a technical intermediary between buyers and sellers. Each party is responsible for meeting its own legal, commercial, and tax obligations in connection with its operations.',
        },
      },
    },
    cookies: {
      metadataTitle: 'Cookie policy',
      metadataDescription: `Information about how ${SITE_NAME} uses cookies.`,
      eyebrow: 'Legal information',
      updatedAtLabel: 'Last updated',
      title: 'Cookie policy',
      updatedAt: 'April 11, 2026',
      intro: `This policy explains the types of cookies ${SITE_NAME} may use and what they are used for.`,
      sections: {
        what: {
          title: '1. What cookies are',
          body: 'Cookies are small files that the browser stores to remember preferences, keep your session active, and improve how the site works.',
        },
        types: {
          title: '2. Types of cookies we use',
          items: [
            { label: 'Essential', text: 'required to sign in, keep the cart, and protect forms.' },
            { label: 'Preferences', text: 'remember language, theme, and other experience options.' },
            { label: 'Analytics', text: 'used to measure site usage when enabled in the platform configuration.' },
          ],
        },
        consent: {
          title: '3. Consent management',
          body: 'When the site enables non-essential cookies, consent must be managed clearly before they are used. You can also block or delete cookies from your browser settings.',
        },
        disable: {
          title: '4. How to disable them',
          body: 'You can restrict, block, or delete cookies from your browser preferences. Note that disabling essential cookies may affect sign-in and the cart.',
        },
      },
    },
    terms: {
      metadataTitle: 'Terms of use',
      metadataDescription: `Terms and conditions of use for ${SITE_NAME}.`,
      eyebrow: 'Legal information',
      updatedAtLabel: 'Last updated',
      title: 'Terms of use',
      updatedAt: 'April 11, 2026',
      intro: `These terms describe how ${SITE_NAME} is used, the obligations of each party, and how purchases are handled on the platform.`,
      sections: {
        accounts: {
          title: '1. Registration and accounts',
          body: 'When a feature requires an account, users must provide accurate information, keep their password secure, and report any unauthorized use of their account.',
        },
        purchases: {
          title: '2. Purchases and availability',
          body: 'Orders are subject to stock availability, payment validation, and logistics conditions. Prices and promotions may be updated before checkout is completed.',
        },
        shipping: {
          title: '3. Shipping and returns',
          body: 'Shipping conditions, lead times, and possible returns are shown during checkout and may vary by zone or product.',
        },
        acceptable: {
          title: '4. Acceptable use',
          items: [
            'Abusive automated use and manipulation of prices or orders are not allowed.',
            'Publishing misleading or unlawful content, or content that infringes third-party rights, is prohibited.',
            'The platform may restrict access if it detects misuse or risk to operations.',
          ],
        },
        changes: {
          title: '5. Changes to these terms',
          body: `${SITE_NAME} may update these terms when operations, regulations, or the platform itself change. The version published on this page is the one in force.`,
        },
      },
    },
  },
}

export function getLegalPageCopy(locale: Locale): LegalPageCopy {
  return legalPageCopy[locale] ?? legalPageCopy.es
}
