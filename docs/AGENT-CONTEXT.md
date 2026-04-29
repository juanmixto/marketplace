# AGENT-CONTEXT — hechos densos para agentes

> **Para qué existe este archivo**: dar al agente el contexto mínimo necesario para tomar decisiones correctas **sin abrir 4 ficheros**. Cada línea de aquí es un hecho cerrado con enlace a la fuente. Si necesitas el matiz, abres el enlace; para el 80 % de las tareas, no hace falta.
>
> **Cuándo leerlo**: SIEMPRE antes de proponer features, escribir código de producto, abrir issues o priorizar trabajo. Sustituye al "lee 3 índices + 2 archivos" del contrato anterior.
>
> **Cuándo NO basta con este archivo**: si vas a tocar checkout, ficha de producto, ficha de productor, copy o onboarding, abre además [`product/02-flujos-criticos.md`](product/02-flujos-criticos.md). Si vas a tocar pricing, comisiones o devoluciones, abre [`business/04-modelo-negocio-comisiones.md`](business/04-modelo-negocio-comisiones.md).
>
> **Cómo se mantiene**: cada nuevo ADR cerrado o cada invariante técnica nueva añade UNA línea aquí, en su sección. Si una sección crece > 15 líneas, se parte. Esto NO es un índice de archivos — es un destilado de hechos.

---

## Qué somos / qué no

- Marketplace **digital curado** de productores artesanales españoles. Pre-tracción.
- Catálogo pequeño, seleccionado a mano, productores contactados de forma personal.
- **No somos**: Amazon, agregador, dropshipper, B2B, multi-país, multi-currency.
- Audiencia: comprador que valora origen y confianza > precio. Mobile-first.
- Prioridad #1 hoy: **validar demanda real**, no escalar.
- Fuente: [`AGENTS.md`](../AGENTS.md) § "Estado actual".

## Decisiones cerradas (no se reabren sin ADR)

| ADR | Decisión | Se revisa cuando |
|---|---|---|
| 001 | Catálogo curado, **no** self-service. | Curaduría se vuelve cuello de botella demostrable. |
| 002 | Pricing = **solo comisión por pedido**. Sin cuotas, sin freemium. | Productores demandan servicios premium reales. |
| 003 | **Mobile-first**. Decisión UX se valida en móvil antes que desktop. | Nunca, salvo cambio radical de mix de dispositivos. |
| 004 | **Cero paid acquisition** antes de validar conversión orgánica. | Conversión móvil orgánica > umbral 4 semanas. |
| 005 | **Solo producto físico**. Envío por productor. Sin logística propia. | Caso de negocio claro y volumen que lo justifique. |
| 006 | Onboarding de productor **asistido**, no self-service. | Hay listón de calidad codificado y verificable solo. |
| 007 | Devoluciones: **14 días, comprador paga vuelta** (salvo defecto). Reembolso ≤ 7 días. | Tasa devolución > 8 % durante 8 semanas. |
| 008 | Comisión **20–30 % caso por caso**, no flat. | > 25 productores activos o 3+ rechazos sostenidos del rango. |
| 009 | Atención al comprador: **email + formulario web únicamente**. SLA < 24h. | Equipo soporte ≥ 1 FTE. |

Detalles + alternativas consideradas: [`business/09-decisiones-estrategicas.md`](business/09-decisiones-estrategicas.md).

## Decisiones pendientes (no resueltas)

- **PEND-001**: ¿Pack es Product autocontenido o composición de Products? Bloquea épica E4. Se decide antes de E4-01 (post-soft-launch). [`business/09#PEND-001`](business/09-decisiones-estrategicas.md#pend-001--modelo-técnico-del-pack-sku-autocontenido-vs-composición).

## Filtro de features (las 4 preguntas)

Una feature solo entra al backlog si responde **sí a las cuatro**. Si una es "no", se documenta como hipótesis en [`business/08-roadmap-negocio.md`](business/08-roadmap-negocio.md) y NO se construye:

1. ¿Mueve métrica que importa **hoy**? (conversión móvil, productor activado, pedido completado, repetición).
2. ¿Existe el problema con catálogo y pedidos **actuales**? (no "cuando tengamos 10× productores").
3. ¿El coste de NO hacerla es **real y medible**? (no teórico).
4. ¿La versión más barata cabe en **≤ 1 PR**?

## Prioridades (orden, no lista)

1. Confianza visible (ficha + productor entendibles en 10 s en frío).
2. Checkout móvil sin fricciones (eliminar paso > añadir feature).
3. Onboarding de productor (publicar sin intervención manual).
4. Medición de demanda (PostHog en flujos críticos antes de optimizar).
5. Operaciones manuales hasta que duelan; automatizar solo cuando duele.

Todo lo demás (recomendadores, búsqueda avanzada, reviews, afiliados, app nativa) está **fuera** hasta que las cinco estén verdes.

## Flujos críticos (no pueden romperse)

- **CF-1** Descubrimiento → ficha → compra (frío, móvil).
- **CF-2** Pedido → productor → entrega.
- **CF-3** Onboarding de productor.
- **CF-4** Atención al comprador.
- **CF-5** Devolución / reembolso.

Cualquier cambio que toque uno requiere: test golden path + verificación manual en móvil real + mención en PR. Detalles: [`product/02-flujos-criticos.md`](product/02-flujos-criticos.md).

## Principios de producto (los duros)

- **Confianza > cleverness**: 5 señales visibles (productor, origen, fallo, plazo, coste) antes que cualquier algoritmo.
- **Conversión móvil manda**: mejora desktop que perjudica móvil = se descarta.
- **Nada bloquea descubrimiento**: sin muros de registro, sin paywalls, sin popups bloqueantes.
- **Checkout es sagrado**: no se añade paso sin medir, no se rompe sesión, cambios pasan revisión específica.
- **Honestidad operativa**: agotado se dice; plazo se dice **antes** del pago.
- **Cero estados raros**: nunca mostrar `PENDING_REVIEW`, stack traces, IDs internos al comprador.
- **Una acción por pantalla móvil**.
- **Feature solo con métrica definida antes** (PR documenta qué se mide y cuándo se retira si no se mueve).
- **ES por defecto**, otros idiomas como capa adaptada culturalmente.
- **A11y mínimo**: WCAG AA contraste, touch ≥ 44pt, teclado en críticos, labels reales.

Detalles: [`product/01-principios-producto.md`](product/01-principios-producto.md).

## Invariantes técnicas (las que rompen producción)

- **FK a User = `ON DELETE RESTRICT`** salvo erase contract documentado. CI lo audita. [`db-conventions.md`](db-conventions.md).
- **`findMany` paginado**: nada de `findMany` sin `take` o cursor en server-side. CI ratchet. [`db-conventions.md`](db-conventions.md).
- **Money**: `Decimal` en producto/pedido, `Int` céntimos solo en integraciones (Stripe). [`db-conventions.md`](db-conventions.md).
- **Webhooks idempotentes**: dedupe en `WebhookDelivery`, NO en `OrderEvent.payload`. [`orderevent-vs-webhookdelivery.md`](orderevent-vs-webhookdelivery.md).
- **Checkout idempotency**: `checkoutAttemptId` UNIQUE en `Order`; páginas que emiten token son `force-dynamic`. [`checkout-dedupe.md`](checkout-dedupe.md).
- **Authz por recurso**: cada server action / route handler valida rol **y** ownership. Test cross-tenant negativo obligatorio. [`authz-audit.md`](authz-audit.md).
- **State machines**: cualquier nuevo status mueve la guarda y el doc en el mismo PR. [`state-machines.md`](state-machines.md).
- **Feature flags**: `kill-*` default `true` (kill switch), `feat-*` default `false` (WIP gate, ticket de cleanup a 30 días). Fail-open. [`conventions.md`](conventions.md) § flags.
- **PWA SW denylist**: `/api`, `/admin`, `/vendor`, `/checkout`, `/auth` nunca cacheados. [`pwa.md`](pwa.md).
- **`headers()` antes de `unstable_cache`** en Next 16, o se rompe hidratación de PDP / cart / favorites (incidente #1042 → #1043).
- **PostHog en oncall**: scopes `checkout.*` y `stripe.webhook.*` no se renombran sin actualizar [`runbooks/payment-incidents.md`](runbooks/payment-incidents.md).

## Cosas que NO hacemos (anti-patrones repetidos)

- Tablas / campos / endpoints "por si acaso". Cada modelo Prisma necesita una pregunta de negocio que responda.
- Abstracciones para "futuros productores". Tres parecidos NO son un framework.
- Multi-currency, multi-país, B2B, recomendadores, programas de fidelización (todos pre-tracción = no).
- Nuevos proveedores externos (pagos, email, push, analytics) sin justificar en ADR.
- Web Push como canal vendor-crítico (Brave/iOS/Firefox no fiables — ver memoria).
- `--no-verify` en commits. Si un hook falla, se arregla la causa.
- `git stash` del WIP de otro agente. Multi-agente = worktrees aislados.

## Subsistemas con su propio runbook (abrir solo si tu tarea lo toca)

| Tarea toca... | Lee primero |
|---|---|
| Checkout, pago, webhook Stripe | [`runbooks/payment-incidents.md`](runbooks/payment-incidents.md), [`checkout-dedupe.md`](checkout-dedupe.md) |
| Auth, OAuth, signup | [`auth/audit.md`](auth/audit.md), [`adr/001-nextauth-prismaadapter-jwt.md`](adr/001-nextauth-prismaadapter-jwt.md) |
| Telegram ingestion | [`ingestion/telegram.md`](ingestion/telegram.md), [`ingestion/processing.md`](ingestion/processing.md) |
| DB schema / migración / FK | [`db-conventions.md`](db-conventions.md), [`runbooks/db-backup.md`](runbooks/db-backup.md) |
| Service worker / manifest | [`pwa.md`](pwa.md) |
| Rate limit / WAF / IP resolution | [`runbooks/under-attack.md`](runbooks/under-attack.md) |
| i18n / labelKey | [`../src/i18n/README.md`](../src/i18n/README.md) |
| Git workflow / hygiene | [`git-workflow.md`](git-workflow.md) |

## Multi-agente (antes de la primera tool call)

- `pwd` — NO trabajes en `/home/whisper/marketplace`. Worktree obligatorio.
- Worktree: `git worktree add /home/whisper/worktrees/<slug> -b <prefix>/<slug> origin/main`.
- `scripts/agents-status.sh` — survey de WIP de otros agentes antes de empezar.
- Guard activo: `~/.local/bin/git` bloquea `checkout/stash/rebase/...` en el repo principal cuando hay `CLAUDE_CODE_SESSION_ID`. Bypass: `CLAUDE_AGENT_BYPASS=1` (solo emergencia).
- Auto-merge convención: `gh pr merge --auto --squash --delete-branch`.

Detalles + rationale: [`AGENTS.md`](../AGENTS.md) § "Before your first tool call" + [`git-workflow.md`](git-workflow.md).
