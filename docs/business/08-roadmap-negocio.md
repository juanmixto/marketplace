# 08 — Roadmap de negocio

> Roadmap **de negocio**, no de ingeniería. Lo que pretendemos validar / habilitar como compañía.
> Decisiones cerradas viven en `09-decisiones-estrategicas.md`. Aquí están las **apuestas pendientes** y las **fases**.

## Filosofía del roadmap

- Cada fase responde a **una pregunta de validación**. Si la pregunta no se responde, no avanzamos.
- Cada fase tiene **criterio de salida medible**. Sin criterio cumplido, no se pasa a la siguiente.
- Saltarse fases para "ir más rápido" es la forma más fiable de fundir el proyecto.

---

## Fase 0 — Preparación (semanas 1–4)

**Pregunta de validación**: ¿podemos arrancar con calidad o necesitamos resolver bloqueantes antes?

### Objetivos
- Definir vertical, categorías iniciales y promesa.
- Web mínima viable funcionando (catálogo + ficha + checkout móvil).
- Stripe operativo con dropshipping.
- Operaciones internas: panel de admin, ingestión de pedidos, notificación al productor.
- Plantillas legales (condiciones, privacidad, devoluciones).
- Identidad visual mínima (logo, paleta, tipografía).
- Scripts de outreach y panel de candidatos a productores.

### Criterios de salida (todo)
- [ ] Checkout móvil completo, probado en dispositivo real, sin registro obligatorio.
- [ ] Stripe en modo live + dropshipping documentado.
- [ ] Panel de admin operativo: ver pedido, marcar enviado, gestionar devolución.
- [ ] Plantillas de email transaccional listas (confirmación, envío, devolución).
- [ ] 60+ candidatos a productor identificados, cribados.
- [ ] Plantillas de contacto a productor preparadas (`07-copy-contacto-productores.md`).
- [ ] Política de devoluciones publicada en el sitio.
- [ ] Política de envíos publicada en el sitio.
- [ ] Una página "Sobre nosotros" honesta (quiénes, qué, por qué).

### Métrica clave
- Ninguna de venta. Solo bloqueantes resueltos.

### Riesgos en Fase 0
- **Sobreingeniería**: añadir features que no son necesarias para vender (recomendador, búsqueda avanzada, etc.). Cortar a la mitad.
- **Identidad visual eterna**: gastar 6 semanas en logo. Cerrar en una semana, refinar luego.

---

## Fase 1 — Selección de productores (semanas 4–10)

**Pregunta de validación**: ¿podemos cerrar productores buenos a comisión 20–30 % en plazo razonable?

### Objetivos
- Cerrar 6–12 productores en las 3 categorías ancla (aceite, queso, miel).
- Confirmar capacidad de cumplimiento de cada uno con envío de prueba.
- Recoger datos fiscales, bancarios, de envío.
- Generar fotos / contenido mínimo para 20–40 SKUs.

### Criterios de salida (todo)
- [ ] ≥ 6 productores firmados (mínimo 2 por categoría).
- [ ] ≥ 1 envío de prueba por productor → embalaje validado.
- [ ] Comisión pactada y por escrito por productor.
- [ ] Fotos y copy mínimos para 20+ SKUs.
- [ ] 3+ historias editoriales redactadas (post largo por productor).

### Métrica clave
- Tasa de respuesta a outreach: ≥ 25 %.
- Tasa de cierre tras llamada: ≥ 50 %.
- Productor "alta a publicado" en mediana ≤ 3 semanas.

### Riesgos en Fase 1
- **Cerrar productores flojos por presión de tener catálogo**. Mejor 4 buenos que 12 mediocres.
- **Negociar comisiones por debajo del rango**: presión a la baja desde el productor estrella. Mantener mínimo 20 %.
- **Onboarding eterno**: productor en alta 6+ semanas. Decisión binaria a las 6 semanas: publicar o pausar.

---

## Fase 2 — Catálogo mínimo (semanas 8–14, solapa con Fase 1)

**Pregunta de validación**: ¿el catálogo es defendible para un comprador frío?

### Objetivos
- 20–40 SKUs publicados con ficha completa.
- 3 packs ancla disponibles.
- Páginas de productor publicadas (perfil largo).
- Web funcionando en producción con tráfico cero.
- 5–10 envíos de prueba reales (a equipo y círculo cercano) extremo a extremo.

### Criterios de salida (todo)
- [ ] 20+ SKUs publicados sin placeholders.
- [ ] 3 packs publicados (uno por categoría).
- [ ] Cada productor tiene página propia con foto + historia + producto.
- [ ] Auditoría móvil: todas las fichas pasan checklist de `docs/product/04-prioridades-ux-mobile.md`.
- [ ] 5+ pedidos de prueba ejecutados extremo a extremo, problemas listados y resueltos.
- [ ] Tiempo medio de checkout móvil < 90 segundos en envío de prueba.

### Métrica clave
- Conversión móvil ficha → carrito en sesión interna ≥ 8 %.
- 0 pedidos con incidencia bloqueante en envíos de prueba.

### Riesgos en Fase 2
- **Publicar en estado "casi listo"**. Mejor menos SKUs y todos completos.
- **Saltarse envíos de prueba**: el primer comprador real descubre los bugs operativos. No.

---

## Fase 3 — Primeras ventas (semanas 12–22)

**Pregunta de validación**: ¿hay demanda real al precio que ofrecemos, en el comprador frío?

### Objetivos
- Soft launch: web pública, sin paid.
- Activar canales de growth orgánicos (productores, contenido, newsletter).
- 50–100 pedidos reales a comprador desconocido (no equipo).
- Detectar y arreglar fricciones reales (no hipotéticas).

### Criterios de salida (todo)
- [ ] ≥ 50 pedidos completados extremo a extremo a compradores no del círculo cercano.
- [ ] Conversión móvil ficha → compra ≥ 3 % (objetivo: subir a ≥ 5 % al final).
- [ ] Tasa de incidencia operativa < 10 % de pedidos.
- [ ] NPS / satisfacción inicial ≥ 40 (proxy con encuesta corta post-pedido).
- [ ] ≥ 1 productor con 10+ pedidos sostenido durante 4 semanas.

### Métrica clave
- Pedidos / semana al final de la fase: 15–30.
- Concentración por productor: ningún productor > 50 % de pedidos.
- Repetición a 60 días: medida y reportada (sin objetivo todavía, solo tener el número).

### Riesgos en Fase 3
- **Falsos positivos por pedidos de amigos**: distinguir compras del círculo cercano del comprador frío. Etiquetar internamente.
- **Optimizar antes de tener volumen**: no cambiar UX cada semana basándose en 5 pedidos. Esperar muestras razonables.
- **Vendor concentration**: si un productor concentra > 60 %, no es validación de marketplace, es validación de un productor.

---

## Fase 4 — Optimización (semanas 22–36)

**Pregunta de validación**: ¿podemos mejorar conversión y repetición lo suficiente para abrir el grifo?

### Objetivos
- Iterar sobre fricciones detectadas en Fase 3.
- Mejorar contenido editorial y SEO.
- Construir hábito en compradores recurrentes (newsletter, lanzamientos).
- Probar 1–2 micro-experimentos de canal (collab con creador concreto, prensa nicho).
- Cerrar 4–8 productores adicionales (controlado).

### Criterios de salida (todo)
- [ ] Conversión móvil ficha → compra ≥ 5 % sostenido 4 semanas.
- [ ] Repetición a 90 días ≥ 15 %.
- [ ] AOV ≥ 30 € sostenido.
- [ ] Pedidos / semana 40–80 sostenido.
- [ ] ≥ 70 % de productores activos (≥ 1 pedido / mes).
- [ ] Margen unitario positivo tras devoluciones e incidencias.

### Métrica clave
- Tasa de incidencia logística por productor: ≤ 8 %.
- Tasa de devolución total: ≤ 5 %.
- Tiempo medio de envío real ≤ 5 días laborables en mediana.

### Riesgos en Fase 4
- **Empezar paid antes de tiempo**. Si no hay conversión orgánica > umbral, paid amplifica el problema.
- **Crecer en productores cuando el problema es conversión**: añadir SKUs no resuelve un funnel roto.
- **Cambiar el modelo** (centralizar logística, abrir suscripciones) por aburrimiento o ego antes de validar lo actual.

---

## Fase 5 — Escalar (mes 9 en adelante)

**Pregunta de validación**: ¿podemos crecer manteniendo unidad económica positiva y curaduría?

### Objetivos
- Activar paid acquisition con CAC controlado.
- Abrir 1 categoría adicional (siempre y cuando tengamos hueco operativo).
- Replantear consolidación logística parcial si las métricas lo justifican (ver `05-logistica-operaciones.md`).
- Equipo: primer hire dedicado a operaciones / atención al cliente si volumen lo justifica.
- Considerar suscripción / club / cajas como **experimento**, no apuesta.

### Criterios de salida (todo)
- [ ] Pedidos / mes ≥ 500 sostenido.
- [ ] CAC blended < 30 % AOV.
- [ ] Margen contribución positivo a nivel pedido tras todos los costes (incluida atención).
- [ ] Repetición a 90 días ≥ 25 %.
- [ ] Equipo capaz de absorber 2× el volumen actual sin colapso.

### Métrica clave
- Crecimiento mensual de pedidos ≥ 15 % con CAC controlado.
- LTV / CAC > 3.
- Vendor concentration: ningún productor > 25 % de pedidos.

### Riesgos en Fase 5
- **Crecer en GMV sacrificando curaduría**: subir SKUs flojos para alimentar paid.
- **Geografía**: abrir Portugal / Francia "porque toca". Cada país es otro proyecto.
- **Diversificación de modelos**: lanzar suscripción, B2B, marca propia simultáneamente. Foco en uno.

---

## Apuestas en cola (sin compromiso de fecha)

Movemos cosas a Fase 5+ solo cuando una métrica observada lo justifica:

- Página de productor enriquecida (vídeo, mapa, "del campo a tu casa").
- Sistema de reviews moderado (no abrir hasta tener volumen estable y atención robusta).
- Wishlist / favoritos.
- Recomendador / "también te puede interesar".
- Búsqueda avanzada / filtros.
- Programa de afiliados / referidos.
- App nativa (iOS/Android).
- Suscripciones (cajas mensuales, club).
- Multi-país / multi-currency.
- B2B / venta a tiendas físicas / horeca.
- Personalización del catálogo por usuario.
- Marketplace de servicios (catas, experiencias).

Cada uno entra a "Próximo" solo si pasa los 4 criterios de feature de `/AGENTS.md`. Mientras no pase, **no se construye**.

---

## Descartado (a menos que cambie algo grande)

- Marketplace propio (compra-stock-revende). Cambia el modelo entero.
- Agregador masivo de productos. Rompe la curaduría.
- Marketplace de servicios (no físicos). Otra empresa, otra UX.
- Funcionalidad social / feed / followers. No estamos en ese juego.
- Programa de loyalty con puntos. Compra el discurso, no el comportamiento.

---

## Cómo se mueve algo de "Cola" a "Próximo"

- Una métrica observada lo justifica (no una opinión).
- Hay capacidad de equipo libre **después** de mantener la fase actual verde.
- El coste de la versión más pequeña posible cabe en ≤ 1 PR.
- Pasa por `09-decisiones-estrategicas.md` con hipótesis explícita y criterio de éxito.

---

## Frecuencia de revisión

- **Semanal**: estado de la fase actual (qué está bloqueando criterios de salida).
- **Mensual**: revisión de métricas vs objetivos.
- **Trimestral**: revisión de fase y replanteo de fases siguientes.
