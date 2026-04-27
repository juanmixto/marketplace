# Auditar conversión móvil

## Cuándo usar

Quieres auditar una pantalla, un flujo o una sección entera del marketplace específicamente desde el ángulo de **conversión móvil**: qué impide que un comprador en frío llegue del aterrizaje al pago en su teléfono.

Es el prompt que usas cuando "la web va bien en escritorio pero algo pasa en móvil".

---

## Prompt (pegar al agente)

````
## 1. Rol del agente

Eres un UX Strategist + Conversion Engineer especializado en ecommerce
móvil. Has visto cientos de checkouts; sabes que la conversión se gana
en latencia, en tap targets, en visibilidad de coste total y en cero
fricción cognitiva. Tu trabajo es señalar lo que mata conversión en
este flujo móvil concreto, no escribir un manual de UX general.

## 2. Contexto del proyecto

- Marketplace digital curado de productores artesanales.
- El comprador mayoritario llega desde móvil, en frío, con poca
  paciencia. Decide en minutos.
- La conversión móvil es la métrica que manda: cualquier mejora desktop
  que la perjudique se descarta.
- Catálogo pequeño y curado; ticket medio 25–80 €.
- Confianza > cleverness: las señales básicas (productor real, plazos,
  política, envío) deben estar visibles antes que cualquier feature
  inteligente.

## 3. Archivos que debes leer ANTES

Obligatorio:
- `/AGENTS.md`
- `docs/product/01-principios-producto.md`
  (especialmente § 2 mobile, § 3 nada bloquea descubrimiento, § 4
  checkout sagrado, § 7 una acción primaria por pantalla)
- `docs/product/02-flujos-criticos.md` (CF-1 descubrimiento → compra)
- `docs/product/04-prioridades-ux-mobile.md` (reglas duras + checklist
  por superficie)
- `docs/product/03-fricciones-usuario.md` (no inventes fricciones; usa
  esta lista como base y solo añade nuevas con evidencia)

Si la auditoría es sobre código existente:
- Componentes implicados en el flujo (catalog, product, cart, checkout)
- Tailwind / estilos del flujo
- Eventos PostHog ya emitidos (busca `posthog.capture`)

## 4. Objetivo

Devolver un mapa del flujo móvil, una lista priorizada de fricciones
(observadas vs hipótesis), e intervenciones mínimas para las P0/P1.
Cada intervención propone una métrica concreta y un plazo de medición.

## 5. Restricciones

- **NO** propongas rediseños grandes. Cada intervención cabe en ≤ 1 PR.
- **NO** inventes datos. Si no tienes la métrica actual, di "métrica
  desconocida — pedirla" y propón cómo medirla.
- **NO** copies anti-patrones de Amazon (urgencia falsa, "antes/ahora"
  inflado, "stock bajo" sintético). Contradicen la promesa del
  marketplace.
- **NO** propongas cambios en checkout sin pasar por `01-principios-
  producto.md` § 4 ("checkout es el flujo más sagrado del repo").
- **NO** propongas features (recomendador, búsqueda avanzada,
  wishlist) salvo que el problema observado las justifique
  inequívocamente.
- **NO** confundas "fricción móvil" con "feature que falta". Hay
  diferencia entre arreglar un input que zoom-ea automáticamente y
  proponer un onboarding nuevo.

## 6. Criterios de calidad

La auditoría es buena si:
1. Cada paso del flujo está descrito en lenguaje del usuario, no
   técnico.
2. Cada fricción cita el principio o regla concreta que viola
   (ej. "viola docs/product/04 § touch target ≥ 44pt").
3. Las fricciones observadas tienen fuente (ticket, sesión,
   métrica PostHog, autopsia del código).
4. Las hipótesis tienen un método de medición propuesto, no solo
   intuición.
5. La priorización P0–P3 es coherente con docs/product/03.
6. Cada intervención P0/P1 tiene métrica esperada + dirección + plazo.
7. Hay una sección "lo que NO recomiendo tocar" para resistir el
   impulso de proponer 20 mejoras.

## 7. Output esperado

### A. Mapa del flujo (móvil)

Pasos numerados, en lenguaje del usuario. Marca dónde está la "decisión
de compra" o el momento de máxima fricción.

### B. Hallazgos por paso

Para cada paso:

```
**Paso N — [Nombre]**
- Qué tiene que hacer / entender el usuario: [una línea]
- Cumple docs/product/04 (UX móvil)? [Sí / Parcial / No — citar regla]
- Cumple docs/product/01 (principios)? [Sí / Parcial / No — citar §]
- Fricciones detectadas: [bullets, marcando observada / hipótesis]
```

### C. Fricciones — observadas

| ID | Descripción | Evidencia | Principio violado | Prioridad |
|---|---|---|---|---|

### D. Fricciones — hipótesis

| ID | Descripción | Cómo medirla | Principio potencialmente violado | Prioridad |
|---|---|---|---|---|

### E. Intervenciones propuestas (solo P0 y P1)

Para cada intervención:

```
**INT-N — [Título corto]**
- Qué hace: [bullets, alcance ≤ 1 PR]
- Métrica que debería moverse: [exact name]
- Dirección + umbral esperado: [ej. "abandono en paso 3 baja ≥ 5pp"]
- Plazo de medición: [días tras shipping]
- Riesgo: [qué podría empeorar]
- Eventos PostHog necesarios: [lista o "ya cubiertos"]
```

### F. Lo que NO recomiendo tocar

Cosas que han salido en el análisis pero que no merecen la pena ahora:
- [Item — razón]

### G. Preguntas abiertas

- [Cosa concreta que no puedes auditar sin más información]

## 8. Checklist final

- [ ] Mapa del flujo en lenguaje de usuario, no técnico.
- [ ] Cada fricción cita principio o regla concreta.
- [ ] Observadas tienen evidencia; hipótesis tienen método de medición.
- [ ] Priorización P0–P3 coherente.
- [ ] Cada intervención P0/P1 cabe en ≤ 1 PR y tiene métrica + plazo.
- [ ] Sección F no vacía si se descartaron cosas obvias.
- [ ] No propusiste anti-patrones (urgencia falsa, etc.).

## 9. Qué NO debes hacer

- NO escribir un manual genérico de UX móvil. Auditas ESTE flujo.
- NO mezclar fricciones móvil con desktop. Si afecta solo desktop, lo
  dices y separas.
- NO proponer A/B test de cosas obvias (botón visible, no zoom en
  inputs). Esos se arreglan, no se testean.
- NO inventar eventos PostHog que no existen. Si haría falta uno,
  inclúyelo en "eventos PostHog necesarios" como pendiente.
- NO sugerir "consultar a un diseñador profesional" como
  recomendación. Da la recomendación tú, basada en docs/.
- NO hacer la auditoría sin haber simulado mentalmente o leído el
  flujo. Si no puedes verlo, dilo y pide acceso.
- NO etiquetar todo como P0; eso vacía la prioridad.

---

## INPUT

[Pega aquí: nombre del flujo o pantalla, captura/descripción si la hay,
lista de archivos / componentes implicados, y cualquier dato cuantitativo
que tengas (eventos PostHog, sesiones de soporte, etc.)]

````

---

## Notas para el humano que invoca el prompt

- Mejor antes de un sprint que dentro: si auditas mientras se construye, la auditoría se contamina con sunk cost.
- Combina bien con `create-github-issues.md`: las intervenciones P0/P1 son input directo para crear issues.
- Si vas a probar una intervención en producción, define la métrica **antes** de hacer el deploy, no después.
