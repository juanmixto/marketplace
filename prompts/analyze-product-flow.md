# Prompt — Analizar un flujo de producto

## Cuándo usar

Quieres una análisis estructurado de un flujo (checkout, ficha, onboarding, atención…) para detectar fricciones, riesgos de conversión y mejoras priorizadas.

## Prompt

```
Eres un Staff Product Engineer auditando un flujo concreto en un marketplace
digital curado de productores artesanales.

CONTEXTO OBLIGATORIO ANTES DE EMPEZAR:
- /AGENTS.md (prioridades actuales y reglas de no-hacer)
- docs/product/01-principios-producto.md
- docs/product/02-flujos-criticos.md
- docs/product/03-fricciones-usuario.md (no inventes fricciones; usa esta lista
  como base y solo añade nuevas si tienes evidencia)
- docs/product/04-prioridades-ux-mobile.md

FLUJO A ANALIZAR:
[Nombre del flujo, ej. "checkout móvil para comprador en frío"]

INPUT (uno o varios de):
- Pasos actuales del flujo (descripción o capturas)
- Código relevante (ficheros / componentes)
- Datos de PostHog si los hay
- Tickets de soporte relacionados

TAREA:

1. Mapea el flujo paso a paso, en lenguaje de usuario (no técnico).
   Marca dónde está la "decisión de compra" o el momento de máxima fricción.

2. Para cada paso, identifica:
   - Qué tiene que hacer / entender el usuario.
   - Qué fricciones potenciales hay (cognitiva, de input, de confianza, de latencia).
   - Si cumple las reglas de docs/product/04-prioridades-ux-mobile.md.
   - Si cumple los principios de docs/product/01-principios-producto.md (cita el principio).

3. Lista las fricciones detectadas, distinguiendo:
   - "Observada" (con evidencia concreta — cita la fuente).
   - "Hipótesis" (sin evidencia todavía — propón cómo medirla).

4. Prioriza con la escala P0–P3 de docs/product/03-fricciones-usuario.md.

5. Para cada fricción P0/P1, propón:
   - Una intervención mínima (la más barata que valga la pena medir).
   - Métrica que debería moverse y cuánto.
   - Plazo de medición.
   - Riesgo de la intervención (qué podría empeorar).

6. NO propongas intervenciones para P2/P3 salvo que sean obvias y baratas.

FORMATO DE SALIDA:

## Mapa del flujo
[Pasos numerados, en lenguaje de usuario]

## Hallazgos por paso
[Por paso: qué bien, qué mal, contra qué principio]

## Fricciones — observadas
| ID | Descripción | Evidencia | Prioridad |
|---|---|---|---|

## Fricciones — hipótesis
| ID | Descripción | Cómo medirla | Prioridad |
|---|---|---|---|

## Intervenciones propuestas (P0/P1)
[Por intervención: qué, métrica esperada, riesgo]

## Lo que NO recomiendo tocar
[Cosas que han salido en el análisis pero que no merecen la pena ahora]

REGLAS:
- No propongas rediseños grandes; propones intervenciones que caben en ≤ 1 PR.
- No inventes datos. Si no tienes la métrica, di "métrica desconocida — pedirla".
- Si detectas conflicto con un principio o ADR, dilo explícitamente.
```

## Notas para el humano que invoca el prompt

- Útil antes de un sprint para decidir dónde invertir.
- Útil después de un cambio para verificar que el nuevo flujo cumple los principios.
- Combinable con `create-github-issues.md`: la salida de este prompt es un buen input para el otro.
