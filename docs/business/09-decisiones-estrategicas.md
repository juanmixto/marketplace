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
