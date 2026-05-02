---
summary: Hipótesis de partida y plan de adquisición orgánica. Sin paid acquisition antes de validar conversión (ADR-004).
audience: agents,humans
read_when: proponer canales de adquisición o experimentos de growth
---

# 06 — Growth y lanzamiento

## Hipótesis de partida

El cuello de botella **no** es tráfico. Es **conversión en frío** y **catálogo defendible**. Si no convertimos a un visitante interesado, traer más visitantes solo amplifica el problema.

Por eso el orden de growth es:

1. Catálogo digno → 2. Ficha que convierte en móvil → 3. Tracción inicial controlada → 4. Crecer canal a canal con datos.

Saltar el paso 1 o 2 quema dinero.

## Cómo conseguir los primeros productores

> El productor primero, el comprador después. Un productor sólido convence al siguiente; un catálogo flojo no convence a nadie.

### Fases del reclutamiento

**Fase A — Lista larga (semanas 1–3)**
- Construir lista de 60–100 candidatos por categoría (180–300 total entre las 3 categorías iniciales).
- Fuentes:
  - Investigación manual: ferias, mercados, prensa, blogs verticales (Cocina y Vino, Vinetur, Mercacei, sectorial regional, etc.).
  - **Google Maps** + búsqueda "almazara artesanal [provincia]", "quesería artesana [provincia]", "miel artesana [provincia]".
  - **Instagram** y TikTok: hashtags + ubicación. Filtrar por feed real, no estética.
  - Asociaciones y denominaciones (cuando aplique).
  - **Telegram**: pipeline de descubrimiento del repo (ver `docs/ingestion/telegram.md`).

**Fase B — Cribado (semanas 2–4)**
- Para cada candidato: aplicar señales positivas / riesgo de `02-productores-ideales.md`.
- Convertir lista larga en **lista corta de 15–25 candidatos por categoría** que pasan cribado.

**Fase C — Outreach (semanas 3–6)**
- Contactar a la lista corta con plantillas de `07-copy-contacto-productores.md`.
- Cadencia: 3 mensajes (inicial + 2 seguimientos) repartidos en 3–4 semanas.
- Tasa de respuesta esperada: 25–40 %. Tasa de conversión a llamada: 50 % de los que responden. Tasa de cierre tras llamada: 60–70 %.
- Producción esperada: ~3–6 productores cerrados por categoría → 9–18 productores totales.

**Fase D — Onboarding (semanas 4–8)**
- Sesión de fotos / contenido + redacción de fichas + envío de prueba + publicación.
- 1–2 semanas por productor con paralelismo.

**Total: cero a primeros productores publicados ≈ 6–8 semanas**, asumiendo equipo dedicado.

### Palancas que aceleran el "sí" del productor

- **Cero coste para el productor**: solo comisión por pedido. Eliminar fricción inicial.
- **Mostramos web ya hecha**: el productor ve la maqueta o la web real con otros productores ya publicados, no una promesa.
- **Storytelling editorial**: ofrecemos hacer su ficha + un post largo sobre él. Atrae especialmente a productores con poca presencia digital.
- **Foto profesional incluida** (en parte de los casos): coste para el marketplace, valor enorme para el productor.
- **Sesgo de pertenencia**: si ya hay 4–5 productores creíbles, el siguiente entra mucho más rápido. Por eso los **primeros 3 son los más importantes y los más caros de cerrar**.

### Anti-palancas (lo que no hacemos para cerrar productores)

- No comprometer plazos de plataforma ("la semana que viene tendremos X").
- No prometer volumen específico de pedidos.
- No ofrecer exclusividad cuando lo piden, salvo casos muy excepcionales documentados como ADR.
- No bajar comisión por debajo de 20 % "para cerrar al cliente".

## Cómo conseguir los primeros compradores

### Modo soft launch

- URL pública, **sin campañas pagadas**.
- Productores invitan a su propia audiencia (Instagram, lista de email, mercados, clientes recurrentes).
- El equipo invita en círculo cercano, **no para venderles**, sino para detectar fricciones reales.
- Objetivo en soft launch: **50–100 pedidos reales** observados extremo a extremo antes de hablar de scaling.

### Canales iniciales (por orden de coste y capacidad)

| # | Canal | Coste | Capacidad esperada |
|---|---|---|---|
| 1 | **Audiencia de los productores** (DM, story, lista) | 0 € | Alta calidad, primer pedido en días |
| 2 | **Boca a boca / referidos del primer círculo** | 0 € | Volumen bajo pero alta conversión |
| 3 | **Contenido editorial** (post largo por productor, SEO long-tail) | Tiempo del equipo | Slow start, payoff en 2–6 meses |
| 4 | **Instagram del marketplace**, reposteando contenido de productores | Tiempo del equipo | Awareness, conversión modesta |
| 5 | **Newsletter** propia (suscripción opcional, semanal o quincenal) | Tiempo + herramienta | Compounding alto si la lista crece |
| 6 | **Prensa especializada / nichos** (revistas, podcasts, blogs gastronómicos) | Tiempo de pitch | Picos de tráfico cuando salen |
| 7 | **Colaboraciones con creadores** afines (foodies serios, no influencers genéricos) | Producto regalado + tiempo | Conversión alta si el creador encaja |
| 8 | **SEO por categoría + producto** | Tiempo + contenido | Compounding largo plazo |
| 9 | **Paid (Meta / Google)** | €€€ | **Descartado hasta validar conversión orgánica** |

### Contenido (qué publicamos y dónde)

**Tipos de pieza prioritarios**:

| Pieza | Objetivo | Frecuencia inicial |
|---|---|---|
| **Ficha de producto bien hecha** | Conversión + SEO long-tail | Cada SKU nuevo |
| **Página de productor** (perfil largo) | Confianza + SEO | Una por productor |
| **Post largo "Conociendo a [Productor]"** | Editorial + SEO + RRSS | 1 al mes inicial |
| **Reel / vídeo corto del proceso** (con el productor) | Instagram + TikTok | 2 al mes inicial |
| **Newsletter quincenal** ("Lo nuevo del mes") | Recurrencia + retención | Cada 2 semanas |
| **Carrousel educativo** ("Cómo elegir un AOVE") | Awareness + autoridad | 1 al mes |

**Lo que NO hacemos en contenido**:
- Reels genéricos sin productor real.
- Recetas sin ángulo del marketplace.
- Compras de seguidores o engagement falso.
- Concursos masivos de "etiqueta a 3 amigos".

### SEO inicial

**Modelo SEO**: long-tail por intent, no head terms.

**Head terms (NO competimos)**:
- "aceite de oliva", "queso", "miel" → ocupados por marketplaces gigantes y grandes marcas. Caro y poco diferencial.

**Long-tail que sí trabajamos**:
- "aceite de oliva picual cosecha temprana 2025"
- "queso de oveja de [región concreta]"
- "miel de romero [zona] sin pasteurizar"
- "regalo gourmet aceite y queso artesano"
- "[productor concreto] online"

**Activos SEO mínimos al inicio**:
- Sitemap.xml limpio.
- Schema.org Product en cada ficha.
- Open Graph / Twitter cards correctos.
- Velocidad móvil (LCP, CLS, INP) en verde — no negociable.
- URLs limpias y estables.
- **Páginas de productor indexables** y con contenido único (no plantilla).

### Storytelling como palanca de growth

El producto artesanal **se compra por la historia**, no por specs. La historia es:
- **Persona** identificable.
- **Lugar** concreto.
- **Proceso** que el comprador puede imaginar.
- **Detalle** que solo conoce alguien que ha estado allí.

Cada producto y cada productor entra al catálogo con una pieza editorial mínima. Esa pieza es contenido reutilizable para newsletter, RRSS, prensa.

### Estrategia de confianza (lo que mueve la conversión en frío)

| Señal | Dónde se ve |
|---|---|
| Foto real del productor en su entorno | Ficha de producto + página de productor |
| Origen geográfico concreto | Ficha (no solo "España") |
| Política de envío y devolución clara | Footer + ficha + checkout |
| Plazos explícitos | Ficha + checkout |
| Atención humana (nombre, foto, canal de contacto) | Footer + páginas estáticas |
| Press / menciones (cuando aparezcan) | Footer + página "sobre nosotros" |
| Reseñas de compradores reales (cuando haya volumen) | Ficha + página de productor |
| HTTPS + dominio limpio + sin popups agresivos | Toda la web |

**Cero**:
- Insignias de "compra segura" gigantes (huelen a cutre).
- "Más de 10.000 clientes satisfechos" sin volumen real.
- Reseñas de Trustpilot pagadas o falsas.

## Reglas de growth en esta etapa

- **No se invierte en paid antes de validar conversión orgánica.**
- **No se promete a productor un volumen** que no podemos garantizar.
- **No se hacen descuentos generalizados** — destruyen percepción de calidad. Excepción: pack con descuento explícito.
- **No se hace "1+1 gratis" ni códigos masivos**. Si hay código, es nominativo y rastreable.
- **No copiamos la estética de Amazon**: ni "antes/ahora", ni urgencia falsa, ni cuentas atrás.
- Si una palanca funciona y es repetible, se documenta en `08-roadmap-negocio.md` con número de pedidos atribuibles.

## Señales de que es momento de "abrir el grifo" (pasar de soft launch a paid)

Pasamos de soft launch a growth activo cuando **todas** se cumplen durante ≥ 4 semanas sostenidas:

- ≥ X pedidos / semana sostenidos.
- Conversión móvil ficha → compra > X %.
- ≥ Y % de compradores repiten en 90 días.
- ≥ Z productores con > N pedidos cada uno (no concentración en uno solo).
- Atención al cliente puede atender el volumen actual sin colapso.
- Margen de comisión efectiva real > umbral mínimo (no perdemos dinero por pedido).

> Los umbrales concretos (X, Y, Z, N) viven en Notion / hoja de cálculo, no aquí. Se revisan trimestralmente.

Hasta entonces, growth = **curaduría + arreglar fricciones**, no campañas.

## Métricas de growth

| Métrica | Frecuencia | Objetivo en mes 6 |
|---|---|---|
| Visitas únicas mensuales | Semanal | 5–15 k |
| Conversión móvil ficha → carrito | Semanal | ≥ 6 % |
| Conversión móvil carrito → pago | Semanal | ≥ 50 % |
| Pedidos completados / mes | Semanal | 150–300 |
| Ticket medio | Semanal | ≥ 30 € |
| % pedidos repetidos en 90 días | Mensual | ≥ 15 % |
| Suscriptores de newsletter | Mensual | 500–2 000 |
| Productores activos (≥ 1 pedido / mes) | Mensual | ≥ 80 % de los publicados |
| CAC blended (cuando aplique) | Mensual | < 30 % del AOV |

Métricas en revisión continua. Si una se queda flat 6 semanas, se investiga la causa raíz antes de tocar otra cosa.
