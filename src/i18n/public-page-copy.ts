// Static page content module. See ./README.md for when to use *-copy.ts vs flat keys.
import { DEFAULT_COMMISSION_RATE } from '@/lib/constants'
import { BRAND_CLAIMS } from '@/domains/vendors/brand-claims'
import type { Locale } from './locales'

type FaqItem = {
  q: string
  a: string
}

type FaqSection = {
  category: string
  questions: FaqItem[]
}

type PublicPageCopy = {
  contact: {
    metadataTitle: string
    metadataDescription: string
    heroTitle: string
    heroBody: string
    infoTitle: string
    generalSupport: string
    orderSupport: string
    producers: string
    legal: string
    hoursTitle: string
    hoursBody: string
    formTitle: string
    form: {
      success: string
      submitError: string
      nameLabel: string
      namePlaceholder: string
      emailLabel: string
      emailPlaceholder: string
      subjectLabel: string
      subjectPlaceholder: string
      messageLabel: string
      messagePlaceholder: string
      privacyLabel: string
      privacyPolicy: string
      submitIdle: string
      submitLoading: string
      errors: {
        nameTooShort: string
        invalidEmail: string
        subjectRequired: string
        messageTooShort: string
        messageTooLong: string
        privacyRequired: string
      }
      subjectOptions: {
        pedido: string
        productores: string
        tecnico: string
        general: string
        otros: string
      }
    }
  }
  faq: {
    metadataTitle: string
    metadataDescription: string
    heroTitle: string
    heroBody: string
    sections: FaqSection[]
    ctaTitle: string
    ctaBody: string
    ctaButton: string
  }
  howItWorks: {
    metadataTitle: string
    metadataDescription: string
    heroTitle: string
    heroBody: string
    steps: Array<{ title: string; description: string }>
    advantagesTitle: string
    advantages: Array<{ icon: string; title: string; description: string }>
    ctaTitle: string
    ctaBody: string
    ctaProducts: string
    ctaProducers: string
  }
  aboutUs: {
    metadataTitle: string
    metadataDescription: string
    heroTitle: string
    heroBody: string
    missionTitle: string
    missionBody1: string
    missionBody2: string
    missionQuote: string
    valuesTitle: string
    values: Array<{ icon: string; title: string; description: string }>
    storyTitle: string
    storyParagraphs: string[]
    principles: Array<{ title: string; text: string }>
    ctaTitle: string
    ctaBody: string
    ctaProducts: string
    ctaSell: string
  }
  sell: {
    metadataTitle: string
    metadataDescription: string
    heroTitle: string
    heroBody: string
    heroPrimaryCta: string
    heroSecondaryCta: string
    whyTitle: string
    whyBody: string
    benefits: Array<{ title: string; description: string }>
    toolsTitle: string
    toolsBody: string
    tools: Array<{ title: string; description: string; bullets: string[] }>
    pricingTitle: string
    pricingBody: string
    pricingLabel: string
    pricingExample: string
    pricingSellFor: string
    pricingCommission: string
    pricingYouReceive: string
    pricingFootnote: string
    stepsTitle: string
    steps: Array<{ title: string; desc: string }>
    requirementsTitle: string
    requirements: string[]
    ctaTitle: string
    ctaBody: string
    ctaPrimary: string
    ctaFootnotePrefix: string
    ctaFootnoteJoiner: string
    ctaFootnoteFaq: string
    ctaFootnoteContact: string
  }
}

const commissionRate = `${Math.round(DEFAULT_COMMISSION_RATE * 100)}%`

const publicPageCopy: Record<Locale, PublicPageCopy> = {
  es: {
    contact: {
      metadataTitle: 'Contacto',
      metadataDescription: 'Ponte en contacto con el equipo de Raíz Directa. Estamos aquí para ayudarte.',
      heroTitle: 'Contacto',
      heroBody: '¿Tienes dudas o necesitas ayuda? Nos encantaría saber de ti.',
      infoTitle: 'Información de contacto',
      generalSupport: 'Soporte general',
      orderSupport: 'Soporte con pedidos',
      producers: 'Para productores',
      legal: 'Asuntos legales',
      hoursTitle: 'Horario de atención',
      hoursBody: 'Lunes a viernes, 9:00 - 18:00 (hora peninsular)',
      formTitle: 'Envíanos un mensaje',
      form: {
        success: '✓ Mensaje recibido. Nos pondremos en contacto en breve.',
        submitError: 'No hemos podido enviar el formulario. Inténtalo de nuevo en unos minutos.',
        nameLabel: 'Nombre *',
        namePlaceholder: 'Tu nombre',
        emailLabel: 'Email *',
        emailPlaceholder: 'tu@email.com',
        subjectLabel: 'Asunto *',
        subjectPlaceholder: 'Elige un asunto...',
        messageLabel: 'Mensaje *',
        messagePlaceholder: 'Cuéntanos lo que necesitas...',
        privacyLabel: 'He leído y acepto la',
        privacyPolicy: 'Política de Privacidad',
        submitIdle: 'Enviar mensaje',
        submitLoading: 'Enviando...',
        errors: {
          nameTooShort: 'El nombre es demasiado corto',
          invalidEmail: 'Email inválido',
          subjectRequired: 'Selecciona un asunto',
          messageTooShort: 'El mensaje debe tener al menos 20 caracteres',
          messageTooLong: 'Máximo 1000 caracteres',
          privacyRequired: 'Debes aceptar la política de privacidad',
        },
        subjectOptions: {
          pedido: 'Soporte con un pedido',
          productores: 'Información para productores',
          tecnico: 'Problema técnico',
          general: 'Consulta general',
          otros: 'Otros',
        },
      },
    },
    faq: {
      metadataTitle: 'Preguntas frecuentes',
      metadataDescription: 'Resuelve tus dudas sobre cómo funciona Raíz Directa, pagos, entregas y más.',
      heroTitle: 'Preguntas frecuentes',
      heroBody: 'Encuentra respuestas a las preguntas más comunes sobre Raíz Directa.',
      sections: [
        {
          category: 'Compras',
          questions: [
            {
              q: '¿Cómo puedo comprar en Raíz Directa?',
              a: 'Es sencillo: crea una cuenta, navega nuestro catálogo, selecciona productos, añade al carrito y completa el pago. Recibirás tu pedido en pocos días.',
            },
            {
              q: '¿Necesito crear una cuenta?',
              a: 'Sí, necesitas una cuenta para realizar compras y seguimiento de pedidos. Es rápido y gratuito. Puedes crear una aquí.',
            },
            {
              q: '¿Puedo cambiar mi pedido después de realizar la compra?',
              a: 'Depende del estado del pedido. Si aún no ha sido preparado, contacta a nuestro equipo de soporte. Una vez enviado, no es posible modificarlo.',
            },
            {
              q: '¿Qué métodos de pago aceptan?',
              a: 'Aceptamos tarjetas de crédito y débito (Visa, Mastercard, American Express) a través de Stripe. Los pagos son seguros y encriptados.',
            },
          ],
        },
        {
          category: 'Entregas',
          questions: [
            {
              q: '¿Cuál es el tiempo de entrega?',
              a: 'Los tiempos varían según el productor y la ubicación. La mayoría de entregas ocurren entre 2-5 días laborables. Recibirás actualizaciones en tiempo real.',
            },
            {
              q: '¿A qué zonas entregan?',
              a: 'La cobertura depende de cada productor. Comprueba la disponibilidad en el carrito antes de finalizar la compra.',
            },
            {
              q: '¿Hay costes de envío?',
              a: 'Cada productor define sus costes de envío. Los verás claramente antes de finalizar la compra. Algunos ofrecen envío gratis a partir de cierta cantidad.',
            },
            {
              q: '¿Qué pasa si mi pedido llega dañado?',
              a: 'Contacta a nuestro equipo de soporte dentro del plazo indicado en la página de contacto. Gestionaremos un reembolso o reenvío.',
            },
          ],
        },
        {
          category: 'Devoluciones y reembolsos',
          questions: [
            {
              q: '¿Puedo devolver un producto?',
              a: 'Los productos agrícolas frescos no se devuelven una vez entregados por cuestiones de higiene. Si el producto llega dañado o defectuoso, gestionaremos un reembolso completo.',
            },
            {
              q: '¿Cuál es la política de reembolsos?',
              a: 'Si hay un problema con tu pedido (no coincide con la descripción, está dañado), contacta dentro del plazo indicado en la página de contacto. Procesaremos un reembolso o reenvío.',
            },
            {
              q: '¿Cuánto tiempo tarda el reembolso?',
              a: 'Los reembolsos se procesan en 5-10 días laborables después de la aprobación. Tu banco tardará 2-3 días en reflejar el dinero.',
            },
          ],
        },
        {
          category: 'Cuenta y seguridad',
          questions: [
            {
              q: '¿Mi información está segura?',
              a: 'Sí. Utilizamos encriptación SSL y todas las transacciones pasan por Stripe, que cumple con estándares de seguridad internacionales (PCI DSS).',
            },
            {
              q: 'Olvidé mi contraseña. ¿Cómo la recupero?',
              a: 'Ve a la página de login y haz clic en “¿Olvidaste tu contraseña?”. Recibirás un email con instrucciones para establecer una nueva.',
            },
            {
              q: '¿Cómo elimino mi cuenta?',
              a: 'Puedes solicitar la eliminación de tu cuenta en cualquier momento. Contacta a nuestro equipo de soporte para más detalles sobre la política de eliminación de datos.',
            },
          ],
        },
        {
          category: 'Productores',
          questions: [
            {
              q: '¿Cuáles son los requisitos para vender?',
              a: 'Ser productor o agricultor registrado en España, tener cuenta bancaria española (IBAN), productos alimentarios con origen verificable y cumplimiento de normativa sanitaria.',
            },
            {
              q: '¿Cuál es la comisión?',
              a: `La comisión base es del ${commissionRate} sobre el precio de venta. Sin costes ocultos ni cuotas mensuales.`,
            },
            {
              q: '¿Cuándo recibo mis pagos?',
              a: 'Recibirás liquidaciones semanales según el calendario operativo publicado en la plataforma.',
            },
            {
              q: '¿Cómo empiezo a vender?',
              a: `Regístrate en nuestro portal de productores, completa la ${BRAND_CLAIMS.verificationProcess.text.toLowerCase()}, vincula tu cuenta bancaria y comienza a subir productos.`,
            },
            {
              q: '¿Me avisáis de los nuevos pedidos por Telegram?',
              a: 'Sí. Desde tus preferencias de notificaciones puedes vincular tu cuenta de Telegram y recibir alertas instantáneas de nuevos pedidos, pagos confirmados e incidencias. La vinculación se hace con un enlace seguro y puedes desconectarla o elegir qué eventos recibir en cualquier momento.',
            },
            {
              q: '¿Puedo instalar Raíz Directa como app en el móvil?',
              a: 'Sí. La plataforma es una app instalable (PWA): desde el navegador del móvil o la tablet puedes añadirla a la pantalla de inicio y abrirla como una app nativa, sin pasar por ninguna tienda. Carga rápido, consume pocos datos y se actualiza sola.',
            },
          ],
        },
        {
          category: 'General',
          questions: [
            {
              q: '¿Cómo contacto con soporte?',
              a: 'Puedes contactarnos a través del formulario de contacto de la web o en las direcciones publicadas en la página de contacto. Respondemos en horario laboral.',
            },
            {
              q: '¿Ofrecen experiencias o talleres?',
              a: 'De momento no ofrecemos talleres, pero es algo que nos gustaría explorar en el futuro. Mantente atento a nuestras novedades.',
            },
          ],
        },
      ],
      ctaTitle: '¿Aún tienes preguntas?',
      ctaBody: 'Nuestro equipo de soporte está aquí para ayudarte.',
      ctaButton: 'Contacta con nosotros',
    },
    howItWorks: {
      metadataTitle: 'Cómo funciona',
      metadataDescription: 'Descubre cómo funciona Raíz Directa, la plataforma de venta directa de productos locales.',
      heroTitle: 'Cómo funciona',
      heroBody: 'Conectamos productores locales con consumidores que valoran la calidad y la proximidad. Sin intermediarios, sin sorpresas.',
      steps: [
        {
          title: 'Descubre productores locales',
          description: 'Navega nuestro catálogo y encuentra productores de tu región. Consulta sus ofertas, certificaciones y reseñas de otros clientes.',
        },
        {
          title: 'Selecciona tus productos',
          description: 'Elige lo que necesitas, ajusta cantidades y añade al carrito. Sin intermediarios, directamente del productor.',
        },
        {
          title: 'Paga de forma segura',
          description: 'Completa el pago con tarjeta de forma segura. Todos los pagos están protegidos por Stripe.',
        },
        {
          title: 'Recibe tu pedido',
          description: 'Cada productor prepara y envía su parte. Recibirás notificaciones con el estado del pedido.',
        },
        {
          title: 'Valora tu experiencia',
          description: 'Cuando recibas tu compra, deja una reseña. Tus comentarios ayudan a otros compradores y a los productores a mejorar.',
        },
      ],
      advantagesTitle: 'Ventajas de comprar con nosotros',
      advantages: [
        {
          icon: '🌱',
          title: 'Sostenibilidad',
          description: 'Reduce la huella de carbono comprando localmente. Menos transporte, más frescura.',
        },
        {
          icon: '💰',
          title: 'Mejores precios',
          description: 'Sin intermediarios, el dinero va directo al productor. Tú ahorras y ellos ganan más.',
        },
        {
          icon: '✅',
          title: 'Calidad garantizada',
          description: 'Conoce quién produce tus alimentos. Transparencia total desde el origen hasta tu mesa.',
        },
        {
          icon: '⭐',
          title: 'Reseñas reales',
          description: 'Lee experiencias verificadas de otros clientes y compra con más confianza.',
        },
        {
          icon: '🚚',
          title: 'Entrega rápida',
          description: 'Recibe productos frescos en días, no en semanas. Seguimiento en tiempo real.',
        },
        {
          icon: '🤝',
          title: 'Apoyo local',
          description: 'Cada compra impulsa a productores de tu entorno y fortalece la economía local.',
        },
      ],
      ctaTitle: '¿Listo para empezar?',
      ctaBody: 'Explora nuestro catálogo y descubre productores locales de calidad.',
      ctaProducts: 'Ver productos',
      ctaProducers: 'Ver productores',
    },
    aboutUs: {
      metadataTitle: 'Sobre nosotros',
      metadataDescription: 'Conoce la historia de Raíz Directa, la plataforma que conecta productores locales con consumidores conscientes.',
      heroTitle: 'Sobre Raíz Directa',
      heroBody: 'Una plataforma española dedicada a conectar productores agrícolas locales con consumidores que valoran la calidad, la sostenibilidad y la proximidad.',
      missionTitle: 'Nuestra misión',
      missionBody1: 'Eliminar intermediarios innecesarios entre productores y consumidores. Creemos que la venta directa beneficia a todos: los productores reciben mejores precios, los consumidores acceden a productos frescos y locales, y el medio ambiente se beneficia de menores transportes.',
      missionBody2: 'Cada compra en Raíz Directa es un acto de apoyo a la agricultura local y a la sostenibilidad.',
      missionQuote: '“Conectamos productores con consumidores, sin intermediarios.”',
      valuesTitle: 'Nuestros valores',
      values: [
        {
          icon: '🌱',
          title: 'Sostenibilidad',
          description: 'Apostamos por prácticas agrícolas responsables y por reducir la huella de carbono.',
        },
        {
          icon: '💪',
          title: 'Empoderamiento',
          description: 'Ayudamos a pequeños productores a llegar directamente a sus clientes.',
        },
        {
          icon: '🤝',
          title: 'Confianza',
          description: 'Transparencia en precios, origen y calidad de los productos.',
        },
        {
          icon: '⚡',
          title: 'Eficiencia',
          description: 'Tecnología simple y accesible para facilitar la venta directa.',
        },
        {
          icon: '❤️',
          title: 'Calidad',
          description: 'Nos comprometemos con productos frescos y de excelente calidad.',
        },
        {
          icon: '🏠',
          title: 'Comunidad',
          description: 'Fortalecemos lazos entre vecinos y apoyamos la economía local.',
        },
      ],
      storyTitle: 'Nuestra historia',
      storyParagraphs: [
        'Raíz Directa nace con la convicción de que existe una mejor forma de comercializar productos locales. Observamos cómo los intermediarios se llevaban la mayor parte del margen, mientras productores y consumidores no estaban completamente satisfechos.',
        'Decidimos crear una plataforma simple, transparente y fácil de usar que permitiera a productores vender directamente a consumidores. Sin capas de intermediarios, sin complicaciones innecesarias, solo conexión real.',
        'Hoy conectamos a productores con consumidores que valoran la agricultura local y sostenible. Cada compra es un voto de confianza en ese modelo.',
        'Seguimos mejorando el producto para hacerlo más fácil para productores y compradores. Porque creemos que, si simplificamos, todos ganamos.',
      ],
      principles: [
        {
          title: 'Transparencia',
          text: 'Mostramos la información operativa y comercial necesaria para tomar decisiones con claridad.',
        },
        {
          title: 'Proximidad',
          text: 'Ponemos en contacto a compradores y productores sin capas innecesarias en medio.',
        },
        {
          title: 'Mejora continua',
          text: 'Actualizamos el producto a partir de feedback real, no de cifras de escaparate.',
        },
      ],
      ctaTitle: 'Únete a nuestra comunidad',
      ctaBody: 'Ya sea como comprador o productor, forma parte del movimiento hacia una alimentación más local y sostenible.',
      ctaProducts: 'Descubre productos',
      ctaSell: 'Vende con nosotros',
    },
    sell: {
      metadataTitle: 'Vende tus productos',
      metadataDescription: 'Únete a Raíz Directa y vende tus productos directamente a consumidores locales. Sin intermediarios, cobro semanal, gestión sencilla.',
      heroTitle: 'Vende tus productos directamente',
      heroBody: 'Únete al marketplace de productores locales y vende directamente a clientes finales. En Raíz Directa, tú fijas los precios.',
      heroPrimaryCta: 'Empezar a vender gratis',
      heroSecondaryCta: 'Ver cómo funciona',
      whyTitle: '¿Por qué Raíz Directa?',
      whyBody: '6 razones para vender con un flujo claro, sin cuotas mensuales y con reglas operativas transparentes.',
      benefits: [
        {
          title: 'Cobra más por tu trabajo',
          description: `Sin intermediarios, el precio lo pones tú. Comisión base del ${commissionRate} por venta.`,
        },
        {
          title: 'Controla tu stock',
          description: 'Gestiona tus productos y disponibilidad en tiempo real desde tu panel.',
        },
        {
          title: 'Cobro semanal programado',
          description: 'Liquidaciones semanales según el calendario operativo publicado.',
        },
        {
          title: 'Alcance nacional',
          description: 'Llega a compradores de todo el país según la cobertura de cada productor.',
        },
        {
          title: 'Soporte incluido',
          description: 'Equipo disponible para resolver tus consultas y problemas.',
        },
        {
          title: 'Sin cuotas mensuales',
          description: 'Solo pagas comisión cuando vendes. Cero costes fijos.',
        },
      ],
      toolsTitle: 'Herramientas que marcan la diferencia',
      toolsBody: 'Tecnología pensada para productores: entérate de cada venta al instante y trabaja desde donde estés, también sin cobertura.',
      tools: [
        {
          title: 'Avisos al instante en Telegram',
          description: 'Vincula tu cuenta de Telegram y recibe una notificación en cuanto entra un pedido. Sin abrir el panel, sin refrescar el correo.',
          bullets: [
            'Alertas de nuevos pedidos, pagos confirmados e incidencias.',
            'Configura qué eventos quieres recibir desde tus preferencias.',
            'Vinculación en segundos con un enlace seguro; puedes desconectarlo cuando quieras.',
          ],
        },
        {
          title: 'App instalable en el móvil (PWA)',
          description: 'Raíz Directa se instala como una app nativa en tu móvil o tablet, sin pasar por ninguna tienda. Rápida, ligera y lista para el día a día.',
          bullets: [
            'Icono en la pantalla de inicio y pantalla completa, sin barra del navegador.',
            'Carga rápida y consumo mínimo de datos, incluso con conexión irregular.',
            'Actualizaciones automáticas: siempre tienes la última versión sin reinstalar.',
          ],
        },
      ],
      pricingTitle: 'Precios y comisiones',
      pricingBody: 'Transparentes y justos. Solo pagas cuando vendes.',
      pricingLabel: 'Comisión de plataforma:',
      pricingExample: 'Ejemplo',
      pricingSellFor: 'Vendes un producto por',
      pricingCommission: `Comisión ${commissionRate}`,
      pricingYouReceive: 'Tú recibes',
      pricingFootnote: 'Sin cuotas mensuales. Sin costes ocultos.',
      stepsTitle: 'Así de sencillo. 6 pasos.',
      steps: [
        {
          title: 'Regístrate gratis',
          desc: 'Sin cuota de alta y sin tarjeta requerida.',
        },
        {
          title: 'Verificación rápida',
          desc: 'Nuestro equipo revisa tu solicitud en el siguiente ciclo operativo.',
        },
        {
          title: 'Configura tus pagos',
          desc: 'Vincula tu cuenta bancaria con Stripe Connect de forma segura.',
        },
        {
          title: 'Publica productos',
          desc: 'Sube fotos, precios, stock y descripción de tus productos.',
        },
        {
          title: 'Recibe pedidos',
          desc: 'Recibe notificaciones y gestiona envíos desde tu panel.',
        },
        {
          title: 'Cobra con tranquilidad',
          desc: 'Liquidaciones automáticas cada semana.',
        },
      ],
      requirementsTitle: 'Requisitos para unirse',
      requirements: [
        'Ser productor o agricultor registrado en España.',
        'Tener cuenta bancaria española (IBAN) para cobrar.',
        'Ofrecer productos alimentarios con origen verificable.',
        'Cumplir la normativa sanitaria aplicable.',
      ],
      ctaTitle: '¿Listo para empezar?',
      ctaBody: 'Regístrate hoy, sin compromisos. La revisión sigue el proceso manual publicado.',
      ctaPrimary: 'Crear cuenta de productor',
      ctaFootnotePrefix: '¿Dudas? Consulta nuestro',
      ctaFootnoteJoiner: 'o',
      ctaFootnoteFaq: 'FAQ',
      ctaFootnoteContact: 'contacta',
    },
  },
  en: {
    contact: {
      metadataTitle: 'Contact',
      metadataDescription: 'Get in touch with the Raíz Directa team. We are here to help.',
      heroTitle: 'Contact',
      heroBody: 'Got questions or need help? We would love to hear from you.',
      infoTitle: 'Contact information',
      generalSupport: 'General support',
      orderSupport: 'Order support',
      producers: 'For producers',
      legal: 'Legal matters',
      hoursTitle: 'Support hours',
      hoursBody: 'Monday to Friday, 9:00 AM - 6:00 PM (mainland Spain time)',
      formTitle: 'Send us a message',
      form: {
        success: '✓ Message received. We will get back to you shortly.',
        submitError: 'We could not send the form right now. Please try again in a few minutes.',
        nameLabel: 'Name *',
        namePlaceholder: 'Your name',
        emailLabel: 'Email *',
        emailPlaceholder: 'you@email.com',
        subjectLabel: 'Subject *',
        subjectPlaceholder: 'Choose a subject...',
        messageLabel: 'Message *',
        messagePlaceholder: 'Tell us what you need...',
        privacyLabel: 'I have read and accept the',
        privacyPolicy: 'Privacy Policy',
        submitIdle: 'Send message',
        submitLoading: 'Sending...',
        errors: {
          nameTooShort: 'Name is too short',
          invalidEmail: 'Invalid email address',
          subjectRequired: 'Please choose a subject',
          messageTooShort: 'Your message must contain at least 20 characters',
          messageTooLong: 'Maximum 1000 characters',
          privacyRequired: 'You must accept the privacy policy',
        },
        subjectOptions: {
          pedido: 'Order support',
          productores: 'Information for producers',
          tecnico: 'Technical issue',
          general: 'General enquiry',
          otros: 'Other',
        },
      },
    },
    faq: {
      metadataTitle: 'Frequently asked questions',
      metadataDescription: 'Find answers about how Raíz Directa works, payments, deliveries, and more.',
      heroTitle: 'Frequently asked questions',
      heroBody: 'Find quick answers to the most common questions about Raíz Directa.',
      sections: [
        {
          category: 'Buying',
          questions: [
            {
              q: 'How do I buy on Raíz Directa?',
              a: 'It is simple: create an account, browse the catalogue, pick your products, add them to the cart, and complete checkout. Your order will arrive in a few days.',
            },
            {
              q: 'Do I need an account?',
              a: 'Yes. You need an account to place orders and track them. It is quick and free, and you can create one in just a moment.',
            },
            {
              q: 'Can I change my order after purchasing?',
              a: 'It depends on the order status. If it has not been prepared yet, contact support as soon as possible. Once it has shipped, changes are no longer possible.',
            },
            {
              q: 'Which payment methods do you accept?',
              a: 'We accept credit and debit cards (Visa, Mastercard, and American Express) through Stripe. Payments are secure and encrypted.',
            },
          ],
        },
        {
          category: 'Delivery',
          questions: [
            {
              q: 'How long does delivery take?',
              a: 'Delivery times depend on the producer and the destination. Most orders arrive within 2–5 business days, and you will receive updates along the way.',
            },
            {
              q: 'Which areas do you deliver to?',
              a: 'Coverage depends on each producer. You can check availability in the cart before completing checkout.',
            },
            {
              q: 'Are there shipping costs?',
              a: 'Each producer sets their own shipping costs. You will see them clearly before checkout, and some sellers offer free shipping over a minimum amount.',
            },
            {
              q: 'What if my order arrives damaged?',
              a: 'Contact our support team within the timeframe shown on the contact page. We will arrange a refund or a replacement if needed.',
            },
          ],
        },
        {
          category: 'Returns and refunds',
          questions: [
            {
              q: 'Can I return a product?',
              a: 'Fresh food cannot be returned once delivered for hygiene reasons. If something arrives damaged or defective, we will handle a full refund.',
            },
            {
              q: 'What is the refund policy?',
              a: 'If there is an issue with your order, such as damage or a mismatch with the description, contact us within the stated period and we will process a refund or resend.',
            },
            {
              q: 'How long does a refund take?',
              a: 'Refunds are usually processed within 5–10 business days after approval. Your bank may take an extra 2–3 days to reflect the funds.',
            },
          ],
        },
        {
          category: 'Account and security',
          questions: [
            {
              q: 'Is my information secure?',
              a: 'Yes. We use SSL encryption and all transactions are processed through Stripe, which complies with international security standards (PCI DSS).',
            },
            {
              q: 'I forgot my password. How do I recover it?',
              a: 'Go to the sign-in page and click “Forgot your password?”. You will receive an email with instructions to set a new one.',
            },
            {
              q: 'How do I delete my account?',
              a: 'You can request account deletion at any time. Contact support for more details about our data deletion policy.',
            },
          ],
        },
        {
          category: 'Producers',
          questions: [
            {
              q: 'What are the requirements to sell?',
              a: 'You must be a registered producer or farmer in Spain, have a Spanish bank account (IBAN), offer food products with traceable origin, and comply with health regulations.',
            },
            {
              q: 'What commission do you charge?',
              a: `The base platform commission is ${commissionRate} of the sale price. No hidden fees and no monthly subscription.`,
            },
            {
              q: 'When do I receive payouts?',
              a: 'Payouts are issued weekly according to the operating calendar published on the platform.',
            },
            {
              q: 'How do I start selling?',
              a: `Create your producer account, complete the ${BRAND_CLAIMS.verificationProcess.text.toLowerCase()}, connect your bank account, and start uploading products.`,
            },
            {
              q: 'Do you notify new orders via Telegram?',
              a: 'Yes. From your notification preferences you can link your Telegram account and receive instant alerts for new orders, confirmed payments, and incidents. Linking happens through a secure link and you can disconnect it or pick which events to receive at any time.',
            },
            {
              q: 'Can I install Raíz Directa as an app on my phone?',
              a: 'Yes. The platform is an installable app (PWA): from your mobile or tablet browser you can add it to your home screen and open it like a native app, no app store required. It loads fast, uses little data, and updates itself.',
            },
          ],
        },
        {
          category: 'General',
          questions: [
            {
              q: 'How can I contact support?',
              a: 'You can reach us through the website contact form or the email addresses listed on the contact page. We reply during business hours.',
            },
            {
              q: 'Do you offer workshops or experiences?',
              a: 'Not yet, although it is something we would like to explore in the future. Stay tuned for updates.',
            },
          ],
        },
      ],
      ctaTitle: 'Still have questions?',
      ctaBody: 'Our support team is here to help.',
      ctaButton: 'Contact us',
    },
    howItWorks: {
      metadataTitle: 'How it works',
      metadataDescription: 'Learn how Raíz Directa works, from discovering local producers to receiving your order at home.',
      heroTitle: 'How it works',
      heroBody: 'We connect local producers with people who value quality and proximity. No middlemen, no surprises.',
      steps: [
        {
          title: 'Discover local producers',
          description: 'Browse the catalogue and find producers in your region. Review their offers, certifications, and customer feedback.',
        },
        {
          title: 'Choose your products',
          description: 'Pick what you need, adjust quantities, and add everything to your cart. Directly from the producer.',
        },
        {
          title: 'Pay securely',
          description: 'Finish checkout safely with your card. All payments are protected by Stripe.',
        },
        {
          title: 'Receive your order',
          description: 'Each producer prepares and ships their part. You will receive updates as the order moves forward.',
        },
        {
          title: 'Review your experience',
          description: 'Once your order arrives, leave a review. Your feedback helps other buyers and gives producers useful insight.',
        },
      ],
      advantagesTitle: 'Why buy with us',
      advantages: [
        {
          icon: '🌱',
          title: 'Sustainability',
          description: 'Lower your carbon footprint by buying locally. Less transport and fresher food.',
        },
        {
          icon: '💰',
          title: 'Better prices',
          description: 'Without middlemen, more of the value goes to producers while you keep fair prices.',
        },
        {
          icon: '✅',
          title: 'Guaranteed quality',
          description: 'Know who produces your food. Full transparency from origin to delivery.',
        },
        {
          icon: '⭐',
          title: 'Real reviews',
          description: 'Read verified customer experiences and shop with more confidence.',
        },
        {
          icon: '🚚',
          title: 'Fast delivery',
          description: 'Receive fresh products in days rather than weeks, with live order updates.',
        },
        {
          icon: '🤝',
          title: 'Local impact',
          description: 'Every purchase supports nearby producers and strengthens local communities.',
        },
      ],
      ctaTitle: 'Ready to start?',
      ctaBody: 'Explore the catalogue and discover trusted local producers.',
      ctaProducts: 'Browse products',
      ctaProducers: 'Meet producers',
    },
    aboutUs: {
      metadataTitle: 'About us',
      metadataDescription: 'Learn the story behind Raíz Directa, the marketplace connecting local producers with conscious consumers.',
      heroTitle: 'About Raíz Directa',
      heroBody: 'A Spanish platform built to connect local agricultural producers with people who care about quality, sustainability, and proximity.',
      missionTitle: 'Our mission',
      missionBody1: 'We remove unnecessary middlemen between producers and consumers. Direct selling benefits everyone: producers earn fairer prices, shoppers gain access to fresher local food, and the environment benefits from shorter transport routes.',
      missionBody2: 'Every order placed on Raíz Directa is a direct show of support for local farming and more sustainable food systems.',
      missionQuote: '“We connect producers and consumers without unnecessary middlemen.”',
      valuesTitle: 'Our values',
      values: [
        {
          icon: '🌱',
          title: 'Sustainability',
          description: 'We back responsible farming practices and work to reduce environmental impact.',
        },
        {
          icon: '💪',
          title: 'Empowerment',
          description: 'We help small producers reach customers directly and grow on their own terms.',
        },
        {
          icon: '🤝',
          title: 'Trust',
          description: 'Transparent pricing, clear origin information, and honest product quality.',
        },
        {
          icon: '⚡',
          title: 'Efficiency',
          description: 'Simple, accessible technology that makes direct selling easier.',
        },
        {
          icon: '❤️',
          title: 'Quality',
          description: 'We care about fresh products and a consistently high standard.',
        },
        {
          icon: '🏠',
          title: 'Community',
          description: 'We strengthen local ties and support the nearby economy.',
        },
      ],
      storyTitle: 'Our story',
      storyParagraphs: [
        'Raíz Directa started with a simple belief: there had to be a better way to sell local food. We saw middlemen taking most of the margin while neither producers nor customers felt fully served.',
        'So we built a platform that is simple, transparent, and easy to use, helping producers sell directly to consumers without unnecessary layers or friction.',
        'Today we connect producers with shoppers who value sustainable local agriculture. Every purchase is a vote of confidence in that model.',
        'We keep improving the product to make life easier for both producers and buyers, because when the process is simpler, everyone wins.',
      ],
      principles: [
        {
          title: 'Transparency',
          text: 'We show the operational and commercial information people need to make confident decisions.',
        },
        {
          title: 'Proximity',
          text: 'We bring buyers and producers together without unnecessary layers in between.',
        },
        {
          title: 'Continuous improvement',
          text: 'We improve the product based on real feedback, not vanity metrics.',
        },
      ],
      ctaTitle: 'Join our community',
      ctaBody: 'Whether you buy or sell, become part of the move toward more local and sustainable food.',
      ctaProducts: 'Discover products',
      ctaSell: 'Sell with us',
    },
    sell: {
      metadataTitle: 'Sell your products',
      metadataDescription: 'Join Raíz Directa and sell directly to local customers with weekly payouts and simple management tools.',
      heroTitle: 'Sell your products directly',
      heroBody: 'Join our marketplace for local producers and sell straight to end customers. On Raíz Directa, you stay in control of your pricing.',
      heroPrimaryCta: 'Start selling for free',
      heroSecondaryCta: 'See how it works',
      whyTitle: 'Why Raíz Directa?',
      whyBody: 'Six clear reasons to sell with a simple workflow, no monthly fees, and transparent operating rules.',
      benefits: [
        {
          title: 'Earn more from your work',
          description: `Without middlemen, you set the price. Base platform commission: ${commissionRate} per sale.`,
        },
        {
          title: 'Manage your stock',
          description: 'Track products and availability in real time from your dashboard.',
        },
        {
          title: 'Weekly scheduled payouts',
          description: 'Receive weekly settlements according to the published operating calendar.',
        },
        {
          title: 'Nationwide reach',
          description: 'Reach buyers across the country based on each producer’s shipping coverage.',
        },
        {
          title: 'Built-in support',
          description: 'Our team is available to help with questions and operational issues.',
        },
        {
          title: 'No monthly fees',
          description: 'You only pay commission when you sell. Zero fixed costs.',
        },
      ],
      toolsTitle: 'Tools that make the difference',
      toolsBody: 'Technology built for producers: know about every sale the moment it happens and work from anywhere, even on a patchy connection.',
      tools: [
        {
          title: 'Instant Telegram alerts',
          description: 'Link your Telegram account and get notified the moment an order comes in. No refreshing the dashboard, no checking email.',
          bullets: [
            'Alerts for new orders, confirmed payments, and incidents.',
            'Choose which events you want to receive from your preferences.',
            'Connect in seconds with a secure link; disconnect any time.',
          ],
        },
        {
          title: 'Installable mobile app (PWA)',
          description: 'Raíz Directa installs on your phone or tablet like a native app, no app store required. Fast, lightweight, and ready for day-to-day use.',
          bullets: [
            'Home-screen icon and full-screen mode, no browser bar.',
            'Fast loading and low data use, even on unstable connections.',
            'Automatic updates: always on the latest version, no reinstall.',
          ],
        },
      ],
      pricingTitle: 'Pricing and commission',
      pricingBody: 'Fair and transparent. You only pay when you make a sale.',
      pricingLabel: 'Platform commission:',
      pricingExample: 'Example',
      pricingSellFor: 'You sell one product for',
      pricingCommission: `Commission ${commissionRate}`,
      pricingYouReceive: 'You receive',
      pricingFootnote: 'No monthly fees. No hidden costs.',
      stepsTitle: 'Simple as that. 6 steps.',
      steps: [
        {
          title: 'Sign up for free',
          desc: 'No joining fee and no card details required.',
        },
        {
          title: 'Quick verification',
          desc: 'Our team reviews your application in the next operating cycle.',
        },
        {
          title: 'Set up payouts',
          desc: 'Connect your bank account securely through Stripe Connect.',
        },
        {
          title: 'Publish products',
          desc: 'Upload photos, pricing, stock, and descriptions for your catalogue.',
        },
        {
          title: 'Receive orders',
          desc: 'Get notified about new sales and manage shipping from your dashboard.',
        },
        {
          title: 'Get paid with confidence',
          desc: 'Automatic weekly settlements keep your cash flow predictable.',
        },
      ],
      requirementsTitle: 'Requirements to join',
      requirements: [
        'Be a registered producer or farmer in Spain.',
        'Have a Spanish bank account (IBAN) for payouts.',
        'Offer food products with traceable origin.',
        'Comply with the applicable health regulations.',
      ],
      ctaTitle: 'Ready to get started?',
      ctaBody: 'Create your account today with no commitment. Applications are reviewed through the published manual process.',
      ctaPrimary: 'Create producer account',
      ctaFootnotePrefix: 'Questions? Check our',
      ctaFootnoteJoiner: 'or',
      ctaFootnoteFaq: 'FAQ',
      ctaFootnoteContact: 'contact page',
    },
  },
}

export function getPublicPageCopy(locale: Locale): PublicPageCopy {
  return publicPageCopy[locale]
}
