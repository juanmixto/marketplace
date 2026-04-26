# 10 — Backlog de lanzamiento

> Backlog **vivo** con épicas e issues propuestos para llevar el marketplace de "documentación + plataforma técnica" a "vendiendo a comprador frío".
>
> Este documento no es contrato cerrado: se filtra, se poda y se convierte en issues reales en GitHub solo tras revisión humana. Generado a partir de `docs/business/01–05` y `docs/product/02–04` aplicando los 4 criterios de feature de `/AGENTS.md`.
>
> Alineado con Fases 1–3 de `08-roadmap-negocio.md`.

## Cómo leer este documento

- **Épicas (E1–E7)** agrupan issues por pregunta de validación.
- Cada **issue** tiene los 10 campos del formato definido en `prompts/create-github-issues.md`.
- Las **decisiones de negocio detectadas** durante el armado están en `09-decisiones-estrategicas.md` § "Decisiones pendientes" (PEND-001 a PEND-004).
- El orden de ejecución y los **top 5 antes de producción** están al final.

## Convenciones de prioridad

| Etiqueta | Significado |
|---|---|
| **P0** | Sin esto no se puede vender. Bloquea producción. |
| **P1** | Sin esto se vende mal o se vende y se pierde al cliente. |
| **P2** | Papel de lija, deuda visible. |
| **P3** | Anotado, sin compromiso pre-lanzamiento. |

## Reglas que aplican a este backlog

- Priorizar **impacto en ventas** sobre cualquier otra dimensión.
- Evitar sobreingeniería: cada issue debe pasar los 4 criterios de `/AGENTS.md`.
- Pensar en **lanzamiento inicial**, no en escala futura.
- **No dashboards complejos** sin ventas que justificarlos.
- **No ampliar catálogo masivamente** — `03-productos-iniciales.md` define el listón.
- Cada issue es **ejecutable de forma clara**, no agenda abierta.

---

## 1. Lista de épicas

| # | Épica | Pregunta que responde | Fase |
|---|---|---|---|
| **E1** | Oferta inicial curada | ¿Tenemos 20–40 SKUs publicables sin placeholders? | 1–2 |
| **E2** | Confianza en productor | ¿Un comprador frío entiende quién hace esto en 10 s? | 2 |
| **E3** | Conversión móvil | ¿Un comprador móvil llega del aterrizaje al pago sin fricción? | 2–3 |
| **E4** | Packs y ticket medio | ¿Sostenemos AOV ≥ 30 € con 3 packs ancla? | 3 |
| **E5** | Onboarding de productores | ¿Podemos pasar un productor de "sí" a publicado en ≤ 3 semanas? | 1 |
| **E6** | Operativa mínima de pedidos | ¿Un pedido extremo a extremo llega bien sin caos manual? | 0–3 |
| **E7** | Medición de validación inicial | ¿Sabremos si funciona o no en 4 semanas de soft launch? | 2–3 |

---

## 2. Issues hijos por épica

### Épica 1 — Oferta inicial curada

#### E1-01 — Cerrar 6 productores ancla en las 3 categorías iniciales

- **Problema**: Hoy no hay productores firmados; sin productores no hay catálogo, sin catálogo no hay validación posible.
- **Objetivo**: 6 productores con contrato cerrado (mínimo 2 por categoría: AOVE, queso semi/curado, miel cruda).
- **Contexto**: `02-productores-ideales.md` define perfil; `07-copy-contacto-productores.md` define plantillas. Cierre estimado: ~8 semanas según funnel esperado en `06-growth-lanzamiento.md`.
- **Tareas**:
  1. Construir lista corta de 60 candidatos (20 por categoría) aplicando señales de `02-productores-ideales.md`.
  2. Ejecutar outreach con plantillas de `07-` (3 mensajes max, cadencia 3–4 semanas).
  3. Hacer 8–12 llamadas de 15–20 min con candidatos respondedores.
  4. Negociar comisión dentro del rango 20–30 % con razón documentada por productor.
  5. Recoger NIF, datos bancarios, registros sanitarios si aplica, capacidad declarada.
- **Criterios de aceptación**:
  - [ ] 6+ productores con condiciones firmadas (mínimo 2/categoría).
  - [ ] Cada productor tiene ficha interna con: comisión, capacidad, plazo SLA.
  - [ ] Cero productores con perfil "NO meter al inicio" de `02-`.
- **Métricas afectadas**: nº productores activos; tasa de respuesta a outreach; tasa de cierre tras llamada.
- **Riesgos**: cerrar productores flojos por presión de tener catálogo (mitigación: criterios duros de `02-`); negociación por debajo del 20 % (mitigación: regla en `04-`).
- **Prioridad**: **P0**
- **Dependencias**: PEND-003 (comisión por defecto).
- **Etiquetas**: `area:vendor`, `type:business`, `priority:P0`

#### E1-02 — Publicar 20–30 SKUs iniciales sin placeholders

- **Problema**: Aunque tengamos productores, no hay catálogo público hasta que cada SKU pase los criterios de `03-productos-iniciales.md`.
- **Objetivo**: 20–30 fichas en producción con foto + copy + stock confirmado.
- **Contexto**: 6 criterios duros + criterios logísticos + criterios de margen + storytelling en `03-`.
- **Tareas**:
  1. Por productor: definir 3–5 SKUs ancla (formatos según `03-` § 3.1–3.3).
  2. Sesión de fotos (propia o validar las del productor contra listón mínimo).
  3. Redactar copy 120–180 palabras siguiendo plantilla de storytelling de `03-`.
  4. Calcular PVP: `coste + margen productor + comisión + envío`. Si no encaja, replantear formato (gramaje, packaging) antes de publicar.
  5. Confirmar stock + plazo + política devolución del productor.
- **Criterios de aceptación**:
  - [ ] 20+ SKUs publicados, ninguno con placeholder.
  - [ ] Cada SKU pasa los 6 filtros de `03-`.
  - [ ] Cada SKU tiene 3+ fotos, una en uso/contexto.
  - [ ] PVP coherente con rango de la categoría.
- **Métricas afectadas**: nº SKUs publicados; ticket medio objetivo por categoría.
- **Riesgos**: publicar "casi listo" para llenar catálogo (mitigación: regla cero placeholders); foto mediocre que mata conversión (mitigación: listón mínimo de fotografía documentado antes de empezar).
- **Prioridad**: **P0**
- **Dependencias**: E1-01.
- **Etiquetas**: `area:catalog`, `type:content`, `priority:P0`

#### E1-03 — Envío de prueba por productor antes de publicar

- **Problema**: Sin envío real, descubriremos los problemas operativos con el primer comprador. Inaceptable.
- **Objetivo**: 1 envío de prueba por productor a dirección del equipo, con embalaje validado y plazos reales medidos.
- **Contexto**: `05-logistica-operaciones.md` § Packaging y SLA; mitiga riesgos de dropshipping antes de exponer al cliente final.
- **Tareas**:
  1. Hacer pedido real (con pago real) a cada productor a dirección del equipo.
  2. Cronometrar: notificación → confirmación → envío → entrega.
  3. Inspeccionar embalaje contra estándar mínimo de `05-`.
  4. Anotar incidencias y devolverlas al productor con plan de mejora si las hay.
  5. Validar tarjeta del marketplace incluida en el paquete.
- **Criterios de aceptación**:
  - [ ] 1 envío de prueba completado por productor.
  - [ ] Plazo real ≤ 5 días laborables documentado.
  - [ ] Embalaje cumple estándar.
  - [ ] Productor con plazo real > 7 días → revisión antes de publicar.
- **Métricas afectadas**: tasa de incidencia logística; plazo medio de envío real.
- **Riesgos**: productor "sí lo hago bien" pero falla en envío real (es exactamente el motivo del issue).
- **Prioridad**: **P0**
- **Dependencias**: E1-01, E1-02 (mínimo SKU listo), E6-04 (tarjeta).
- **Etiquetas**: `area:operations`, `type:process`, `priority:P0`

---

### Épica 2 — Confianza en productor

#### E2-01 — Página de productor con historia + ubicación + portfolio

- **Problema**: Hoy un comprador frío no puede verificar quién hay detrás del producto en menos de 10 segundos.
- **Objetivo**: Cada productor tiene página propia con foto, historia, ubicación verificable, lista de productos y enlace a sus redes.
- **Contexto**: `01-vision-marketplace.md` § Promesa de marca; `docs/product/01-principios-producto.md` § 1 Confianza sobre cleverness.
- **Tareas**:
  1. Diseñar layout: foto productor, 2–3 párrafos de historia, ubicación con mapa estático, lista de productos.
  2. Plantilla de redacción de historia (extracción durante onboarding, no como deberes del productor).
  3. URL limpia `/productor/[slug]`, indexable.
  4. Schema.org `Person` + `Organization` para SEO.
  5. Link recíproco entre ficha de producto y página de productor.
- **Criterios de aceptación**:
  - [ ] Página de productor existe para cada productor publicado.
  - [ ] Pasa Lighthouse mobile ≥ 90 perf, ≥ 95 SEO.
  - [ ] Foto del productor en su entorno (no logo).
  - [ ] Historia de 120–250 palabras escrita por nosotros, validada por productor.
- **Métricas afectadas**: conversión móvil ficha → carrito; CTR de "ver productor" desde ficha; tiempo en página.
- **Riesgos**: páginas plantilla genéricas (mitigación: redacción manual, no auto-generada); productor incómodo con foto (mitigación: alternativa entorno/proceso).
- **Prioridad**: **P0**
- **Dependencias**: E1-01.
- **Etiquetas**: `area:vendor`, `area:catalog`, `type:feature`, `priority:P0`

#### E2-02 — Señales de confianza visibles en ficha y checkout

- **Problema**: Las 5 señales básicas (productor real, origen, qué pasa si falla, plazo, coste de envío) no están todas visibles antes del pago.
- **Objetivo**: Ficha y checkout muestran las 5 señales sin scroll innecesario.
- **Contexto**: `docs/product/01-principios-producto.md` § 1; `02-flujos-criticos.md` CF-1; `04-prioridades-ux-mobile.md`.
- **Tareas**:
  1. Auditar ficha actual contra las 5 señales — anotar gaps por señal.
  2. Añadir bloque "De [Productor] desde [Pueblo, Provincia]" enlazando a página de productor en above-the-fold móvil.
  3. Mostrar plazo de envío estimado en ficha (no solo en checkout).
  4. Mostrar coste de envío estimado tan pronto como haya código postal o por defecto península.
  5. Link visible a política de devolución desde ficha y checkout.
- **Criterios de aceptación**:
  - [ ] Las 5 señales visibles antes de "Añadir al carrito" en móvil sin scroll > 1 pantalla.
  - [ ] El precio nunca cambia entre ficha y checkout sin explicación.
  - [ ] Política de devolución alcanzable en ≤ 1 tap desde ficha.
- **Métricas afectadas**: conversión móvil ficha → carrito; abandono entre carrito y checkout.
- **Riesgos**: meter demasiada información y matar legibilidad (mitigación: principio "una acción primaria por pantalla").
- **Prioridad**: **P0**
- **Dependencias**: E2-01 para link a productor.
- **Etiquetas**: `area:catalog`, `area:checkout`, `type:ux`, `priority:P0`

#### E2-03 — Política de envío, devolución y "sobre nosotros" públicas y honestas

- **Problema**: Sin políticas claras y sin "sobre nosotros" honesto, el comprador frío no convierte y los productores potenciales tampoco confían.
- **Objetivo**: 3 páginas estáticas: envíos, devoluciones, sobre nosotros, cada una en lenguaje humano (no jurídico-defensivo).
- **Contexto**: `01-vision-marketplace.md`; `04-modelo-negocio-comisiones.md` Devoluciones; `05-logistica-operaciones.md` SLA.
- **Tareas**:
  1. Redactar política de envíos (plazos, costes, transportistas tipo, qué pasa con receptor ausente).
  2. Redactar política de devoluciones (plazo, condiciones, quién paga, plazo de reembolso).
  3. Redactar "Sobre nosotros" (3–4 párrafos: quiénes, qué, por qué, etapa).
  4. Footer con enlaces visibles + canal de atención (email + nombre + foto del responsable).
  5. Revisar con asesor legal — pero no dejar el copy en manos del legal.
- **Criterios de aceptación**:
  - [ ] 3 páginas en producción enlazadas desde footer.
  - [ ] Cada página ≤ 600 palabras; lenguaje claro.
  - [ ] Atención al cliente con nombre real, no "support@".
  - [ ] Cumple LSSI / RGPD básico.
- **Métricas afectadas**: conversión móvil checkout → pago; tasa de incidencias post-compra "no sabía que…".
- **Riesgos**: copy demasiado defensivo que ahuyenta (mitigación: tono de `07-copy-contacto-productores.md`).
- **Prioridad**: **P0**
- **Dependencias**: PEND-002 (política mínima de devoluciones).
- **Etiquetas**: `area:legal`, `area:trust`, `type:content`, `priority:P0`

---

### Épica 3 — Conversión móvil

#### E3-01 — Auditoría de checkout móvil + arreglar fricciones P0/P1

- **Problema**: El checkout es el flujo más sagrado y no tenemos evidencia de que cumpla los principios de `01-` y reglas de `04-`.
- **Objetivo**: Checkout móvil que un comprador en frío completa en < 90 s sin equivocarse.
- **Contexto**: `docs/product/01-principios-producto.md` § 4; `04-prioridades-ux-mobile.md` Checkout móvil checklist; `02-flujos-criticos.md` CF-1.
- **Tareas**:
  1. Ejecutar prompt `audit-mobile-conversion.md` sobre el checkout actual.
  2. Arreglar P0/P1 que salgan: total visible siempre, sticky CTA, guest checkout, teclados correctos (`inputMode`), tipografía ≥ 16 px, validaciones inline.
  3. Asegurar Apple Pay / Google Pay si Stripe los expone.
  4. Test manual en iPhone real + Android real (no emulador).
- **Criterios de aceptación**:
  - [ ] Total con envío visible en cada paso del checkout.
  - [ ] Checkout completable sin crear cuenta.
  - [ ] Cero zoom automático en inputs en iOS.
  - [ ] Tiempo medio de checkout en sesión interna < 90 s.
  - [ ] Verificación documentada en dispositivo real (modelo + OS) en el PR.
- **Métricas afectadas**: conversión carrito → pago; abandono por paso.
- **Riesgos**: añadir pasos por compliance (mitigación: cada paso nuevo necesita justificación operativa real).
- **Prioridad**: **P0**
- **Dependencias**: ninguna.
- **Etiquetas**: `area:checkout`, `type:ux`, `priority:P0`

#### E3-02 — Ficha de producto móvil con CTA above-the-fold y sticky

- **Problema**: Ficha actual sin garantía de que el comprador móvil vea precio + CTA sin scroll.
- **Objetivo**: Cada ficha móvil cumple el checklist específico de `04-prioridades-ux-mobile.md` Ficha.
- **Contexto**: `docs/product/04-prioridades-ux-mobile.md` Ficha; `01-principios-producto.md` § 7.
- **Tareas**:
  1. Foto principal + precio + CTA primaria above-the-fold sin scroll en viewport iPhone SE / Pixel 5.
  2. Productor con nombre + link a página above-the-fold.
  3. CTA "Añadir al carrito" sticky en parte inferior.
  4. Carrousel sin auto-rotate.
  5. Lazy-load + dimensiones declaradas en imágenes (CLS ≤ 0.1).
- **Criterios de aceptación**:
  - [ ] Lighthouse mobile: LCP < 2.5 s, CLS ≤ 0.1, INP < 200 ms.
  - [ ] CTA primaria visible al cargar la ficha en iPhone SE.
  - [ ] Verificación en 2 dispositivos reales documentada en el PR.
- **Métricas afectadas**: conversión móvil ficha → carrito; CTR de "Añadir al carrito".
- **Riesgos**: sticky CTA tapando contenido relevante (mitigación: revisar en pantalla pequeña).
- **Prioridad**: **P1**
- **Dependencias**: E1-02.
- **Etiquetas**: `area:catalog`, `type:ux`, `priority:P1`

#### E3-03 — Listado / catálogo móvil sin scroll horizontal y con sort estable

- **Problema**: El listado es el primer punto de contacto del comprador frío. Si frustra, no llega a ficha.
- **Objetivo**: Cumple checklist de `04-prioridades-ux-mobile.md` Listado.
- **Contexto**: `04-prioridades-ux-mobile.md` Listado.
- **Tareas**:
  1. Tarjetas con foto + nombre + precio + productor; nada más en primer vistazo.
  2. Sort por defecto razonable y estable entre cargas.
  3. Filtros desde un único punto.
  4. Paginación visible (no scroll infinito puro que rompa botón "atrás").
- **Criterios de aceptación**:
  - [ ] Cero scroll horizontal en cualquier viewport ≥ 320 px.
  - [ ] Sort por defecto idéntico entre recargas para misma sesión.
  - [ ] Botón "atrás" del navegador devuelve al usuario al sitio donde estaba.
- **Métricas afectadas**: CTR listado → ficha; bounce rate móvil.
- **Riesgos**: filtros sofisticados antes de tener catálogo grande (mitigación: solo categoría + ordenar por precio/novedad en V1).
- **Prioridad**: **P1**
- **Dependencias**: E1-02.
- **Etiquetas**: `area:catalog`, `type:ux`, `priority:P1`

---

### Épica 4 — Packs y ticket medio

#### E4-01 — Modelar Pack como SKU propio

- **Problema**: Sin modelo Pack en sistema, no se pueden vender packs limpiamente ni medir su impacto en AOV.
- **Objetivo**: Tipo "Pack" que agrupa N SKUs y se vende como unidad, con su propio inventario y comisión.
- **Contexto**: `03-productos-iniciales.md` Packs iniciales; `04-modelo-negocio-comisiones.md` Packs como palanca de AOV.
- **Tareas**:
  1. Aplicar decisión PEND-001 (autocontenido vs composición).
  2. Aplicar regla "pack viene de un solo productor cuando sea posible".
  3. Pricing del pack: descuento fijo 5–10 % sobre suma de SKUs; mostrar precio antes/después.
  4. Comisión sobre subtotal del pack (misma fórmula 20–30 %).
- **Criterios de aceptación**:
  - [ ] Modelo Pack en producción con al menos 1 pack publicado.
  - [ ] Stock del pack se actualiza correctamente según el modelo elegido.
  - [ ] Comisión calculada y liquidada correctamente al productor.
- **Métricas afectadas**: AOV; % pedidos con pack; comisión efectiva real.
- **Riesgos**: complejidad de inventario (mitigación: V1 según decisión PEND-001).
- **Prioridad**: **P1**
- **Dependencias**: E1-01, E1-02, PEND-001.
- **Etiquetas**: `area:catalog`, `type:feature`, `priority:P1`

#### E4-02 — Publicar 3 packs ancla (uno por categoría)

- **Problema**: Sin packs visibles, no podemos validar la hipótesis de AOV.
- **Objetivo**: 3 packs publicados: Catador AOVE, Tabla de quesos, Mieles del año.
- **Contexto**: `03-productos-iniciales.md` Packs iniciales; tickets objetivo definidos por pack.
- **Tareas**:
  1. Definir composición exacta con cada productor.
  2. Foto del pack ensamblado (no collage).
  3. Copy de pack: 80–120 palabras, ángulo regalo / descubrimiento.
  4. Tarjeta física común incluida (E6-04).
  5. Cumplir "pack = un solo productor cuando sea posible".
- **Criterios de aceptación**:
  - [ ] 3 packs publicados.
  - [ ] Cada pack con foto propia ensamblada.
  - [ ] Ticket de cada pack dentro del rango objetivo.
- **Métricas afectadas**: AOV; % pedidos con pack en mes 6 (objetivo 30–40 %).
- **Riesgos**: pack que parece "mucho" en móvil → comprador no compra (mitigación: foto ensamblada con producto a tamaño visible).
- **Prioridad**: **P1**
- **Dependencias**: E4-01, E1-02.
- **Etiquetas**: `area:catalog`, `type:content`, `priority:P1`

---

### Épica 5 — Onboarding de productores

#### E5-01 — Pipeline de outreach con plantillas y panel de candidatos

- **Problema**: Outreach hoy es manual sin tracking; perdemos candidatos por falta de seguimiento.
- **Objetivo**: Plantillas + tabla viva (Notion / Airtable) con estado por candidato.
- **Contexto**: `07-copy-contacto-productores.md`; `02-productores-ideales.md` proceso de evaluación.
- **Tareas**:
  1. Tabla con columnas: nombre, contacto, categoría, fuente, fecha contacto 1/2/3, estado, razón si descartado.
  2. Plantillas de `07-` listas para copiar.
  3. Cadencia documentada: 3 mensajes max en 3–4 semanas.
  4. **Recomendación V1: Notion**, no panel admin del repo.
- **Criterios de aceptación**:
  - [ ] Tabla operativa con ≥ 60 candidatos cargados.
  - [ ] Plantillas accesibles en menos de 1 min.
  - [ ] Cero candidatos "perdidos" sin último estado registrado.
- **Métricas afectadas**: tasa de respuesta a outreach; tasa de cierre tras llamada; tiempo "candidato a publicado".
- **Riesgos**: panel admin propio antes de validar el proceso (mitigación: V1 fuera del repo).
- **Prioridad**: **P0**
- **Dependencias**: ninguna.
- **Etiquetas**: `area:vendor`, `type:process`, `priority:P0`

#### E5-02 — Formulario de alta del productor + recogida de datos fiscales/banco

- **Problema**: Onboarding hoy mezcla emails sueltos y archivos adjuntos; pierde tiempo y datos.
- **Objetivo**: Un único formulario web (móvil-friendly) que recoja todo lo necesario para dar de alta.
- **Contexto**: `02-productores-ideales.md` Criterios obligatorios para alta; `05-logistica-operaciones.md` Responsabilidad del productor.
- **Tareas**:
  1. Campos obligatorios: NIF, razón social, dirección, IBAN, registros sanitarios (si aplica), capacidad declarada, plazo SLA aceptado.
  2. Subida segura de copia de NIF y registros sanitarios.
  3. Aceptación explícita de comisión, política mínima de devoluciones y SLA.
  4. Email de confirmación con próximos pasos.
- **Criterios de aceptación**:
  - [ ] Productor puede completar el formulario en móvil en < 10 min.
  - [ ] Datos llegan a panel admin / Stripe Connect.
  - [ ] Cero datos sensibles enviados por canales no seguros.
- **Métricas afectadas**: tiempo "candidato → alta"; % de altas con datos completos a la primera.
- **Riesgos**: formulario demasiado largo que ahuyenta (mitigación: solo campos obligatorios).
- **Prioridad**: **P0**
- **Dependencias**: E5-01.
- **Etiquetas**: `area:vendor`, `area:admin`, `type:feature`, `priority:P0`

#### E5-03 — Panel del productor móvil con vista de pedidos

- **Problema**: El productor debe operar desde su móvil sin instalar nada; sin vista de pedidos, no puede confirmar ni preparar.
- **Objetivo**: Panel web responsive donde el productor ve pedidos pendientes + datos del comprador + botón "Confirmar / Marcar enviado".
- **Contexto**: `docs/product/04-prioridades-ux-mobile.md`; `05-logistica-operaciones.md`.
- **Tareas**:
  1. Vista lista de pedidos con estado (Nuevo / Confirmado / Enviado / Entregado).
  2. Detalle por pedido: SKUs + cantidades + datos de envío + plazo prometido.
  3. Acción "Confirmar stock + plazo" en un tap.
  4. Acción "Marcar enviado" + campo opcional de tracking.
  5. Auth segura; cada productor solo ve sus pedidos (test cross-tenant negativo).
- **Criterios de aceptación**:
  - [ ] Panel funciona en móvil sin instalar app.
  - [ ] Productor puede confirmar pedido en ≤ 3 taps desde notificación.
  - [ ] Test cross-tenant negativo: productor A no accede a pedidos de productor B.
- **Métricas afectadas**: tiempo "notificación → confirmación"; tasa de cumplimiento SLA.
- **Riesgos**: scope creep hacia "panel completo del productor" (mitigación: V1 solo pedidos).
- **Prioridad**: **P1**
- **Dependencias**: E5-02, E6-01.
- **Etiquetas**: `area:vendor`, `area:admin`, `type:feature`, `priority:P1`

---

### Épica 6 — Operativa mínima de pedidos

#### E6-01 — Notificación al productor en cada pedido (Telegram + email backup)

- **Problema**: Sin notificación robusta, el productor no se entera y el SLA se rompe el día 1.
- **Objetivo**: Notificación inmediata por Telegram con email de respaldo, con todos los datos del pedido.
- **Contexto**: `05-logistica-operaciones.md` Operaciones diarias; SLA notificación < 5 min.
- **Tareas**:
  1. Verificar que el bot Telegram cubre canal por productor.
  2. Email transaccional con mismo contenido como fallback.
  3. Cada notificación incluye: SKUs, cantidades, datos comprador, dirección, plazo prometido, link al panel.
  4. Reintento automático si Telegram falla; alerta interna si email también falla.
- **Criterios de aceptación**:
  - [ ] Notificación llega en < 5 min en > 99 % de pedidos de prueba.
  - [ ] Productor puede actuar desde la propia notificación (link directo al panel).
  - [ ] Fallback email probado.
- **Métricas afectadas**: tiempo "pedido → confirmación productor"; tasa de cumplimiento SLA.
- **Riesgos**: Telegram caído → todos los productores afectados (mitigación: email automático).
- **Prioridad**: **P0**
- **Dependencias**: E5-02 para datos del productor.
- **Etiquetas**: `area:operations`, `area:vendor`, `type:feature`, `priority:P0`

#### E6-02 — Panel admin de pedidos: ver, confirmar, marcar enviado, gestionar incidencia

- **Problema**: Sin panel, las incidencias se gestionan por email + memoria. Insostenible incluso a 5 pedidos / día.
- **Objetivo**: Una pantalla donde admin ve todos los pedidos y ejecuta las acciones de la matriz de incidencias.
- **Contexto**: `05-logistica-operaciones.md` Matriz de incidencias.
- **Tareas**:
  1. Vista lista filtrable por estado, productor, fecha.
  2. Acciones por pedido: marcar enviado, gestionar devolución, reembolsar, anular.
  3. Vista de incidencias abiertas como filtro rápido.
  4. Notas internas por pedido.
- **Criterios de aceptación**:
  - [ ] Admin puede resolver una incidencia tipo "stock no real" en < 2 min.
  - [ ] Cada acción queda auditada (quién + cuándo).
  - [ ] Reembolso ejecutado vía Stripe sin tocar Stripe directamente.
- **Métricas afectadas**: tiempo medio de resolución de incidencia; tasa de incidencia operativa.
- **Riesgos**: UI sobreingenierada antes de validar volumen (mitigación: V1 = lista + 4 acciones).
- **Prioridad**: **P0**
- **Dependencias**: ninguna técnica.
- **Etiquetas**: `area:admin`, `area:operations`, `type:feature`, `priority:P0`

#### E6-03 — Emails transaccionales: confirmación, envío, devolución

- **Problema**: Sin emails claros, el comprador percibe la operación como amateur.
- **Objetivo**: 3 plantillas de email transaccional, en castellano humano, con info útil y enlaces correctos.
- **Contexto**: `docs/product/02-flujos-criticos.md` CF-1 paso 8; `01-principios-producto.md` § 5 honestidad operativa.
- **Tareas**:
  1. Confirmación de pedido: resumen, plazo prometido, qué pasa después, canal de atención.
  2. Pedido enviado: tracking si lo hay, plazo restante.
  3. Reembolso emitido: cantidad, método, plazo de aparición en el banco.
  4. Cero "no responder a este email".
- **Criterios de aceptación**:
  - [ ] 3 plantillas en producción.
  - [ ] Cada email se renderiza bien en Gmail iOS, Apple Mail iOS, Gmail Android.
  - [ ] Cada email tiene un canal de atención visible y funcional.
- **Métricas afectadas**: tickets de soporte "qué pasa con mi pedido"; satisfacción post-pedido.
- **Riesgos**: emails que parecen spam (mitigación: dominio configurado con SPF/DKIM/DMARC).
- **Prioridad**: **P0**
- **Dependencias**: ninguna.
- **Etiquetas**: `area:operations`, `type:content`, `priority:P0`

#### E6-04 — Tarjeta física común incluida en cada envío

- **Problema**: Sin tarjeta común, cada envío parece "del productor", no del marketplace; perdemos branding y oportunidad de fidelizar.
- **Objetivo**: Tarjeta impresa estándar que cada productor mete en cada paquete.
- **Contexto**: `05-logistica-operaciones.md` Packaging; `01-vision-marketplace.md` promesa de marca.
- **Tareas**:
  1. Diseño 10×15 cm una cara: agradecimiento + nombre del productor + QR a "tu pedido" + canal de atención.
  2. Imprimir lote inicial (300 unidades).
  3. Repartir a cada productor.
  4. Reposición cuando un productor pide más.
- **Criterios de aceptación**:
  - [ ] Tarjeta diseñada e impresa.
  - [ ] Cada productor tiene 30+ tarjetas antes de empezar a enviar.
  - [ ] QR funciona (lleva a página de seguimiento real).
- **Métricas afectadas**: % compradores que escanean QR; ratio de reviews / NPS post-pedido.
- **Riesgos**: tarjeta cutre que daña marca (mitigación: imprenta decente, papel ≥ 350 g).
- **Prioridad**: **P1**
- **Dependencias**: E1-01.
- **Etiquetas**: `area:branding`, `area:operations`, `type:process`, `priority:P1`

#### E6-05 — Plantillas de atención al comprador + matriz de incidencias operativa

- **Problema**: Atención improvisada genera respuestas inconsistentes y SLA roto.
- **Objetivo**: 8–10 plantillas de respuesta + checklist de actuación por tipo de incidencia.
- **Contexto**: `05-logistica-operaciones.md` Matriz de incidencias.
- **Tareas**:
  1. Redactar plantillas para los 7 tipos de incidencia de la matriz.
  2. Documentar "qué pregunto antes de responder" por tipo.
  3. Plantilla genérica de "primera respuesta < 4 h hábiles" si la incidencia necesita investigación.
  4. Guardar en herramienta accesible al equipo.
- **Criterios de aceptación**:
  - [ ] 8+ plantillas validadas.
  - [ ] SLA de primera respuesta < 4 h hábiles documentado.
  - [ ] Cada plantilla en lenguaje humano, no Zendesk-style.
- **Métricas afectadas**: tiempo medio de primera respuesta; CSAT post-incidencia.
- **Riesgos**: plantillas demasiado rígidas (mitigación: cada plantilla incluye "personalizar la primera frase").
- **Prioridad**: **P0**
- **Dependencias**: PEND-004 (canal único de atención).
- **Etiquetas**: `area:support`, `type:process`, `priority:P0`

---

### Épica 7 — Medición de validación inicial

#### E7-01 — Instrumentar funnel CF-1 con eventos PostHog estables

- **Problema**: Sin eventos en el funnel principal, el soft launch nos deja ciegos y no podemos diagnosticar fricciones reales.
- **Objetivo**: Eventos PostHog en cada paso de CF-1, con propiedades que permitan filtrar por dispositivo y origen.
- **Contexto**: `docs/product/02-flujos-criticos.md` CF-1; `06-growth-lanzamiento.md` Métricas de growth.
- **Tareas**:
  1. Mapear pasos de CF-1 a eventos: `catalog.viewed`, `product.viewed`, `cart.opened`, `checkout.started`, `checkout.step_completed` (con `step` como prop), `order.placed`.
  2. Propiedades comunes: device (mobile/desktop), referrer, productor del SKU, categoría.
  3. Validar que cada evento dispara una sola vez por sesión donde corresponda.
  4. Documentar nombres en docs/ (estabilidad: una vez nombrados, no renombrar — patrón payment-incidents runbook).
- **Criterios de aceptación**:
  - [ ] 6+ eventos en producción con nombres estables.
  - [ ] Funnel visible en PostHog: catalog → product → cart → checkout → order.
  - [ ] Tasa de drop-off por paso medible.
- **Métricas afectadas**: todas las de conversión.
- **Riesgos**: nombres inestables que rompen el funnel (mitigación: documentar y tratar como contrato).
- **Prioridad**: **P0**
- **Dependencias**: ninguna.
- **Etiquetas**: `area:analytics`, `type:instrumentation`, `priority:P0`

#### E7-02 — Encuesta corta post-pedido (NPS proxy)

- **Problema**: Sin feedback estructurado, no sabemos por qué el comprador no repite.
- **Objetivo**: Encuesta de 2 preguntas a los 7 días de la entrega.
- **Contexto**: `08-roadmap-negocio.md` Fase 3 criterio NPS / satisfacción ≥ 40.
- **Tareas**:
  1. Email a +7 días: "¿qué tal todo?" con 1 pregunta NPS (0–10) + 1 abierta.
  2. Enlace a respuesta sin login (token único en URL).
  3. Respuestas a tabla simple para revisión semanal.
  4. Sin recordatorios agresivos (1 email, no más).
- **Criterios de aceptación**:
  - [ ] Encuesta enviada automáticamente a +7 días de "entregado".
  - [ ] Tasa de respuesta ≥ 15 %.
  - [ ] Respuestas accesibles para revisión semanal.
- **Métricas afectadas**: NPS / CSAT proxy; entendimiento cualitativo de fricciones.
- **Riesgos**: encuesta que parece spam (mitigación: copy honesto, 2 preguntas max, opt-out claro).
- **Prioridad**: **P1**
- **Dependencias**: E6-03.
- **Etiquetas**: `area:analytics`, `type:feature`, `priority:P1`

#### E7-03 — Vista mínima de "negocio" para revisión semanal

- **Problema**: Sin un sitio único donde mirar el estado, el equipo se desalinea sobre qué está pasando.
- **Objetivo**: Una vista (PostHog dashboard o hoja de cálculo viva) con 6 métricas clave.
- **Contexto**: `06-growth-lanzamiento.md` Métricas de growth; `04-modelo-negocio-comisiones.md` Métricas que importan.
- **Tareas**:
  1. Métricas: pedidos / semana, conversión móvil ficha → carrito, conversión carrito → pago, AOV, % pedidos con pack, repetición a 60 días.
  2. Dashboard PostHog si los eventos lo permiten; si no, hoja de cálculo viva.
  3. Revisión semanal de 30 min calendarizada.
  4. **Explícitamente NO**: dashboards complejos, KPI trees, alertas.
- **Criterios de aceptación**:
  - [ ] 6 métricas visibles en un solo sitio.
  - [ ] Actualizadas semanalmente con cero esfuerzo manual > 10 min.
  - [ ] Revisión semanal en agenda recurrente.
- **Métricas afectadas**: todas (la disciplina de mirarlas).
- **Riesgos**: caer en "dashboard porn" antes de tener tráfico (mitigación: regla de no dashboards complejos sin ventas).
- **Prioridad**: **P1**
- **Dependencias**: E7-01.
- **Etiquetas**: `area:analytics`, `type:process`, `priority:P1`

---

## 3. Orden recomendado de ejecución

Por dependencias y bloqueo de venta:

```
Semana 1–4 (en paralelo, sin bloqueos técnicos):
  E1-01  Cerrar productores         ─┐
  E2-03  Políticas + Sobre nosotros  │
  E5-01  Pipeline outreach           │
  E6-05  Plantillas atención         │
  E7-01  Instrumentar PostHog       ─┘

Semana 3–6 (back-end y operativa):
  E5-02  Formulario alta productor
  E6-01  Notificación al productor
  E6-02  Panel admin pedidos
  E6-03  Emails transaccionales
  E3-01  Auditoría + arreglar checkout móvil

Semana 5–8 (catálogo + confianza visible):
  E1-02  Publicar SKUs
  E2-01  Página de productor
  E2-02  Señales de confianza en ficha
  E5-03  Panel productor móvil

Semana 7–9 (último tramo antes de público):
  E1-03  Envíos de prueba           ← bloqueante para abrir al público
  E3-02  Ficha móvil optimizada
  E3-03  Listado móvil
  E6-04  Tarjeta física

Semana 9+ (post-soft-launch):
  E4-01  Modelo Pack
  E4-02  3 packs ancla
  E7-02  Encuesta post-pedido
  E7-03  Vista de negocio semanal
```

**Regla de oro**: no abrir al público hasta que esté verde todo P0 + E1-03 completado.

---

## 4. Top 5 issues antes de producción

> Si solo se pueden hacer 5 en código, son estos. Cada uno bloquea **vender bien**, no "vender técnicamente". El camino crítico de negocio (E1-01 + E1-02) corre en paralelo y no aparece aquí porque no es ejecución de ingeniería.

| Orden | Issue | Por qué es top 5 |
|---|---|---|
| **1** | **E3-01** — Auditoría + arreglar checkout móvil P0/P1 | Sin checkout móvil decente, todo lo demás es academia. Cualquier inversión en tráfico se desperdicia. |
| **2** | **E6-01** — Notificación al productor en cada pedido | Sin esto, el primer pedido real se rompe el día 1. Es lo único técnicamente complejo entre los top 5. |
| **3** | **E2-01** — Página de productor con historia y ubicación | Es la diferencia entre "ecommerce random" y "marketplace curado". Sin esto, el comprador frío no convierte. |
| **4** | **E2-03** — Políticas (envío, devolución) + "Sobre nosotros" honesto | Las 3 páginas estáticas que el comprador frío busca antes de pagar. Coste bajo, impacto alto en conversión. |
| **5** | **E7-01** — Instrumentar funnel CF-1 con PostHog | Sin esto, el soft launch no enseña nada. Hay que instalar la cámara antes del partido. |

---

## 5. Decisiones pendientes referenciadas

Las decisiones de negocio detectadas durante el armado de este backlog viven en [`09-decisiones-estrategicas.md`](09-decisiones-estrategicas.md) § "Decisiones pendientes":

- **PEND-001** — Modelo técnico del Pack (autocontenido vs composición). Bloquea E4-01.
- **PEND-002** — Política mínima común de devoluciones. Bloquea E2-03.
- **PEND-003** — Comisión por defecto en validación. Bloquea E1-01.
- **PEND-004** — Canal único de atención al comprador. Bloquea E6-05.

Cada una se cierra ejecutando el prompt `prompts/create-docs-from-decision.md` y mueve la entrada de "pendientes" a "ADRs cerradas".

---

## Mantenimiento de este documento

- **Cada épica cerrada** se anota como cerrada con fecha — no se borra.
- **Issues nuevos** que aparezcan durante ejecución se evalúan contra los 4 criterios de `/AGENTS.md` antes de añadirlos.
- **Top 5 se reevalúa** cada vez que un issue del top 5 cierra (sube otro).
- Cuando el marketplace pase de Fase 3 a Fase 4 (`08-roadmap-negocio.md`), este backlog se archiva y se sustituye por uno nuevo de "Optimización".
