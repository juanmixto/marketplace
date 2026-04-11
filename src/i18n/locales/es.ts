const es = {
  /* Navigation */
  categories: 'Categorías',
  producers: 'Productores',
  producer_portal: 'Portal productor',
  search_placeholder: 'Buscar productos, productores...',
  search_placeholder_short: 'Buscar...',
  my_account: 'Mi cuenta',
  my_orders: 'Mis pedidos',
  login: 'Entrar',
  register: 'Registrarse',
  open_menu: 'Abrir menú',
  close_menu: 'Cerrar menú',
  cart: 'Ver carrito',
  cart_items_one: '1 artículo',
  cart_items_other: '{count} artículos',

  /* Category names */
  cat_verduras: 'Verduras y Hortalizas',
  cat_frutas: 'Frutas',
  cat_lacteos: 'Lácteos y Huevos',
  cat_carnicos: 'Cárnicos',
  cat_aceites: 'Aceites y Conservas',
  cat_panaderia: 'Panadería y Repostería',
  cat_vinos: 'Vinos y Bebidas',
  cat_miel: 'Miel y Mermeladas',

  /* Footer */
  footer_buy: 'Comprar',
  footer_sell: 'Vender',
  footer_help: 'Ayuda',
  all_products: 'Todos los productos',
  ecological: 'Ecológico',
  km0: 'Km0',
  become_producer: 'Hazte productor',
  how_it_works: 'Cómo funciona',
  why_sell: 'Por qué vender con nosotros',
  faq: 'Preguntas frecuentes',
  contact: 'Contacto',
  about_us: 'Sobre nosotros',
  support: 'Soporte',
  footer_tagline: 'Conectamos pequeños productores con consumidores que valoran la calidad y la proximidad.',
  footer_rights: 'Todos los derechos reservados.',
  legal_notice: 'Aviso legal',
  privacy: 'Privacidad',
  cookies: 'Cookies',
  terms: 'Términos',

  /* Language switcher */
  language: 'Idioma',
  lang_es: 'Español',
  lang_en: 'English',
} as const

export default es
export type TranslationKeys = keyof typeof es
