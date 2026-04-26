# 09 — Decisiones estratégicas

> **Registro de decisiones tomadas.** Lo que está aquí está cerrado. No se reabre sin información nueva que invalide la decisión.
>
> Formato por entrada: fecha, decisión, alternativas consideradas, razón, condición de revisión.

---

## ADR-001 — Marketplace curado, no agregador

- **Fecha**: inicio del proyecto.
- **Decisión**: catálogo seleccionado y editado por el equipo. Nada de self-service open.
- **Alternativas**: marketplace abierto tipo Etsy; vertical único.
- **Razón**: en pre-tracción la única defensa es la curaduría. Self-service trae ruido y mata confianza.
- **Se revisa cuando**: la operación de curaduría sea el cuello de botella demostrable y haya volumen para automatizarla parcialmente.

---

## ADR-002 — Sólo comisión por pedido, sin cuotas a productores

- **Fecha**: inicio del proyecto.
- **Decisión**: pricing único = comisión sobre pedido completado. Sin alta de pago, sin mensualidad, sin planes.
- **Alternativas**: cuota mensual; modelo freemium/premium.
- **Razón**: alinea incentivos, baja la fricción para el productor bueno-pero-pequeño, simplifica conversaciones comerciales.
- **Se revisa cuando**: hay productores que demandan servicios premium reales (fotos pro, posicionamiento) y la economía cuadra.

---

## ADR-003 — Mobile-first, no responsive como afterthought

- **Fecha**: inicio del proyecto.
- **Decisión**: cada decisión de UX se valida en móvil antes que en desktop.
- **Alternativas**: desktop-first y adaptar.
- **Razón**: la audiencia objetivo descubre y compra en móvil. La fricción móvil pesa más en conversión que cualquier feature desktop.
- **Se revisa cuando**: nunca, salvo que el mix de dispositivos cambie radicalmente.

---

## ADR-004 — Sin paid acquisition antes de validar conversión orgánica

- **Fecha**: inicio del proyecto.
- **Decisión**: cero presupuesto en Meta / Google Ads en soft launch.
- **Alternativas**: campañas pequeñas para "aprender".
- **Razón**: gastar en traer tráfico a un funnel que no convierte amplifica el problema. Aprender CAC sin LTV es ruido.
- **Se revisa cuando**: conversión móvil orgánica supera el umbral acordado durante 4 semanas.

---

## ADR-005 — Producto físico únicamente, envío por productor

- **Fecha**: inicio del proyecto.
- **Decisión**: solo producto físico. Cada productor envía con su transportista.
- **Alternativas**: incluir digital; logística centralizada propia.
- **Razón**: digital cambia el modelo (sin envío, comisiones distintas, curaduría distinta). Logística propia es capital intensivo.
- **Se revisa cuando**: hay caso de negocio claro y volumen que lo justifique.

---

## ADR-006 — Onboarding de productor asistido, no self-service

- **Fecha**: inicio del proyecto.
- **Decisión**: el equipo da de alta y edita las primeras fichas de cada productor. El productor no publica solo.
- **Alternativas**: self-service desde el día uno.
- **Razón**: la calidad de las fichas es el activo principal del marketplace. Self-service mediocre destruye más que automatizar tarde.
- **Se revisa cuando**: hay un listón de calidad codificado que un productor pueda cumplir solo y verificar automáticamente.

---

## Decisiones pendientes (no cerradas)

> Decisiones identificadas como necesarias pero **aún no tomadas**. No son ADRs todavía. Cuando se cierren, se moverán arriba con número ADR asignado y se eliminarán de esta sección. Detectadas durante el armado de `10-launch-backlog.md` (PR de documentación de lanzamiento).

### PEND-001 — Modelo técnico del Pack: SKU autocontenido vs composición

- **Pregunta**: ¿Un Pack es un Product autocontenido con su propio stock, o un Product cuya composición se vincula a otros Products y el stock se deriva?
- **Por qué importa**: Bloquea épica E4 del backlog (packs ancla). El modelo elegido condiciona inventario, comisiones, devoluciones parciales, y migraciones futuras a packs cross-productor.
- **Opciones consideradas**:
  - **A) Pack autocontenido**: simple, stock independiente, sin dependencia de componentes. Riesgo: doble contabilidad de inventario.
  - **B) Pack como composición**: stock derivado de los componentes, una sola fuente de verdad. Riesgo: complejidad operativa y de UI.
- **Quién decide**: Producto + Engineering.
- **Plazo objetivo**: antes de empezar E4-01.
- **Criterios para decidir**: volumen esperado de packs en V1, grado de overlap con SKUs sueltos, capacidad del equipo para mantener inventario derivado.

### PEND-002 — Política mínima común de devoluciones

- **Pregunta**: ¿Qué plazo, qué cobertura y quién paga el envío de devolución por defecto?
- **Por qué importa**: Bloquea E2-03 (políticas públicas) y forma parte del onboarding de productor (E5-02). Sin política cerrada, productores firman algo que luego cambia.
- **Opciones consideradas**:
  - **A) 14 días, motivo libre, comprador paga envío de vuelta** (estándar legal LSSI/derecho desistimiento).
  - **B) 14 días, motivo libre, marketplace paga envío de vuelta como palanca de confianza** (coste mayor).
  - **C) 30 días, motivo libre, comprador paga vuelta** (señal de confianza extra, ventana más larga).
- **Quién decide**: Negocio + Operaciones.
- **Plazo objetivo**: antes del soft launch.
- **Criterios para decidir**: volumen estimado de devoluciones, AOV, asesoría legal LSSI, impacto en margen unitario.

### PEND-003 — Comisión por defecto en validación

- **Pregunta**: ¿Cerramos comisión en 25 % por defecto para todos los primeros productores, o aplicamos tramos por categoría desde el día 1?
- **Por qué importa**: Determina la negociación con los primeros 6 productores (E1-01). Cambiar el rango después es muy costoso comercialmente.
- **Opciones consideradas**:
  - **A) 25 % flat** para los primeros 6–10 productores, simplicidad comercial.
  - **B) Tramos por categoría** desde el inicio (ej. 22 % aceite premium, 25 % queso, 28 % miel) según margen real.
  - **C) Negociación caso por caso** dentro de 20–30 % con razón documentada (lo que dice `04-modelo-negocio-comisiones.md` hoy).
- **Quién decide**: Negocio.
- **Plazo objetivo**: antes de iniciar outreach masivo en E1-01.
- **Criterios para decidir**: simplicidad de pitch al productor, márgenes reales por categoría, capacidad del equipo de negociar caso por caso.

### PEND-004 — Canal único de atención al comprador

- **Pregunta**: ¿Confirmamos email + formulario web como único canal en validación, descartando explícitamente chat live, WhatsApp, Instagram DMs?
- **Por qué importa**: Define E6-05 (plantillas y SLA) y la promesa pública en E2-03. Multi-canal sin equipo lo asume es la receta para SLA roto.
- **Opciones consideradas**:
  - **A) Solo email + formulario web** (lo que hoy implícitamente asume `05-logistica-operaciones.md`). SLA < 24 h.
  - **B) Añadir Instagram DMs** como canal secundario (visibilidad gratis, riesgo de SLA).
  - **C) Añadir WhatsApp Business** (más fricción de alta, mejor UX para el comprador medio).
- **Quién decide**: Operaciones.
- **Plazo objetivo**: antes del soft launch.
- **Criterios para decidir**: capacidad del equipo, disciplina de SLA, expectativa del comprador objetivo.

### Cómo se cierra una decisión pendiente

1. Se toma la decisión (reunión / conversación / brief).
2. Se ejecuta `prompts/create-docs-from-decision.md` para convertirla en ADR formal.
3. Se mueve a la sección de ADRs cerradas con número siguiente (ADR-007, ADR-008, ...).
4. Se elimina de "Decisiones pendientes".
5. Si afecta otros docs, se actualizan en el mismo PR.

---

## Plantilla para nuevas ADRs

```
## ADR-XXX — Título corto

- **Fecha**: AAAA-MM-DD
- **Decisión**: una frase, sin matices.
- **Alternativas**: las que se consideraron en serio.
- **Razón**: por qué se eligió esta. Honesto, incluyendo trade-offs.
- **Se revisa cuando**: condición concreta y observable que dispararía revisar la decisión.
```

Una decisión sin "se revisa cuando" no es una decisión, es una opinión. Cada ADR debe tenerla.
