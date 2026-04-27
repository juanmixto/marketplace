# Prompts — índice

Plantillas reutilizables para que un agente IA (Claude Code, Cursor, ChatGPT, copilots de IDE) opere sobre este repositorio sin perder contexto de negocio, producto o convenciones de código.

Cada prompt está pensado para **pegarse tal cual** al agente, sustituyendo solo los bloques marcados como `[INPUT]`. Cero placeholders vagos: si un campo está, es porque hay que rellenarlo con un dato concreto.

## Reglas globales que aplican a todos los prompts

Todo prompt asume que el agente:

1. **Lee `/AGENTS.md` primero.** Si la tarea es no trivial, además:
   - **Negocio** → `docs/business/00-index.md` y los archivos referenciados.
   - **UX o flujos** → `docs/product/00-index.md`.
   - **Código** → inspecciona el repo antes de proponer (no inventa archivos, funciones ni rutas).
2. **No inventa funcionalidades.** Si una pieza no está en el repo, lo dice y pregunta antes de seguir.
3. **No sobreingeniería.** Tres líneas similares no son una abstracción. Una feature solo entra al backlog si pasa los 4 criterios de `/AGENTS.md`.
4. **No issues genéricos.** Cada issue tiene: objetivo, contexto, tareas, criterios de aceptación y riesgos.
5. **Respeta las decisiones cerradas** en `docs/business/09-decisiones-estrategicas.md`. Si una propuesta las contradice, lo señala como conflicto en lugar de saltárselas.
6. **No optimiza para parecer útil.** Si todo está bien, lo dice. No fabrica objeciones para llenar espacio.

Cuando un prompt tiene reglas adicionales, están listadas dentro del prompt.

## Mapa de prompts

| Prompt | Cuándo usar | Output principal |
|---|---|---|
| [`create-github-issues.md`](create-github-issues.md) | Convertir ideas / feedback / notas en issues bien formados | Lista de issues + ideas aplazadas + conflictos con ADR |
| [`audit-business-alignment.md`](audit-business-alignment.md) | Auditar PR / backlog / feature contra la estrategia | Veredicto por elemento (SHIP / AJUSTAR / PARAR) |
| [`audit-mobile-conversion.md`](audit-mobile-conversion.md) | Revisar un flujo o pantalla en clave conversión móvil | Lista priorizada de fricciones + intervenciones |
| [`audit-marketplace-friction.md`](audit-marketplace-friction.md) | Diagnóstico transversal de fricciones reales en el marketplace | Heatmap por área + 5 acciones máximas, priorizadas |
| [`analyze-product-flow.md`](analyze-product-flow.md) | Análisis profundo de UN flujo concreto | Mapa del flujo + hallazgos + intervenciones P0/P1 |
| [`create-product-feature.md`](create-product-feature.md) | Diseñar una feature con alcance y métrica antes de codificar | Brief de feature listo para abrir issues |
| [`refactor-without-overengineering.md`](refactor-without-overengineering.md) | Refactor o limpieza sin acabar reescribiendo medio repo | Plan de refactor mínimo + lo que NO se toca |
| [`create-docs-from-decision.md`](create-docs-from-decision.md) | Convertir una decisión en ADR + actualizaciones de docs | ADR + diff propuesto en docs afectados |
| [`review-pr-before-merge.md`](review-pr-before-merge.md) | Revisión final antes de pulsar merge | Checklist con bloqueantes y comentarios |

## Cómo añadir un prompt nuevo

1. Crea el archivo `prompts/<verbo>-<objeto>.md`.
2. Sigue la plantilla común de los prompts existentes (9 secciones: rol, contexto, archivos a leer, objetivo, restricciones, criterios de calidad, output, checklist, no-hacer).
3. Añade una entrada al mapa de arriba con cuándo usarlo y qué devuelve.
4. Si el prompt depende de información volátil (KPIs concretos, lista de productores), recuérdaselo al agente y pídele preguntar, no inventar.
