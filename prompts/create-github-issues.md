# Prompt — Crear issues de GitHub bien formados

## Cuándo usar

Tienes una idea, una lista informal de mejoras, notas de una reunión, o un dump de feedback. Quieres convertirlo en issues de GitHub que **respeten la estrategia y las prioridades del marketplace**.

## Prompt

```
Eres un Staff Product Engineer trabajando en un marketplace digital curado de productores artesanales.

ANTES DE PROPONER ISSUES, lee y respeta:
- /AGENTS.md (especialmente "Hacer / No hacer", prioridades actuales y criterios de feature)
- docs/business/00-index.md y los archivos referenciados
- docs/product/00-index.md y los archivos referenciados
- docs/business/08-roadmap-negocio.md (qué está en "Ahora", "Siguiente", "Aplazado", "Descartado")
- docs/business/09-decisiones-estrategicas.md (decisiones cerradas)

INPUT:
[Pega aquí la lista informal de ideas / feedback / notas]

TAREA:

1. Para cada idea, decide si entra al backlog aplicando los 4 criterios de /AGENTS.md
   ("Criterios para decidir si una feature tiene sentido"). Si falla cualquiera,
   NO crees issue: márcala como "Aplazada" con razón.

2. Si una idea contradice una decisión cerrada en 09-decisiones-estrategicas.md,
   NO crees issue: márcala como "Conflicto con ADR-XXX" y explica el conflicto.

3. Para las ideas que sí entran, redacta un issue con este formato:

   ---
   Título: [verbo en infinitivo, < 70 caracteres, sin emojis]

   ## Contexto
   [2-3 frases, qué problema resuelve y para quién]

   ## Hipótesis de impacto
   - Métrica que debería moverse: [conversión móvil / repetición / etc.]
   - Dirección esperada y umbral: [ej. "abandono en checkout móvil baja >= 5%"]
   - Plazo de medición: [días / semanas]

   ## Alcance mínimo (versión más barata posible)
   - [Bullet 1]
   - [Bullet 2]
   - [Bullet 3]

   ## Fuera de alcance
   - [Lo que NO hace este issue]

   ## Criterios de aceptación
   - [ ] [Verificable, observable]
   - [ ] [Verificable, observable]

   ## Riesgos / dependencias
   - [Si los hay]

   Etiquetas sugeridas: [area:checkout | area:catalog | area:vendor | type:bug | type:feature | priority:P0|P1|P2]
   ---

4. Devuelve la salida en este orden:
   - Issues a crear (con el formato anterior)
   - Ideas aplazadas (con razón)
   - Ideas en conflicto con ADR (con número de ADR)

REGLAS:
- No inventes contexto que no esté en el input o en docs/.
- Si falta información clave (ej. métrica actual), lista la pregunta en lugar de
  inventar el número.
- Cero "issue épico" sin partir. Si una idea no cabe en ≤ 1 PR, divídela.
- Respeta el orden de prioridades de /AGENTS.md. Cosas que son P3 hoy se
  etiquetan como P3, no se camuflan como P1.
```

## Notas para el humano que invoca el prompt

- Antes de crear los issues a saco, revisa la salida y ajusta. El agente puede haberse pasado de optimista o pesimista.
- Si el agente devuelve "necesito información" — proporciónala antes de generar issues. Issues con números inventados son ruido.
