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

## ADR-007 — Política mínima de devoluciones: 14 días + comprador paga vuelta — **SUPERSEDED por ADR-010**

- **Fecha**: 2026-04-26. **Superseded el 2026-04-27.**
- **Decisión original**: Política pública del marketplace = 14 días de derecho de desistimiento desde la entrega, motivo libre, **el comprador asume el coste de envío de devolución salvo defecto del producto o error de envío**, en cuyo caso lo asume el responsable (productor o marketplace según corresponda). Reembolso por método de pago original en ≤ 7 días tras recepción de la devolución.
- **Por qué se reemplaza**: La decisión original aceptaba devolución por cambio de opinión cobrando el envío de vuelta al comprador. Tras revisión: alimentación está exenta del derecho de desistimiento de 14 días por ser perecedero / sellado por motivos de higiene (Art. 103.d/e RDL 1/2007). Aceptar devoluciones por cambio de opinión en producto que no podemos revender (perecedero, abierto) significa coste a fondo perdido. La cobertura por defectos / errores / daño en transporte / calidad inferior queda intacta — eso es protección al consumidor no renunciable. Ver ADR-010.

---

## ADR-008 — Comisión caso por caso 20–30 % en validación

- **Fecha**: 2026-04-26.
- **Decisión**: La comisión con cada productor se negocia **caso por caso dentro del rango 20–30 %** sobre subtotal del producto, con razón documentada en su ficha interna. No se aplica un flat ni tramos rígidos por categoría en validación.
- **Alternativas**: 25 % flat para los primeros 6–10 productores (más simple comercialmente); tramos fijos por categoría (22 % aceite, 25 % queso, 28 % miel).
- **Razón**: Es lo que ya prescribe `04-modelo-negocio-comisiones.md`. Caso por caso permite cerrar productores ancla a 20 % y compensar productores con curaduría intensiva a 28–30 %. Tramos rígidos eliminan flexibilidad y ahuyentan al productor estrella; flat 25 % nos hace perder 5 puntos en los productores que aceptarían 30 %. La complejidad de negociar caso por caso es asumible con < 10 productores.
- **Se revisa cuando**: el equipo supere 25 productores activos, o cuando 3+ productores rechacen el rango sostenidamente como señal de mercado, o cuando aparezca coste operativo nuevo significativo (logística centralizada, fotografía interna).

---

## ADR-009 — Canal único de atención al comprador: email + formulario web

- **Fecha**: 2026-04-26.
- **Decisión**: El canal único oficial de atención al comprador es **email + formulario web del marketplace**. Instagram DMs, WhatsApp, chat live y otros canales **no son canales de soporte** en esta etapa, aunque el marketplace mantenga presencia en ellos para marketing. SLA: primera respuesta humana < 24 h hábiles, < 4 h hábiles cuando la incidencia esté en flujo CF-1..CF-5.
- **Alternativas**: añadir Instagram DMs como secundario (visibilidad gratis, riesgo de SLA roto); añadir WhatsApp Business (mejor UX, más fricción de alta para el comprador).
- **Razón**: Es lo que ya prescribe `05-logistica-operaciones.md` § Atención y soporte. Multi-canal sin equipo dedicado garantiza SLA roto, lo que es **peor que no tener canal**. Email + formulario centraliza, audita y permite plantillas de la matriz de incidencias. Cuando el equipo crezca y el volumen lo justifique se reabre.
- **Se revisa cuando**: equipo dedicado a soporte ≥ 1 persona full-time, o feedback consistente del comprador identifica la ausencia de chat / WhatsApp como fricción de compra documentable.

---

## ADR-010 — Devoluciones: no por cambio de opinión, sí por defectos / errores / daño / calidad

- **Fecha**: 2026-04-27.
- **Decisión**: Política pública del marketplace = **no aceptamos devoluciones por cambio de opinión** (todos nuestros productos son alimentación, exentos del derecho de desistimiento de 14 días por ser perecederos / sellados por motivos de higiene — Art. 103.d/e RDL 1/2007 General de Consumidores y Usuarios). **Sí cubrimos siempre y sin fricción**: producto defectuoso, producto equivocado, daño en transporte, calidad inferior a la descrita o fotografiada, pedido perdido. Plazo del comprador para reclamar: 7 días desde la entrega o desde la fecha estimada. Reembolso por método de pago original en ≤ 3 días laborables tras acuerdo (más 2–5 días del banco).
- **Alternativas**: política original ADR-007 (14 días libres + comprador paga vuelta) — descartada por coste a fondo perdido en producto no revendible; política totalmente cerrada sin garantía de conformidad — descartada por ilegal (Art. 116 RDL 1/2007).
- **Razón**: alimentación tiene exención legal específica del desistimiento; aceptar "cambio de opinión" significa absorber el coste íntegro de un producto que no se puede volver a vender (perecedero o sellado-abierto). Mantener la cobertura por defectos / errores / daño / calidad es no negociable y además es lo que el comprador realmente espera de un marketplace curado: que respondamos cuando algo va mal, no que tolere arrepentimientos. Reduce abuso, baja el coste de devolución, y mantiene la promesa de "si algo va mal, hay alguien al otro lado".
- **Implicaciones**: `04-modelo-negocio-comisiones.md § Devoluciones` queda contradicho parcialmente (la frase "Coste de devolución por defecto a cargo del comprador, salvo defecto…" debe entenderse como aplicable solo a los casos cubiertos, ya que el cambio de opinión deja de existir). Pendiente actualizar ese doc en un PR aparte.
- **Se revisa cuando**: feedback sostenido (>10% de tickets) identifique el "no devolución por cambio de opinión" como objeción de compra real, o cuando el catálogo introduzca productos no alimentarios para los que el desistimiento sí aplique.

---

## Decisiones pendientes (no cerradas)

> Decisiones identificadas como necesarias pero **aún no tomadas**. No son ADRs todavía. Cuando se cierren, se moverán arriba con número ADR asignado y se eliminarán de esta sección.

### PEND-001 — Modelo técnico del Pack: SKU autocontenido vs composición

- **Pregunta**: ¿Un Pack es un Product autocontenido con su propio stock, o un Product cuya composición se vincula a otros Products y el stock se deriva?
- **Por qué importa**: Bloquea épica E4 del backlog (packs ancla). El modelo elegido condiciona inventario, comisiones, devoluciones parciales, y migraciones futuras a packs cross-productor.
- **Opciones consideradas**:
  - **A) Pack autocontenido**: simple, stock independiente, sin dependencia de componentes. Riesgo: doble contabilidad de inventario.
  - **B) Pack como composición**: stock derivado de los componentes, una sola fuente de verdad. Riesgo: complejidad operativa y de UI.
- **Quién decide**: Producto + Engineering.
- **Plazo objetivo**: antes de empezar E4-01 (post-soft-launch).
- **Criterios para decidir**: volumen esperado de packs en V1, grado de overlap con SKUs sueltos, capacidad del equipo para mantener inventario derivado.

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
