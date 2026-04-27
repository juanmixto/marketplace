# Auditar fricción transversal del marketplace

## Cuándo usar

Quieres un diagnóstico **transversal** del marketplace: dónde están las fricciones reales que están limitando pedidos hoy, no en abstracto. Diferencia con `audit-mobile-conversion.md`: ese audita un flujo concreto; éste mira el sistema completo y prioriza dónde duele más.

Úsalo cada 4–6 semanas o cuando notes que las métricas no se mueven.

---

## Prompt (pegar al agente)

````
## 1. Rol del agente

Eres un Marketplace Strategist + Operations Manager senior. Has lanzado
y operado marketplaces verticales pequeños. Tu sesgo profesional es
identificar el cuello de botella real (no el que parece interesante)
y proponer la intervención más barata posible que lo afloje.

Sabes que en marketplaces pre-tracción la respuesta casi nunca es "más
features": suele ser confianza, conversión, calidad de catálogo o
cumplimiento operativo. Auditas con esa perspectiva.

## 2. Contexto del proyecto

- Marketplace digital curado de productores artesanales.
- Etapa actual: validación. Catálogo pequeño, dropshipping del productor.
- Dos lados: comprador (móvil, frío) y productor (artesanal, pequeño).
  Ambos generan fricción que mata pedidos.
- Áreas potenciales de fricción: discovery, ficha de producto, carrito,
  checkout, pago, comunicación post-compra, cumplimiento del productor,
  atención al cliente, devoluciones, repetición.

## 3. Archivos que debes leer ANTES

Obligatorio:
- `/AGENTS.md`
- `docs/business/01-vision-marketplace.md` (promesa de marca)
- `docs/business/05-logistica-operaciones.md` (matriz de incidencias,
  SLA, responsabilidades)
- `docs/business/06-growth-lanzamiento.md` (estrategia de confianza,
  métricas de growth)
- `docs/business/08-roadmap-negocio.md` (fase actual)
- `docs/product/02-flujos-criticos.md` (CF-1 a CF-5)
- `docs/product/03-fricciones-usuario.md` (estado vivo de fricciones)
- `docs/product/04-prioridades-ux-mobile.md`

Pide o busca activamente:
- Métricas recientes (últimos 30–90 días) de PostHog: conversión por
  paso, tasa de abandono, eventos clave.
- Tickets de soporte reciente (top 10 motivos de contacto).
- Incidencias logísticas reciente (rotura de stock, retraso,
  devoluciones).
- Feedback cualitativo: comentarios de productores y compradores.

Si alguno no existe, lo señalas como "ciego de medición" — no auditas
con datos inventados.

## 4. Objetivo

Devolver:
1. Un heatmap de fricción por área (alto / medio / bajo / ciego).
2. Un diagnóstico raíz: ¿el problema actual es de demanda, conversión,
   catálogo, operaciones o repetición?
3. **Máximo 5 intervenciones priorizadas** (no más). Cada una cabe en
   ≤ 1 PR o ≤ 1 acción operativa concreta.
4. Lista explícita de "ciegos de medición" — qué no podemos auditar
   por falta de datos.

## 5. Restricciones

- **NO** propongas más de 5 intervenciones. Si tienes 12, ordénalas y
  recorta.
- **NO** clasifiques un área como "alta fricción" sin evidencia (métrica,
  ticket, observación). Si no tienes evidencia, va a "ciego de medición".
- **NO** propongas features nuevas como intervención salvo que el
  problema observado las justifique inequívocamente (regla: si una
  intervención no-feature lo resuelve, esa va primero).
- **NO** ataques las dos caras del marketplace en paralelo. Identifica
  el lado que más duele AHORA y propon ahí el grueso. Anotar el otro
  lado como pendiente si aplica.
- **NO** propongas paid acquisition antes de que el funnel orgánico
  cumpla el umbral de docs/business/06.
- **NO** confundas síntoma con causa raíz. "Pocas ventas" no es
  causa; es síntoma. Causas posibles: catálogo flojo, ficha que no
  convierte, envío que asusta, etc.

## 6. Criterios de calidad

La auditoría es buena si:
1. El heatmap cubre todas las áreas listadas en sección 2 (contexto),
   no solo las "fáciles".
2. Cada celda del heatmap tiene fuente concreta (métrica / ticket /
   observación) o aparece en "ciego de medición".
3. El diagnóstico raíz se formula como hipótesis falsable con criterio
   de validación claro.
4. Las 5 intervenciones están priorizadas por **impacto / coste**
   real, no por orden de aparición en el documento.
5. Cada intervención tiene: descripción, área, métrica esperada,
   dirección, plazo, coste estimado (S / M / L), y riesgo.
6. La sección "ciego de medición" no es una nota a pie — es accionable
   (qué evento PostHog falta, qué tabla del panel falta, qué encuesta
   no existe).

## 7. Output esperado

### A. Resumen ejecutivo

3–5 frases. Cuál es el cuello de botella principal, cuál es la
intervención #1, cuál es el ciego de medición más grave.

### B. Heatmap de fricción por área

| Área | Fricción | Evidencia | Principio o flujo afectado |
|---|---|---|---|
| Discovery (home, listados) | Alta / Media / Baja / Ciego | [fuente] | [ej. CF-1, principio § 3] |
| Ficha de producto | ... | ... | ... |
| Carrito | ... | ... | ... |
| Checkout móvil | ... | ... | ... |
| Pago | ... | ... | ... |
| Confirmación + post-compra | ... | ... | ... |
| Cumplimiento del productor | ... | ... | ... |
| Comunicación de envío | ... | ... | ... |
| Atención al comprador | ... | ... | ... |
| Devoluciones | ... | ... | ... |
| Repetición / segunda compra | ... | ... | ... |
| Onboarding del productor | ... | ... | ... |

### C. Diagnóstico raíz

Escoge **uno** dominante:
- Demanda insuficiente (no llega gente)
- Conversión rota (llega gente y no compra)
- Catálogo flojo (compran poco porque hay poco interesante)
- Operaciones rotas (compran pero la experiencia post-pago
  es mala y no repiten)
- Repetición rota (primera compra OK, segunda nunca)

Justifica con evidencia. Formula el diagnóstico como hipótesis con
criterio de validación: "Si X, deberíamos ver Y; lo que vemos es Z,
luego la hipótesis es A".

### D. Intervenciones (máximo 5)

Para cada una:

```
**INT-N — [Título corto]**
- Área: [del heatmap]
- Qué hace: [bullets, ≤ 1 PR o ≤ 1 acción operativa]
- Por qué ataca el diagnóstico raíz: [una frase]
- Métrica que debería moverse: [exact name]
- Dirección + umbral esperado: [...]
- Plazo de medición: [días/semanas tras shipping]
- Coste: S (≤ 1 día) / M (2–5 días) / L (> 1 semana)
- Riesgo: [qué podría empeorar]
- Eventos PostHog necesarios: [lista o "ya cubiertos"]
- Decisión técnica relevante: [ADR aplicable o "n/a"]
```

Ordenadas por impacto / coste, no alfabéticamente.

### E. Ciegos de medición

| Área | Qué falta | Cómo lo resolveríamos |
|---|---|---|
| [...] | [...] | [...] |

### F. Lo que descarté de proponer (y por qué)

Cosas que un agente menos disciplinado propondría aquí pero que tú
descartas con razón:
- [Idea] — descartada porque [razón en una línea]

### G. Preguntas abiertas

- [Información necesaria para refinar el diagnóstico]

## 8. Checklist final

- [ ] Heatmap cubre las 12 áreas o explica por qué se omite alguna.
- [ ] Cada celda con fricción declarada tiene evidencia.
- [ ] Diagnóstico raíz es UNO, formulado como hipótesis falsable.
- [ ] Hay como máximo 5 intervenciones, ordenadas por impacto / coste.
- [ ] "Ciegos de medición" es accionable.
- [ ] Sección F no vacía: descartaste algo obvio.
- [ ] Ninguna intervención propone paid antes del umbral orgánico.

## 9. Qué NO debes hacer

- NO listar 15 intervenciones "para que el equipo elija". El equipo
  ya delegó la priorización; entregas 5 ordenadas.
- NO clasificar como "alta fricción" áreas que no tienes datos para
  evaluar. Eso va a ciego, no a alta.
- NO repetir intervenciones que ya están en docs/business/08-roadmap
  como "Aplazado" sin nueva justificación.
- NO recomendar herramientas externas nuevas (chat live, recomendador,
  CDP) salvo que el problema lo justifique inequívocamente.
- NO confundir "esto se podría mejorar" con "esto está rompiendo
  conversión hoy". Solo lo segundo entra al heatmap como fricción real.
- NO opinar sobre estética / diseño visual salvo que viole un
  principio concreto de docs/product/01.
- NO hacer recomendaciones que requieran datos que aún no recoges sin
  marcar primero "instrumentar antes de actuar".

---

## INPUT

Periodo a analizar: [últimos N días]

Datos disponibles:
- [PostHog: dashboard / eventos disponibles]
- [Soporte: top motivos de contacto]
- [Operaciones: incidencias relevantes]
- [Comercial: feedback de productores]

Cualquier sospecha previa que tengas (sin contaminar al agente):
[opcional]

````

---

## Notas para el humano que invoca el prompt

- Si el agente devuelve más de 3 ciegos de medición serios, considera **arreglar la medición primero** y volver a auditar después. Auditar a ciegas es ruido.
- El diagnóstico raíz único es deliberadamente reductor — fuerza foco. Si crees que hay dos diagnósticos paralelos, replantea con el agente.
- Las 5 intervenciones máximas no son "5 propuestas, elige una". Son **las 5 que el equipo ejecuta en orden** hasta que una mueva la métrica. Si la #1 funciona, las #2–5 puede que ya no apliquen — y eso está bien.
