# Estado Actual de Morfx — 19 de Febrero 2026

## Resumen Ejecutivo

Morfx es una plataforma SaaS de CRM + WhatsApp + Automatizaciones + Agentes IA construida para e-commerce COD (contra-entrega) en Colombia. En 23 dias de desarrollo (26 enero - 18 febrero 2026) se completaron 2 milestones mayores (v1.0 CRM+WhatsApp, v2.0 Agentes+Automatizaciones) con 33 fases, 151 planes ejecutados, 441+ commits y 92K LOC TypeScript.

El sistema esta **funcional en produccion** con el core completo: CRM multi-tenant, inbox WhatsApp con 360dialog, agente de ventas Somnio con IA (Claude), motor de automatizaciones con 13 triggers y 11 acciones, builder de automatizaciones con IA, integracion Shopify y SMS via Twilio. El domain layer (8 modulos, 32 funciones) es el single source of truth para todas las mutaciones.

Existen **69 issues documentados** en auditorias previas (25 de automaciones, 16 runtime, 11 seguridad, 5 hotfixes, 7 consistencia, 5 duplicaciones). Muchos fueron identificados pre-v2.0 y pueden estar resueltos; requieren verificacion cruzada con el codigo actual.

---

## Modulos del Sistema

### 1. CRM (Contactos, Pedidos, Productos)
- **Estado:** ✅ Funcional

#### Contactos (`src/lib/domain/contacts.ts`, `src/app/(dashboard)/crm/contactos/`)
- **CRUD completo:** Crear, editar, eliminar contactos con normalizacion E.164 de telefono
- **Tags:** Asignar/remover tags compartidos entre contactos, pedidos y conversaciones
- **Campos custom:** JSONB con definiciones tipadas (text, number, date, select, checkbox, URL, email, phone, currency, percentage, file, contact link)
- **Notas:** Timeline de notas con actividad automatica (trigger DB para diffs JSONB)
- **Historial:** Activity log automatico via trigger PostgreSQL
- **Import/Export:** CSV con BOM para Excel, batch inserts de 100
- **Busqueda:** Fuse.js client-side para <10K contactos
- **Vista detalle:** 5 tabs (Info, Tareas, Campos, Notas, Historial)
- **Funciona:** Todo lo listado arriba
- **Dummy/incompleto:** Nada
- **Bugs conocidos:** Phone no normalizado en `bulkCreateContacts` (D-5 audit)

#### Pedidos/Ordenes (`src/lib/domain/orders.ts`, `src/app/(dashboard)/crm/pedidos/`)
- **CRUD completo:** Crear, editar, eliminar, duplicar ordenes
- **Kanban:** Drag-and-drop con @dnd-kit, multi-pipeline, WIP limits por etapa
- **Productos:** Line items con snapshot pricing (precio al momento de la orden)
- **Etapas/Pipelines:** Configurables por workspace, order states con emoji
- **Tags de ordenes:** Junction table separada
- **Duplicacion:** Copy flags (copyContact, copyProducts, copyValue, copyTags)
- **Paginacion:** `getOrdersForStage(stageId, limit=20, offset=0)` para Kanban performante
- **Campos reales:** orders.name, orders.shipping_department (migration 20260217)
- **Recompra (quick-043, 2026-04-15):** Boton "Recompra" restringido al pipeline `Ventas Somnio Standard` (constante `RECOMPRA_PIPELINE_NAME` en `src/lib/domain/orders.ts`). UI filtra etapas al pipeline unico y usa `ProductPicker` para seleccion manual multiple (ya no copia productos del pedido origen). Defense-in-depth: domain valida nombre de pipeline + stage ∈ pipeline. Botones deshabilitados en 3 UIs (orders-table, orders-view/kanban, contact-panel WhatsApp, view-order-sheet) si el workspace no tiene ese pipeline.
- **CRM Stage Integrity (standalone, shipped 2026-04-22):** defensa en 6 capas contra "pedidos que se devuelven" (reportado 2026-04-21). Todas las capas operativas con flags `OFF` por default (Regla 6 rollout gradual):
  1. **Domain CAS** — `src/lib/domain/orders.ts moveOrderToStage` usa optimistic compare-and-swap (`.eq('stage_id', previousStageId).select('id')`). Flag `crm_stage_integrity_cas_enabled` en `platform_config`, default `false`.
  2. **Audit log append-only** — tabla `order_stage_history` con RLS `FOR DELETE/UPDATE USING (false)` + trigger plpgsql `prevent_order_stage_history_mutation`. Poblada desde primer move post-deploy (additive, sin flag).
  3. **Inngest concurrency per-orderId** — `automation-runner.ts` serializa eventos `order.stage_changed` del mismo `orderId` con FIFO guaranteed (stacked array con 2 scopes: workspaceId + orderId). Sin flag, additive.
  4. **Runtime kill-switch** — mismo runner consulta `order_stage_history` en ultimos 60s; si >5 cambios no-manuales, skippea. Flag `crm_stage_integrity_killswitch_enabled` default `false`.
  5. **Build-time cycle detection** — `src/lib/builder/validation.ts conditionsPreventActivation` recursiva (AND/OR) + 9 operators + 5 field namespaces. Sin flag, pure function.
  6. **Kanban Realtime + toast rollback** — `src/hooks/use-kanban-realtime.ts` nuevo + `kanban-board.tsx` muestra toast "Este pedido fue movido por otra fuente" cuando CAS rechaza el move (via pure helper `handleMoveResult` exportado para unit tests). Sin flag, additive.
  - **Rollout:** observar audit log 24-48h → flipear CAS flag en staging → smoke test 2 browsers → flipear kill-switch → rollout global.
  - **Referencia:** `.planning/standalone/crm-stage-integrity/LEARNINGS.md` para rollout guide paso a paso + SQL flip queries.
- **Funciona:** Todo lo listado
- **Bugs conocidos:** Orders auto-refresh en WhatsApp inbox resuelto con polling 30s (Realtime no confiable con filtros non-PK)

#### Productos (`src/app/(dashboard)/crm/productos/`)
- **Catalogo:** CRUD completo con SKU, activo/inactivo
- **Shopify sync:** shopify_product_id para matching

#### Configuracion CRM
- **Pipelines:** CRUD completo (`/crm/configuracion/pipelines`)
- **Campos custom:** Manager completo (`/crm/configuracion/campos-custom`)
- **Estados de pedido:** Emoji-based indicators (`/crm/configuracion/estados-pedido`)

---

### 2. WhatsApp
- **Estado:** ✅ Funcional

#### Integracion 360dialog (`src/lib/whatsapp/`)
- **Envio texto:** `sendTextMessage()` via 360dialog Cloud API
- **Envio media:** Imagen, video, audio, documento, sticker con captions
- **Envio templates:** Templates Meta-aprobados con componentes dinamicos
- **Envio interactivo:** Botones (max 3, auto-truncados a 20 chars)
- **Recepcion:** Todos los tipos: texto, imagen, video, audio, documento, sticker, ubicacion, contactos, interactive replies, reacciones
- **Deduplicacion:** wamid unique constraint previene duplicados en reintentos
- **Media hosting:** Download de 360dialog (URLs expiran 5min) → re-host en Supabase Storage permanente
- **Costos:** Tracking por mensaje/pais/categoria (marketing, utility, authentication, service)

#### Inbox (`src/app/(dashboard)/whatsapp/`)
- **Conversaciones:** Lista con busqueda, filtros por estado/asignado
- **Chat:** Historial de mensajes con virtual scrolling
- **Quick replies:** Shortcuts (`!promo`) con media opcional (imagenes)
- **Templates:** Gestion completa (crear, editar, sync con 360dialog, estados PENDING/APPROVED/REJECTED)
- **Equipos:** Teams con assignment round-robin, last_assigned_at tracking
- **Emoji picker:** frimousse (2kb, React 19 compatible)
- **Envio optimistico:** Mensaje aparece instantaneamente con status 'sending', reemplazado por Realtime INSERT
- **Agent config:** Toggle agente por conversacion

#### Seguridad Webhook (`src/app/api/webhooks/whatsapp/route.ts`)
- **HMAC-SHA256:** Verificacion con timing-safe comparison
- **Token verification:** hub.verify_token para challenge
- **60s timeout:** Extendido para procesamiento de agente

#### Performance (Standalone Phase)
- **Canal consolidado:** 4 channels Realtime → 1 (`inbox:${workspaceId}`)
- **Updates quirurgicos:** No full refetch, spread payload.new
- **Query ligero:** Sin address/city en lista, solo id/name/color en tags
- **Funciona:** Todo lo listado
- **Bugs conocidos:**
  - Rate limiting no implementado en API de envio (W-1 audit)

#### UI Editorial v2 — Inbox Re-skin (in rollout, 2026-04-22)

- **Standalone:** `.planning/standalone/ui-redesign-conversaciones/` — 6 plans (01 infra → 05 polish) + 06 DoD/docs.
- **Status:** ✅ SHIPPED detrás de feature flag per-workspace (Regla 6). Default `false` en todos los workspaces. Production deploy: 2026-04-22 (commits `1d72504` → `0e6c703` en `main`).
- **Primera activación productiva:** workspace **Somnio** (id `a3843b3f-c337-4836-92b5-89c58bb98490`) activado 2026-04-22 después de QA lado a lado aprobado por el usuario en Vercel prod.
- **Scope confinado:** SOLO ruta `/whatsapp` (D-07). Sidebar global, módulos CRM/Tareas/Automatizaciones/etc. intactos — ver standalone futuro `ui-redesign-dashboard-chrome`.
- **Dark mode:** explícitamente forzado a light dentro de `.theme-editorial` (UI-SPEC §12.4). El toggle global `next-themes` no invierte los tokens paper/ink/rubric.

**Feature flag:** `workspaces.settings.ui_inbox_v2.enabled` (boolean, JSONB).

**Activación per-workspace (manual via SQL — UI admin diferida a standalone futuro):**

```sql
-- IMPORTANTE: dos jsonb_set anidados o COALESCE para parent key.
-- Un jsonb_set plano NO crea llaves intermedias inexistentes.
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_inbox_v2,enabled}',
  'true'::jsonb,
  true  -- create_missing = true para crear `ui_inbox_v2` como parent si no existe
)
WHERE id = '<workspace-uuid>';
```

**Rollback inmediato (cero downtime, cero migración):**

```sql
UPDATE workspaces
SET settings = jsonb_set(settings, '{ui_inbox_v2,enabled}', 'false'::jsonb)
WHERE id = '<workspace-uuid>';
```

**Componentes re-skineados (8 archivos visuales):**
- `inbox-layout.tsx` — wrapper `.theme-editorial` condicional + `Esc` keyboard shortcut (cierra drawer <1280px)
- `conversation-list.tsx` — header eyebrow "Módulo · whatsapp" + display title "Conversaciones" (EB Garamond 26px) + 4 tabs underlined (Todas / Sin asignar / Mías / Cerradas) + search editorial + shortcuts `/` (focus search) + `[`/`]` (prev/next conversación) + empty states D-15/D-16 + loading skeletons `.mx-skeleton` (6 items)
- `conversation-item.tsx` — avatar paper-3 con borde ink-1, selected rail 3px rubric-2 con compensación pl-[13px], unread dot 8px (≤9) / pill 22px (>9) / "99+" (>99), timestamp JetBrains Mono 11px
- `chat-view.tsx` — DaySeparator editorial em-dash smallcaps (`— Martes 21 de abril —`) + 3 bubble skeletons alternando + `role="log"` + `aria-live="polite"` + **fix universal del bug `hsl(var(--background))`** (aplica a slate Y editorial — tokens shadcn post-v4 son bare OKLCH, el wrapper `hsl()` era inválido)
- `chat-header.tsx` — avatar ink-1 sólido, eyebrow "Contacto · activo", nombre EB Garamond 20px, meta JetBrains Mono 11px, hard rule border-b ink-1, 9 aria-labels universales, DropdownMenu portal re-rooting para AssignDropdown
- `contact-panel.tsx` — paper-2 bg, section headings smallcaps (tracking 0.12em), `<dl>` grid 1fr/1.4fr para dirección/ciudad, order cards rounded-xl, MxTag stage pills (gold/verdigris/rubric/indigo/ink mapeados por nombre de stage), 6 aria-labels adicionales. **839 → 1132 LOC puramente aditivo — cero refactor estructural (D-20 preservado).**
- `message-bubble.tsx` — radius 10px con corner 2px (letter/note shape, UI-SPEC §5.1 pixel-perfect), padding 10x14, paper-0/ink-1 fills, eyebrow ❦ "bot · respuesta sugerida" smallcaps rubric-2 serif cuando `isAgentMessage`
- `message-input.tsx` — composer con hard rule ink-1 border-top, input paper-1 (jerarquía dentro de paper-0), Send button ink-1 sólido con label "Enviar" + press affordance `translate-y-px`, rubric-tinted 24h-closed banner con `AlertTriangle` (D-17 pattern), `aria-label="Enviar mensaje"` universal

**Componentes/archivos nuevos (6):**
- `src/lib/auth/inbox-v2.ts` — resolver server-side `getIsInboxV2Enabled(workspaceId)` fail-closed (mirror de `getIsSuperUser`)
- `src/app/(dashboard)/whatsapp/fonts.ts` — EB Garamond (400/500/600/700/800 + italic) + Inter variable + JetBrains Mono (400/500) via `next/font/google` **per-route** (no se cargan en otras rutas del dashboard — ahorra ~150KB). Cormorant Garamond NO se carga (cascade fallback a EB Garamond, UI-SPEC §6.3).
- `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx` — `InboxV2Provider` + hook `useInboxV2()` para gate de NEW JSX sin prop drilling
- `src/app/(dashboard)/whatsapp/components/mx-tag.tsx` — pill editorial wrapper, 5 variants (rubric/gold/indigo/verdigris/ink)
- `src/app/(dashboard)/whatsapp/components/icon-button.tsx` — 32×32 ibtn con `aria-label` como prop OBLIGATORIO (TS compile error si se omite — D-24)
- `src/app/(dashboard)/whatsapp/components/day-separator.tsx` — separador editorial `— EEEE d 'de' MMMM —` con `date-fns` + locale `es`

**Cambios CSS (bloque único):**
- `src/app/globals.css` — bloque `.theme-editorial { ... }` (~310 líneas) con tokens custom paper/ink/rubric/accent-verdigris/gold/indigo + shadcn semantic token overrides (`--primary` → `--ink-1`, `--destructive` → `--rubric-2`, `--background` → `--paper-1`, etc. — 60/30/10 color contract preservado) + utilities `mx-*` scoped (display/h1..h4/body/caption/smallcaps/rubric/marginalia/mono/rule*/tag/tag--*/skeleton) + `@keyframes mx-pulse` + `prefers-reduced-motion` auto-disable
- Preserva `:root` shadcn-slate intacto fuera del scope (Regla 6 zero-regression)
- Shadcn primitives extendidos con prop opcional `portalContainer` (aditivo, byte-identical default): `src/components/ui/dropdown-menu.tsx` (Plan 04) + `src/components/ui/popover.tsx` (Plan 05) para re-rooting de portales Radix dentro de `.theme-editorial`

**Out-of-scope (diferidos):**
- Modales y sheets internos (NewConversationModal, TemplateSendModal, ViewOrderSheet, CreateContactSheet, CreateOrderSheet, AgentConfigSlider) — fase de seguimiento `ui-redesign-conversaciones-modales`
- Sidebar global re-skin + lockup `morf·x` — standalone `ui-redesign-dashboard-chrome`
- Dark mode editorial — explícitamente fuera de scope v1 (handoff §8)
- `<Brand />` component — depende de sidebar global
- Refactor estructural de `contact-panel.tsx` — preservado por D-20 (solo re-skin local)
- **D-17 channel-down banner** DIFERIDO: `useConversations` y `useMessages` NO exponen signal de conexión (`isConnected`). Extenderlos violaría D-19. Requiere follow-up que extienda los hooks con `isConnected: boolean` sourcing del Supabase Realtime channel state (que sí expone `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` pero no los surfacea a consumers).
- **D-18 snoozed state** DIFERIDO con artifact: `ConversationWithDetails` no expone field `bot_mute_until`. Ver `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` para checklist de 7 pasos de un-defer (migration → type → hook SELECT → domain mutation → server action → UI trigger → agent rule).

**Stack aditivo cero npm packages.** Todas las fuentes via `next/font/google` (zero install). Lucide `AlertTriangle` + `Moon` ya estaban en deps.

**Reglas verificadas:**
- **Regla 6 (proteger agente productivo):** 18 paths NO-TOUCH verificados con `git diff main` → **0 líneas cambiadas** en hooks (`use-conversations.ts`, `use-messages.ts`), realtime, action handlers, webhooks, `DebugPanelProduction`, `AgentConfigSlider`, `AvailabilityToggle`, `WindowIndicator`, `BoldPaymentLinkButton`, sheets, `conversation-tag-input`, `src/lib/agents/`, `src/lib/inngest/`, `src/lib/domain/`, `src/components/layout/sidebar.tsx`. Verificable en `dod-verification.txt` Check 4.
- **Regla 1 (push a Vercel):** commits Plan 01-06 pusheados a `origin main` 2026-04-22.
- **Regla 4 (docs):** este documento actualizado.

**DoD UI-SPEC §16 (12 items):** ✅ verificados — ver `.planning/standalone/ui-redesign-conversaciones/06-SUMMARY.md` + `dod-verification.txt` + `axe-report.txt` + QA aprobado por el usuario en Vercel prod con Somnio workspace.

---

### 2.5. Client Activation Badge
- **Estado:** ✅ Funcional

#### Configuracion (`/settings/activacion-cliente`)
- **is_client flag:** Campo boolean en contacts, activado por trigger DB cuando orden llega a etapa configurable
- **client_activation_config:** Tabla por workspace con enabled, all_are_clients, activation_stage_ids[]
- **Trigger DB:** `mark_client_on_stage_change()` — INSERT OR UPDATE en orders, chequea config y marca is_client + tag "Cliente"
- **Badge visual:** Circulo amber-500 con check en bottom-left del avatar en inbox WhatsApp
- **all_are_clients:** Modo frontend-only que muestra badge para todos sin escribir DB
- **Backfill:** Recalcula is_client para todo el workspace cuando cambian los stage_ids configurados
- **Realtime:** Listener en contacts.is_client para propagacion instantanea del badge
- **Backward compat:** Sigue asignando tag "Cliente" automaticamente

---

### 3. Agentes IA
- **Estado:** ✅ Funcional (session lifecycle bug corregido en Phase 42, completada 2026-04-07)

#### Agente Somnio (`src/lib/agents/somnio/`)
- **Proposito:** Bot de ventas para Somnio (almohadas) via WhatsApp
- **Intents:** 33 intents detectados (13 informativo, 8 flujo_compra, 1 escape, 11 combinaciones)
- **Intent detection:** IntentDetector con Claude Sonnet, confidence routing (proceed/clarify/handoff/reanalyze)
- **Data extraction:** 8 campos (nombre, telefono, direccion, ciudad, departamento, indicaciones, pack, cantidad)
- **Clasificacion ingest:** 4 categorias (datos=silencio, pregunta=responder, mixto=ambos, irrelevante=ignorar)
- **Templates:** Selection por intent + visit_type (primera_vez vs siguientes), configurable en DB
- **Orchestrator:** Claude Sonnet decide acciones basado en intent + conversation state
- **System prompts:** Intent (103L), Orchestrator (223L), Data Extractor (302L)

#### Agente Somnio Recompra (`src/lib/agents/somnio-recompra/` — standalone `somnio-recompra-v1`)
- **Proposito:** Bot de recompra para clientes Somnio que ya compraron (flujo simplificado, datos preloaded via crm-reader).
- **Catalogo independiente** desde 2026-04-23 (phase standalone `somnio-recompra-template-catalog` SHIPPED): `agent_id='somnio-recompra-v1'` en `agent_templates` con 34+ filas. Ya NO comparte catalogo con `somnio-sales-v3` (fix provisional commit `cdc06d9` revertido; `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` locked).
- **State machine:** `resolveTransition` en `transitions.ts` — 2 escenarios initial: (1) `quiero_comprar` → `preguntar_direccion` con timerSignal L5 (D-04), (2) `datos` espontaneos → `ofrecer_promos` si datosCriticos. Saludo NO dispara accion (D-05): cae a response-track como informational, emitiendo texto CORE + imagen ELIXIR COMPLEMENTARIA.
- **`{{direccion_completa}}`:** `[direccion, ciudad, departamento].filter(Boolean).join(', ')` — incluye departamento desde D-12.
- **INFORMATIONAL_INTENTS (10):** saludo, precio, promociones, pago, envio, ubicacion, contraindicaciones, dependencia, tiempo_entrega, registro_sanitario.
- **Tests:** 4 test suites (32 tests) en `__tests__/` — transitions.test.ts (9) + response-track.test.ts (6) + crm-context-poll.test.ts (7) + comprehension-prompt.test.ts (10).

#### UnifiedEngine (`src/lib/agents/engine/unified-engine.ts`)
- **Arquitectura:** Ports/Adapters (Hexagonal) — 1 engine, 2 modos
- **Sandbox adapters:** In-memory state, no-op timers, display messaging, dry-run orders, debug collection
- **Production adapters:** SessionManager + Supabase, Inngest timers, WhatsApp messaging, real CRM orders, audit logging
- **Optimistic locking:** Version counter con retry (hasta 3 intentos)
- **Timer signals:** start/cancel/reevaluate propagados a adaptadores

#### OrderManagerAgent (`src/lib/agents/crm/order-manager/`)
- **Proposito:** Crea ordenes desde agente conversacional
- **Modos:** dry-run (mock) y live (real DB)
- **Tools:** crm.contact.create, crm.tag.add, crm.order.create

#### Agent Sandbox (`src/app/(dashboard)/sandbox/`)
- **Multi-panel debug:** Tools, Estado, Intent, Tokens, Ingest (max 3 panels)
- **CRM agent selection:** Dropdown con agentes registrados
- **DRY/LIVE badges:** Transparencia de modo
- **Per-model tokens:** Haiku vs Sonnet breakdown
- **Response speed:** Configurable (instant/normal/slow)
- **Session management:** Save/load sessions

#### Agent Config (`src/app/(dashboard)/agentes/`)
- **Metrics dashboard:** Performance por periodo
- **Config panel:** System prompt, tool availability (admin/owner only)
- **Per-workspace:** workspace_agent_config table

#### Timer System (Inngest)
- **5 niveles:** L0 (waiting) → L1 (partial) → L2 (escalate promos) → L3 (order/timeout) → L4 (final confirm)
- **Production:** Inngest durable events con step.waitForEvent() + step.sleep()
- **Sandbox:** Client-side simulation con IngestTimerSimulator
- **Cancel-before-start:** Pattern obligatorio para evitar duplicados

#### Funciona
- Intent detection + orchestration completo
- Data extraction con silent accumulation
- Template selection + substitution
- Timer system (sandbox + production)
- Order creation end-to-end
- WhatsApp integration bidireccional
- Sandbox testing environment

#### Bugs documentados (auditorias previas, verificar si resueltos)
- 6 stale closures en sandbox-layout.tsx (BUGS.md #1-3, #7)
- State mutation en sandbox-engine.ts (BUGS.md #4) — puede ser obsoleto tras UnifiedEngine
- Message sequencer race condition (BUGS.md #6)
- Template manager query injection (BUGS.md #11) — verificar si resuelto en domain layer

#### Bugs resueltos (hotfix 20 feb 2026)
- ~~ProductionOrdersAdapter no pasaba name, shippingCity, shippingDepartment a domainCreateOrder~~ — Resuelto: campos ahora se mapean desde datosCapturados
- ~~OrderCreator.updateContact no pasaba department al tool handler~~ — Resuelto: department ahora se incluye en crm.contact.update
- ~~contactUpdate tool handler no aceptaba ni delegaba department~~ — Resuelto: tipo ContactUpdateInput + domain call actualizados
- ~~webhook-processor no sincronizaba conversation.contact_id despues de order creation~~ — Resuelto: paso 9 actualiza contact_id si engine resolvio contacto diferente

#### Bugs resueltos (Phase 42, 2026-04-07 — Session Lifecycle)
- ~~`agent_sessions` nunca se cerraban en runtime~~ — Resuelto: nuevo cron Inngest `closeStaleSessionsCron` corre 02:00 COT diario y cierra sesiones con `last_activity_at < midnight Bogota`. RPC `close_stale_agent_sessions` con TZ-safe boundary
- ~~Clientes recurrentes bloqueados con error 23505~~ — Resuelto: partial unique index `(conversation_id, agent_id) WHERE status='active'` permite N filas historicas, solo 1 activa. `SessionManager.createSession` ahora hace retry-via-fetch en 23505
- ~~Bot permanentemente mudo tras decir "no" una vez~~ — Resuelto indirectamente: nuevas sesiones nacen con `accionesEjecutadas=[]`, asi `derivePhase()` no queda fossilizado en `'closed'`
- ~~Clientes con `handed_off` previo no podian reactivar conversacion~~ — Resuelto: el partial unique index ya no choca con filas `handed_off`. Validado en UAT con caso real (cliente con handed_off de 4 dias atras envio mensaje y bot respondio limpio)
- **Defensive timer-guard:** Helper `timer-guard.ts` agregado a 6 handlers V1+V3 (collecting_data, promos, resumen, cancel, etc.) hace early-return si la sesion fue cerrada por el cron mientras el timer dormia

---

### 4. Automatizaciones
- **Estado:** ✅ Funcional

#### Motor de Automatizaciones (`src/lib/automations/`)

**13 Triggers (`TRIGGER_CATALOG`):**

| Trigger | Categoria | Config |
|---------|-----------|--------|
| `order.stage_changed` | CRM | pipelineId, stageId |
| `tag.assigned` | CRM | tagId |
| `tag.removed` | CRM | tagId |
| `contact.created` | CRM | (none) |
| `order.created` | CRM | pipelineId, stageId |
| `field.changed` | CRM | fieldName |
| `whatsapp.message_received` | WhatsApp | (none) |
| `whatsapp.keyword_match` | WhatsApp | keywords[] |
| `task.completed` | Tareas | (none) |
| `task.overdue` | Tareas | (none) |
| `shopify.order_created` | Shopify | (none) |
| `shopify.draft_order_created` | Shopify | (none) |
| `shopify.order_updated` | Shopify | (none) |

**11 Acciones (`ACTION_CATALOG`):**

| Action | Categoria | Key Params |
|--------|-----------|-----------|
| `assign_tag` | CRM | tagName, entityType |
| `remove_tag` | CRM | tagName, entityType |
| `change_stage` | CRM | stageId |
| `update_field` | CRM | entityType, fieldName, value |
| `create_order` | Ordenes | pipelineId, stageId, contactId, copy flags |
| `duplicate_order` | Ordenes | targetPipelineId, copy flags |
| `send_whatsapp_template` | WhatsApp | templateName, language, variables |
| `send_whatsapp_text` | WhatsApp | text (requiere ventana 24h) |
| `send_whatsapp_media` | WhatsApp | mediaUrl, caption, filename |
| `create_task` | Tareas | title, description, priority, dueDateRelative |
| `send_sms` | Twilio | body, to, mediaUrl |
| `webhook` | Integraciones | url, headers, payloadTemplate |

**Subsistemas:**
- **Trigger emission:** 13 emitter functions, cascade depth check (MAX=3)
- **Condition evaluation:** Recursive AND/OR groups, 14 operadores
- **Variable resolution:** Dual context — TriggerContext (flat) + variableContext (nested, Spanish paths)
- **Action execution:** Domain-delegated, 1114 lines, contact resolution para triggers externos
- **Inngest runners:** Factory pattern, 13 runners durables con step.run() + step.sleep()
- **Cycle detection:** MAX_CASCADE_DEPTH=3, context-aware

#### Wizard UI (`src/app/(dashboard)/automatizaciones/`)
- **3 pasos:** Trigger → Condiciones → Acciones
- **Campos opcionales:** Dropdown "Agregar campo" para params opcionales
- **Historial:** Execution history con paginacion y filtros

#### AI Automation Builder (`src/app/(dashboard)/automatizaciones/builder/`)
- **Chat con Claude:** Streaming via AI SDK v6
- **Creacion natural language:** "Cuando un pedido llegue a Confirmado, enviar template de confirmacion"
- **React Flow diagram:** Preview visual inline en chat
- **Validacion:** Resource existence, cycle detection context-aware, duplicate detection
- **Session management:** Persistencia con createAdminClient

#### Funciona
- Engine completo (trigger → condition → action → cascade)
- Wizard UI funcional
- AI Builder funcional
- Historial de ejecuciones
- Delays en acciones (step.sleep)
- Contact resolution para triggers Shopify

#### Bugs documentados (CRM-AUTOMATIONS-AUDIT.md)
- ~~5 Critical: Variable key mismatches~~ — Resuelto: field.changed y whatsapp.* keys correctas; task.overdue fix (quick-004) agrego taskDescription y contactName
- **Major restantes:** Missing data en algunos emitters menores
- **12 Minor:** Catalog inconsistencies
- ~~AI Builder cycle detection~~ — Resuelto: usa .conditions, field names en español, soporta nested groups

---

### 5. Tareas
- **Estado:** ✅ Funcional

#### Task Management (`src/lib/domain/tasks.ts`, `src/app/(dashboard)/tareas/`)
- **CRUD:** Crear, editar, completar, eliminar tareas
- **Exclusive arc:** Una tarea se vincula a maximo 1 entidad (contacto/orden/conversacion)
- **Tipos de tarea:** Customizables por workspace (color, posicion)
- **Prioridad:** low/medium/high
- **Status lifecycle:** pending → completed (con completed_at automatico via trigger)
- **Activity log:** Immutable audit trail (created, updated, completed, reopened, due_date_changed)
- **Postponement tracking:** postponement_count incrementado cuando due_date avanza
- **Notas de tarea:** CRUD con author tracking
- **Overdue cron:** Inngest cada 15 min, emite task.overdue para automatizaciones (ventana 24h)
- **Funciona:** Todo lo listado
- **Placeholder:** Reminders/Notificaciones marcado "Proximamente"
- **Bugs:** Task timestamps usan UTC en vez de Colombia timezone (D-4 audit)

---

### 6. Analytics
- **Estado:** ✅ Funcional

#### Sales Analytics (`src/app/(dashboard)/analytics/`)
- **Metricas:** Count, total revenue, avg value por periodo
- **Trend:** Graficos de tendencia de ventas
- **Period selector:** 7 dias default, configurable
- **Role-based:** Agents redirigidos a /crm/pedidos
- **Funciona:** Metricas basicas y tendencias
- **Limitaciones:** No hay reportes exportables, no PDF, no custom date ranges avanzados

#### Metricas de Conversaciones (`src/app/(dashboard)/metricas/`)
- **Estado:** ✅ Funcional (activo solo en GoDentist Valoraciones)
- **Tipo:** Dashboard read-only con actualizacion realtime hibrida (Supabase Realtime sobre `messages` + `contact_tags`, re-fetch del RPC en cada evento)
- **Metricas calculadas:**
  - Conversaciones **nuevas** del dia (primer mensaje inbound historico del contacto)
  - Conversaciones **reabiertas** del dia (contacto que vuelve tras N dias de silencio, default 7)
  - Valoraciones **agendadas** del dia (tag configurable, default `VAL`)
- **Backend:** Postgres RPC `get_conversation_metrics(workspace_id, start, end, reopen_days, tag_name)` con CTE + `LAG()` window function, SECURITY INVOKER
- **Selector temporal:** Hoy / Ayer / 7d / 30d / rango custom (date picker)
- **Activacion por workspace:** gated por `workspaces.settings.conversation_metrics.enabled` (JSONB, default `false`). Todos los workspaces heredan el modulo pero solo lo ven si el flag esta activo.
- **Workspaces activos:** GoDentist Valoraciones
- **Permisos:**
  - Dashboard (`/metricas`): **todos** los usuarios del workspace (owner/admin/agent) — excepcion explicita vs Sales Analytics que es admin-only
  - Settings (`/metricas/settings`): solo owner/admin (agent redirigido a `/metricas`)
- **Sidebar:** item condicional via mecanismo `settingsKey` en `NavItem` (nuevo en plan 05) — se muestra solo cuando `conversation_metrics.enabled === true`
- **Configuracion editable desde UI:**
  - `enabled` (toggle)
  - `reopen_window_days` (1–90, default 7)
  - `scheduled_tag_name` (texto libre, default `VAL`)
- **Key files:**
  - `src/app/(dashboard)/metricas/page.tsx` — dashboard gated por flag
  - `src/app/(dashboard)/metricas/components/` — view, period selector, metric cards, chart, hook realtime
  - `src/app/(dashboard)/metricas/settings/page.tsx` — pagina de configuracion admin-only
  - `src/app/actions/metricas-conversaciones.ts` — server action que ejecuta el RPC
  - `src/app/actions/metricas-conversaciones-settings.ts` — server action que actualiza settings (auth + rol)
  - `src/lib/domain/workspace-settings.ts` — `updateConversationMetricsSettings` (merge en JSONB preservando siblings)
  - `src/lib/metricas-conversaciones/types.ts` — tipos `MetricsSettings`, `MetricsPayload`, `Period`, etc.
  - `supabase/migrations/` — RPC `get_conversation_metrics` + publicacion realtime de `messages` / `contact_tags`
- **Bugs conocidos:** ninguno al cierre del plan 05
- **Deuda tecnica:** ninguna al cierre del plan 05

---

### 7. Integraciones

#### Shopify (`src/lib/shopify/`, `src/app/api/webhooks/shopify/`)
- **Estado:** ✅ Funcional
- **Webhooks:** orders/create, orders/updated, draft_orders/create
- **HMAC verification:** SHA256 con timing-safe comparison
- **Dual-mode:** Auto-sync (crea contact+order) o trigger-only (solo automatizacion)
- **Contact matching:** Phone exacto → fuzzy name+city (Fuse.js + Double Metaphone)
- **Product matching:** SKU, name (fuzzy), o price-based
- **Idempotencia:** X-Shopify-Webhook-Id deduplication
- **Phone extraction:** Primary + secondary de note_attributes (Releasit COD)

#### Twilio SMS (`src/lib/twilio/`, `src/app/api/webhooks/twilio/status/`)
- **Estado:** ⚠️ Parcial
- **Envio SMS:** ✅ Funcional via automation action executor
- **Status callbacks:** ✅ Delivery status tracking (queued → sent → delivered/failed)
- **Recepcion SMS:** ❌ NO IMPLEMENTADO — no hay endpoint inbound
- **MMS:** ⚠️ Campo DB existe pero no integrado completamente

#### 360dialog WhatsApp
- **Estado:** ✅ Funcional (detallado en seccion WhatsApp)

---

### 8. Auth & Workspaces
- **Estado:** ✅ Funcional

#### Autenticacion (`src/app/(auth)/`)
- **Login:** Email + password via Supabase Auth
- **Signup:** Registro con verificacion email
- **Password reset:** Forgot + reset flow completo
- **OAuth callback:** Supabase-handled
- **Invitation links:** Token-based workspace invitations

#### Multi-tenancy
- **Workspaces:** Multi-tenant desde dia 1
- **Roles:** owner, admin, agent con permisos granulares
- **RLS:** Todas las tablas con `is_workspace_member()` helper
- **Cookie-based:** workspace_id en cookie, server actions lo leen explicitamente
- **Workspace switching:** Supported via cookie change
- **Create workspace:** Form dedicado con deteccion first-workspace
- **Funciona:** Todo lo listado
- **Placeholder:** Workspace name/slug editing marcado "Proximamente"

---

### 9. Domain Layer (`src/lib/domain/`)
- **Estado:** ✅ Funcional — Single Source of Truth

| Archivo | Funciones | Status | Triggers |
|---------|-----------|--------|----------|
| `contacts.ts` | 4 (create, update, delete, bulkCreate) | ✅ | contact.created, field.changed |
| `conversations.ts` | 4 (assign, archive, link, findOrCreate) | ✅ | None |
| `messages.ts` | 4 (sendText, sendMedia, sendTemplate, receive) | ✅ | message_received, keyword_match |
| `orders.ts` | 7 (create, update, moveStage, delete, duplicate, addTag, removeTag) | ✅ | order.created, stage_changed, field.changed, tag.* |
| `tags.ts` | 2 (assign, remove) | ✅ | tag.assigned, tag.removed |
| `tasks.ts` | 4 (create, update, complete, delete) | ✅ | task.completed |
| `notes.ts` | 6 (CRUD contact + CRUD task notes) | ✅ | None (activity logs) |
| `custom-fields.ts` | 2 (update, read) | ✅ | field.changed |

**Patron:** Todas las funciones usan `createAdminClient()`, filtran por `workspace_id`, retornan `DomainResult<T>`.

**Lo que NO pasa por domain layer (config modules):**
- Pipelines CRUD (8 server actions directas)
- Automations CRUD (5 server actions directas)
- Teams CRUD (7 server actions directas)
- Tags CRUD (3 server actions directas)
- Quick replies, workspace settings, task types

---

### 10. Logistica — Generacion de Guias

- **Estado:** ✅ Funcional
- **Flujos:** 4 — Coordinadora (robot Railway + portal), Envia (Excel .xlsx), Inter (PDF), Bogota (PDF)
- **Orchestrator:** `src/inngest/functions/robot-orchestrator.ts` (2 orchestrators: `excelGuideOrchestrator`, `pdfGuideOrchestrator`)
- **Generadores:** `src/lib/pdf/generate-guide-pdf.ts` (Inter+Bogota, PDFKit), `src/lib/pdf/generate-envia-excel.ts` (ExcelJS)
- **Normalizer:** Claude AI en `src/lib/pdf/normalize-order-data.ts` con fallback `buildFallbackOrder`
- **Server action:** `executeSubirOrdenesCoord` en `src/app/actions/comandos.ts`
- **2026-04-17 (crm-verificar-combinacion-productos):** Agregada deteccion de combinacion de productos en los 4 flujos de generacion de guias. Helpers en `src/lib/orders/product-types.ts` (`isSafeForCoord`, `isMixedOrder`, `formatProductLabels`, `detectOrderProductTypes`). Coord filtra server-side las ordenes con productos fuera de stock en bodega Coord (Ashwagandha, Magnesio Forte) y renderiza warning detallado con orderName + products + reason. Envia Excel marca filas mixed con fondo amarillo y agrega columna `COMBINACION` al final. Inter/Bogota PDF muestran caja naranja condicional "COMBINACION: {labels}" entre logo y primer separador solo para ordenes mixed (Pitfall fillColor reset mitigated). Safe orders (Elixir puro) quedan pixel-identicas al comportamiento previo. Event shapes Inngest intactos.

---

### 11. CRM Bots (Phase 44)

- **Estado:** ✅ SHIPPED 2026-04-18 (pending production kill-switch verification — Task 6)
- **Proposito:** Dos agentes IA internos expuestos como API HTTP para callers agent-to-agent (otros agentes de la plataforma o integraciones externas con API key). `crm-reader` es solo lectura; `crm-writer` es escritura con flujo obligatorio two-step propose→confirm.

#### Endpoints (`src/app/api/v1/crm-bots/`)
- `POST /api/v1/crm-bots/reader` — LLM con tools read-only: `contacts_search`, `contacts_get`, `orders_list`, `orders_get`, `pipelines_list`, `stages_list`, `tags_list`. Responde texto natural + toolCalls trazados en observability.
- `POST /api/v1/crm-bots/writer/propose` — LLM con tools mutation: `createContact`, `updateContact`, `archiveContact`, `createOrder`, `updateOrder`, `archiveOrder`, `moveOrderToStage`, `createNote`, `archiveNote`, `createTask`, `updateTask`, `completeTask`. **NO muta.** Cada tool llama `proposeAction(...)` que inserta fila en `crm_bot_actions` con status='proposed', TTL 5min, y retorna `{action_id, preview, expires_at}`.
- `POST /api/v1/crm-bots/writer/confirm` — Recibe `{actionId}`, ejecuta optimistic `UPDATE crm_bot_actions SET status='executing' WHERE id=? AND status='proposed'` (idempotencia por race), despacha el domain call real, marca 'executed' con output. **No invoca LLM.** Segundo confirm retorna `already_executed` con el mismo output.

#### Autenticacion y Aislamiento
- **API key per workspace** via `Authorization: Bearer mfx_...` + middleware inyecta `x-workspace-id` del header del API key (NUNCA del body — Pitfall 4 mitigated).
- **Agentes aislados:** `src/lib/agents/crm-reader/` y `src/lib/agents/crm-writer/` son carpetas fisicamente separadas con tool registries separados. Blocker 1 enforcement: grep verificado que ningun tool file importa `createAdminClient` o `@supabase/supabase-js` — todos pasan por domain layer. El unico archivo del writer que usa `createAdminClient` es `two-step.ts` y exclusivamente contra `crm_bot_actions`.

#### Rate Limiting + Kill-Switch
- **Rate limit:** `50 calls/min per workspace` (shared bucket `'crm-bot'` entre reader + writer — invariante Warning #8 enforced con grep: exactamente 3 call sites en los 3 endpoints). Configurable via `platform_config.crm_bot_rate_limit_per_min` (Phase 44.1).
- **Kill-switch:** `platform_config.crm_bot_enabled=false` → 503 con code=KILL_SWITCH en siguientes requests. Leido per-request via `getPlatformConfig` (cache TTL 30s — Phase 44.1 eliminates Blocker 6).
- **Phase 44.1 (2026-04-19):** las 3 vars operacionales migradas de Vercel env a `platform_config` table. Kill-switch ahora flipeable via SQL sin redeploy. Ver seccion dedicada abajo.
- **Email alerts** via Resend a `joseromerorincon041100@gmail.com`:
  - Runaway alert cuando rate-limit 429 dispara (dedupe 15 min in-memory).
  - Approaching-limit alert cuando uso >80%.
  - FROM address parametrizable via `platform_config.crm_bot_alert_from` (Phase 44.1 — antes env var).

#### Observability
- **Cada call** (reader, propose, confirm) escribe fila en `agent_observability_turns` con `trigger_kind='api'`, `agent_id` correcto ('crm-reader' o 'crm-writer'), tokens + costos + duration. Consulta retroactiva via el mismo panel que otros agentes (Phase 42.1).
- **Writer actions adicional:** cada propose + confirm se persiste en tabla nueva `crm_bot_actions` con lifecycle `proposed → executing → executed/expired/failed`. Inngest cron `crm-bot-expire-proposals` marca como `expired` las filas con `expires_at < now() - 30s` (grace period contra race con confirm in-flight, Pitfall 7).

#### Error Shape (Blocker 4)
- `ResourceNotFoundError.resource_type` cubre 9 entity types: base no-creables (`tag | pipeline | stage | template | user`) + mutables (`contact | order | note | task`). Cuando el writer recibe un `tagId` inexistente en `createContact`, retorna `resource_not_found` con `suggested_action: 'create manually in UI'` en vez de inventar el recurso.

#### Deuda Tecnica Aceptada
- **In-memory rate limiter:** Pitfall 1 accepted — en Vercel con multiples instancias warm cada una tiene su propio contador; el limite real puede ser 2-3x el configurado durante bursts. Migrar a Redis/Upstash en V2.
- **Sin daily cap:** solo deteccion de runaway con rate limit per-minute + alerta email. No hay cap diario/mensual por workspace (deliberate — MVP, revisar cuando haya datos de uso real).
- **Sin UI humana:** para revisar/aprobar actions propuestas — los actions expiran a los 5min si ningun caller los confirma. En V2 considerar dashboard para super-users que vea pending actions.
- **~~Kill-switch requiere redeploy~~:** RESUELTO en Phase 44.1 (2026-04-19). Kill-switch ahora en `platform_config.crm_bot_enabled` — flipeable via SQL sin redeploy. Propagacion visible en <=30s (cache TTL).
- **Tests de Phase 44 rotos post-44.1:** `src/__tests__/integration/crm-bots/{reader,security}.test.ts` todavia mockean `process.env.CRM_BOT_ENABLED` y fallaran contra la nueva arquitectura. Tagged out-of-scope de 44.1 (D6 — refactor solo de los 4 archivos consumidores). P1 — requiere fase follow-up para actualizar a mock de `getPlatformConfig`.

#### Referencias
- **Codigo:** `src/app/api/v1/crm-bots/`, `src/lib/agents/crm-reader/`, `src/lib/agents/crm-writer/`, `src/inngest/functions/crm-bot-expire-proposals.ts`, `src/lib/domain/platform-config.ts` (Phase 44.1)
- **Schema:** migrations `crm_bot_actions` table + `archived_at` columns en 4 tablas (contacts, orders, contact_notes, order_notes) + `platform_config` table (Phase 44.1)
- **Plan artifacts:** `.planning/phases/44-crm-bots/` (9 planes + SUMMARY + LEARNINGS + INVARIANTS), `.planning/phases/44.1-crm-bots-config-db/` (config relocation)
- **Scope enforcement:** `.claude/rules/agent-scope.md` documenta PUEDE/NO PUEDE para ambos agentes (MANDATORIO al crear agente nuevo)

---

### 11.1 Config runtime — platform_config (Phase 44.1)

- **Estado:** ✅ SHIPPED 2026-04-19
- **Proposito:** Relocar config runtime no-secret de CRM bots desde Vercel env vars a una tabla centralizada en Supabase. Habilita kill-switch via SQL sin redeploy (resuelve Blocker 6 de Phase 44) y prepara base para per-workspace overrides + admin UI en fases futuras.

#### Tabla `platform_config`

```
CREATE TABLE platform_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);
```

Sin RLS — acceso server-only via `createAdminClient()` (mismo patron que `crm_bot_actions`). Sin indexes adicionales (3 filas seed).

#### Keys actualmente seeded

| Antigua env var (Vercel)     | Nueva key en platform_config   | Tipo JSONB     | Fallback si DB falla |
|------------------------------|--------------------------------|----------------|----------------------|
| `CRM_BOT_ENABLED`            | `crm_bot_enabled`              | boolean        | `true` (fail-open)   |
| `CRM_BOT_RATE_LIMIT_PER_MIN` | `crm_bot_rate_limit_per_min`   | number         | `50`                 |
| `CRM_BOT_ALERT_FROM`         | `crm_bot_alert_from`           | string or null | `null` → sandbox Resend |

- **Lectura:** `getPlatformConfig<T>(key, fallback)` en `src/lib/domain/platform-config.ts`. Cache in-memory 30s TTL por lambda instance (`PLATFORM_CONFIG_TTL_MS = 30_000`).
- **Kill-switch operativo:** `UPDATE platform_config SET value='false'::jsonb WHERE key='crm_bot_enabled'` en Supabase Studio. Efecto visible en <=30s, sin redeploy de Vercel.
- **Consistencia multi-instance:** hasta 30s de divergencia entre lambdas tras un flip (Pitfall 4 de 44.1-RESEARCH). Aceptable para operacion normal — kill-switch es soft-guard; hard-kill sigue siendo desactivar la API key a nivel workspace.
- **Fail-open policy:** errores de DB retornan fallback (NUNCA throw). Si DB cae, bots siguen activos con limite 50 y FROM sandbox — degradacion al estado pre-Phase-44.1.
- **`RESEND_API_KEY` SIGUE en Vercel env** — es secret y debe ser secret-managed. NO mover secrets a `platform_config`.

#### Archivos afectados (refactor)

- `src/lib/domain/platform-config.ts` (nuevo helper + cache)
- `src/app/api/v1/crm-bots/reader/route.ts`
- `src/app/api/v1/crm-bots/writer/propose/route.ts`
- `src/app/api/v1/crm-bots/writer/confirm/route.ts`
- `src/lib/agents/_shared/alerts.ts`
- `src/lib/tools/rate-limiter.ts` (nuevo param opcional `opts.limit`)

#### QA procedure update — Phase 44 Plan 09 Task 6

El QA del kill-switch de Phase 44 cambio:
- **Antigua:** "Set `CRM_BOT_ENABLED=false` in Vercel env + redeploy → verify 503"
- **Nueva:** "`UPDATE platform_config SET value='false'::jsonb WHERE key='crm_bot_enabled'` → wait 30s → verify 503 → revert con `'true'::jsonb`"

#### Deuda tecnica abierta (futuras fases, NO en 44.1)

- **Admin UI** para editar `platform_config` sin SQL (actualmente solo via Supabase Studio SQL Editor).
- **Columna `workspace_id UUID NULL`** para per-workspace overrides (D8 — schema cambio non-breaking cuando llegue).
- **Endpoint `POST /admin/invalidate-config`** con header secret para forzar cache clear — util para urgencias donde no se puede esperar 30s de propagacion.
- **Audit trail** de cambios (quien/cuando) — `platform_config.updated_at` captura timestamp, pero falta `actor_id`. Out of scope single-operator MVP.

#### Referencias

- **Codigo:** `src/lib/domain/platform-config.ts`
- **Schema:** `supabase/migrations/20260420000443_platform_config.sql`
- **Plan artifacts:** `.planning/phases/44.1-crm-bots-config-db/` (CONTEXT + RESEARCH + 01-PLAN + SUMMARY)
- **Threat model:** 44.1-01-PLAN `<threat_model>` seccion — T-44.1-01..08 documentados con dispositions.

---

### 11.2 Integracion somnio-recompra ↔ crm-reader (Standalone: somnio-recompra-crm-reader)

- **Estado:** ✅ SHIPPED 2026-04-21 (flag default `false` — Regla 6 rollout gradual; activacion manual en Task 3 checkpoint)
- **Proposito:** Enriquecer la sesion del agente `somnio-recompra-v1` con contexto rico del cliente (ultimo pedido con items, tags activos, total de pedidos, direccion mas reciente) invocando al agente `crm-reader` de forma asincrona, **sin bloquear el saludo del turno 0**. Primera integracion agent-to-agent in-process del repo.

#### Flujo end-to-end

1. `webhook-processor` crea la sesion de recompra via `V3ProductionRunner.processMessage` y envia el saludo (latencia <200ms usando solo `contact.name`).
2. Post-runner, si `platform_config.somnio_recompra_crm_reader_enabled === true`, emite `await inngest.send({ name: 'recompra/preload-context', data: { sessionId, contactId, workspaceId, invoker: 'somnio-recompra-v1' } })` con fail-open try/catch.
3. Inngest function `recompra-preload-context` (retries=1, concurrency=1 por `sessionId`) llama a `processReaderMessage` con `AbortSignal.timeout(12_000)`, y escribe merge-safe `_v3:crm_context` + `_v3:crm_context_status` (`'ok' | 'empty' | 'error'`) en `session_state.datos_capturados`.
4. En el turno 1+, `somnio-recompra-agent.processUserMessage` invoca `pollCrmContext(sessionId, datosCapturados)` antes de `comprehend`: fast-path si el marker ya esta en el snapshot, poll DB de 500ms × 6 iteraciones (3s max) si no. Timeout retorna `{ crmContext: null, status: 'timeout' }`.
5. Al obtener `status='ok'`, el helper merge el texto a `input.datosCapturados`; el `buildSystemPrompt` del `comprehension-prompt.ts` inyecta una seccion dedicada `## CONTEXTO CRM DEL CLIENTE (precargado)` ANTES de `DATOS YA CAPTURADOS` y filtra keys `_v3:*` del JSON dump. Haiku analiza con contexto rico; si status != `'ok'`, el prompt queda byte-identical al pre-fase.

#### Feature flag (Regla 6)

- Key: `somnio_recompra_crm_reader_enabled` (seed en migration `20260421155713_seed_recompra_crm_reader_flag.sql`, default `false`).
- Doble guard: webhook-processor (evita coste `inngest.send` cuando disabled) + Inngest function (defense-in-depth, early-return `skipped/feature_flag_off`).
- Flipeable via SQL sin redeploy (`UPDATE platform_config SET value = 'true'::jsonb WHERE key = 'somnio_recompra_crm_reader_enabled';`); propagacion ≤30s (`getPlatformConfig` cache TTL).

#### Observability (Phase 42.1)

Emite 5 eventos `pipeline_decision:*` consumibles desde el dashboard de observability:
- `crm_reader_dispatched` — webhook-processor envio el event (intencion registrada ANTES del send).
- `crm_reader_completed` / `crm_reader_failed` — Inngest function termino ok/empty o fallo con timeout/exception (metrics: durationMs, toolCallCount, steps, textLength).
- `crm_context_used` — agent turno 1+ obtuvo `status='ok'` tras poll DB (no se emite en fast-path — el contexto ya estaba en el snapshot).
- `crm_context_missing_after_wait` — agent espero 3s sin exito (`status='timeout'|'error'|'empty'`); turno procede sin contexto (D-14).

#### Tests

- `src/inngest/functions/__tests__/recompra-preload-context.test.ts` — 5 branches (flag off, idempotency, ok, empty, error).
- `src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts` — 4 branches (flag off, flag on+sessionId, sessionId empty, send throws).
- `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` — 7 branches (3 fast-paths + poll ok + timeout + status=error + transient swallow) con `vi.useFakeTimers()`.
- `src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` — 10 branches (inject, filter, 3 no-inject, edge cases).
- Total: **26 unit tests** todos passing.

#### Referencias

- **Codigo:** `src/inngest/functions/recompra-preload-context.ts` (Inngest function), `src/lib/agents/production/webhook-processor.ts` (dispatch, lines ~233-309), `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts` (poll + processUserMessage wire), `src/lib/agents/somnio-recompra/comprehension-prompt.ts` (prompt inject), `src/inngest/events.ts` (`RecompraPreloadEvents` schema), `src/lib/agents/crm-reader/types.ts` + `index.ts` (abortSignal pass-through).
- **Schema:** `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql`.
- **Plan artifacts:** `.planning/standalone/somnio-recompra-crm-reader/` (CONTEXT + RESEARCH + PATTERNS + 01..07-PLAN + 01..07-SUMMARY).
- **Scope enforcement:** `.claude/rules/agent-scope.md` §CRM Reader Bot → "Consumidores in-process documentados" bullet (D-17).

---

### 11.3 Agent Lifecycle Router (Standalone: agent-lifecycle-router)

- **Estado:** ✅ SHIPPED v1 — 2026-04-27 (Somnio rollout, flag flippeado per-workspace)
- **Standalone:** `.planning/standalone/agent-lifecycle-router/` (7 plans, 28 commits)
- **Capability:** Decision engine declarativo para enrutar agentes basado en lifecycle del contacto. Reemplaza el if/else hardcoded en `webhook-processor.ts:174-188` (`is_client+recompra_enabled vs default`) por reglas editables sin redeploy.
- **Stack:** `json-rules-engine@7.3.1` + `lru-cache@11` (TTL 10s, max 100 workspaces) + `ajv@8` (Draft 2020-12 schema validation)
- **Tablas:** `routing_rules`, `routing_facts_catalog` (11 facts seedeados), `routing_audit_log` (retention 30d para `matched` only via Inngest cron) + `workspace_agent_config.lifecycle_routing_enabled` (feature flag per-workspace, default false — Regla 6)
- **Admin UI:** `/agentes/routing` — 5 surfaces (list, editor con condition builder, fact picker, simulate panel, audit log). Server Actions invocan domain layer (Regla 3, cero `createAdminClient`).
- **3-layer model:** webhook → flag check → Layer 1 lifecycle_classifier → Layer 2 agent_router → audit log → emit `{ agent_id, reason }` (4 reasons: matched | human_handoff | no_rule_matched | fallback_legacy)
- **Somnio rollout:** 3 reglas parity creadas via SQL (`forzar_humano_kill_switch` priority 1000, `legacy_parity_recompra_disabled_client_to_default` priority 900 para B-1, `is_client_to_recompra` priority 800). Dry-run 100% parity validation antes del flip. Hotfix post-rollout: pre-warm `agentRegistry` antes de `routeAgent` (cold lambda race fix, commit `c8de14a`).
- **Pending v1.1 cleanup (deuda técnica documentada):** Borrar legacy if/else inline en `webhook-processor.ts`, borrar columna `lifecycle_routing_enabled`, fix B-001 (`daysSinceLast*` retorna `-1` por race ms-future), fix B-002 (timestamps mixtos UTC vs Bogota en facts_snapshot). Agendar standalone `agent-lifecycle-router-cleanup` ~1-2 semanas post-rollout exitoso.
- **Tests:** 105 vitest tests (10 schema + 13 domain + 17 domain-ext + 11 operators + 7 engine + 8 cache + 9 route + 12 dry-run + 14 integrate/webhook + 4 contacts).

#### Referencias
- **Código:** `src/lib/agents/routing/{operators,facts,engine,cache,route,dry-run,integrate}.ts`, `src/lib/domain/routing.ts` + `workspace-agent-config.ts`, `src/app/(dashboard)/agentes/routing/`, `src/inngest/functions/routing-audit-cleanup.ts`.
- **Schema:** `supabase/migrations/20260425220000_agent_lifecycle_router.sql` + `src/lib/agents/routing/schema/rule-v1.schema.json`.
- **Architecture doc:** `docs/architecture/06-agent-lifecycle-router.md`.
- **Plan artifacts:** `.planning/standalone/agent-lifecycle-router/` (CONTEXT + RESEARCH + VALIDATION + DISCUSSION-LOG + 01..07 PLAN + SUMMARY + SOMNIO-PARITY-RULES + DRY-RUN-RESULT + FLIP-PLAN + SNAPSHOT).

---

## API Endpoints

| Endpoint | Metodos | Auth | Status | Funcion |
|----------|---------|------|--------|---------|
| `/api/agents/somnio` | POST | Workspace | ✅ | Procesa mensajes con SomnioEngine |
| `/api/builder/chat` | POST | Supabase + workspace | ✅ | Streaming AI builder con Claude |
| `/api/builder/sessions` | GET, DELETE | Supabase + workspace | ✅ | CRUD sesiones builder |
| `/api/inngest` | GET, POST, PUT | Inngest signature | ✅ | Execution endpoint Inngest functions |
| `/api/sandbox/crm-agents` | GET | None | ✅ | Lista agentes CRM disponibles |
| `/api/sandbox/process` | POST | Supabase | ✅ | Procesamiento sandbox UnifiedEngine |
| `/api/v1/tools` | GET | None | ✅ | Tool discovery (MCP-compatible) |
| `/api/v1/tools/[toolName]` | GET, POST | API key | ✅ | Tool execution + schema |
| `/api/v1/crm-bots/reader` | POST | API key + kill-switch | ✅ | CRM Reader Bot (Phase 44) — LLM read-only con 7 tools |
| `/api/v1/crm-bots/writer/propose` | POST | API key + kill-switch | ✅ | CRM Writer Bot propose (Phase 44) — LLM proposes mutations, no side effects |
| `/api/v1/crm-bots/writer/confirm` | POST | API key + kill-switch | ✅ | CRM Writer Bot confirm (Phase 44) — ejecuta propuesta (idempotent, no LLM) |
| `/api/webhooks/shopify` | GET, POST | HMAC-SHA256 | ✅ | Shopify order webhooks |
| `/api/webhooks/twilio/status` | POST | Trusted IP | ✅ | SMS delivery status callbacks |
| `/api/webhooks/whatsapp` | GET, POST | HMAC + token | ✅ | 360dialog message webhooks |

---

## Background Jobs (Inngest)

| Funcion | Trigger | Status | Descripcion |
|---------|---------|--------|-------------|
| `whatsappAgentProcessor` | `agent/whatsapp.message_received` | ✅ | Procesa mensajes con SomnioEngine produccion |
| Agent Timer (collecting_data) | `agent/collecting_data.started` | ✅ | Timer 6min para datos parciales |
| Agent Timer (promos) | `agent/promos.offered` | ✅ | Timer 10min para promos sin respuesta |
| Agent Timer (resumen) | `agent/resumen.started` | ✅ | Timer 10min para confirmacion final |
| Agent Timer (cancel) | `agent/customer.message` | ✅ | Cancela timers pendientes |
| `taskOverdueCron` | Cron `*/15 * * * *` | ✅ | Escanea tareas vencidas, emite triggers |
| AutomationRunner x13 | `automation/*` events | ✅ | 13 runners (1 por trigger type) via factory |
| `crmBotExpireProposals` | Cron periodic (Phase 44) | ✅ | Marca `crm_bot_actions` con `status='proposed'` y `expires_at < now()-30s` como `expired` (grace window contra race con confirm in-flight) |

---

## Base de Datos

### Tablas Principales (37 tablas)

**Core:** workspaces, workspace_members, workspace_invitations
**CRM:** contacts, contact_tags, contact_notes, contact_activity, custom_field_definitions
**Orders:** orders, order_products, order_tags, products, pipelines, pipeline_stages, order_states, saved_views
**WhatsApp:** conversations, messages, whatsapp_templates, teams, team_members, quick_replies, message_costs, workspace_limits, conversation_tags
**Tasks:** tasks, task_types, task_notes, task_activity
**Agents:** agent_sessions, agent_turns, session_state, agent_templates, workspace_agent_config
**Config:** client_activation_config
**Automations:** automations, automation_executions, builder_sessions
**Integrations:** integrations, webhook_events, sms_messages
**System:** tool_executions, api_keys

### Migraciones
- **25 migraciones aplicadas** (20260127 → 20260217)
- **11 archivos renombrados** (pendiente deploy — git status muestra rename con timestamps normalizados)
- **RLS:** Todas las tablas con policies usando `is_workspace_member()`

### Functions & Triggers DB
- `is_workspace_member()`, `is_workspace_admin()`, `is_workspace_manager()`, `is_workspace_owner()`
- `update_order_total()` — Auto-calcula total desde line items
- `update_conversation_on_message()` — Auto-actualiza preview, unread_count
- `log_contact_changes()` — JSONB diff para activity
- `log_task_changes()` — JSONB diff para task activity
- `set_task_completed_at()` — Auto-set timestamp en status='completed'
- `mark_client_on_stage_change()` — Marca is_client=true y auto-tag "Cliente" cuando orden llega a etapa de activacion configurable

---

## Tools (Action DSL)

**29 tools registrados** (22 CRM + 7 WhatsApp), todos con implementacion REAL:

**CRM (22):** contact.create/update/delete/read/list, tag.add/remove, order.create/update/updateStatus/delete/duplicate/list, task.create/update/complete/list, note.create/list/delete, custom-field.update/read
**WhatsApp (7):** message.send/list, template.send/list, conversation.list/assign/close

Todos los handlers delegan al domain layer. `initializeTools()` requerido en cualquier entry point serverless.

---

## Deuda Tecnica (Priorizada)

### P0 — Critica (Seguridad/Data Integrity)

*Todos los P0 resueltos.*

### P1 — Alta (Funcionalidad)

1. **Webhook WhatsApp sin store-before-process** — Si `processWebhook()` falla, el mensaje inbound se pierde. Se retorna 200 a 360dialog (correcto para evitar retries) pero no hay recovery. Solucion pendiente: guardar raw payload en `webhook_events` antes de procesar.
2. **AI Builder cycle detection incompleto** — Los 3 bugs criticos fueron resueltos (.conditions, Spanish names, nested groups), pero solo cubre 3 de 20+ campos de condicion y 4 de 13 trigger types. Triggers no cubiertos defaults a severity 'possible'.

### P2 — Media (Mejoras)

3. **Server actions sin domain layer** — Config modules (pipelines, teams, tags CRUD, etc.) escriben directo a Supabase
4. **No rate limiting** en API routes (sandbox, agents, tools)
5. **Twilio inbound SMS** no implementado
6. **Task timestamps UTC** — Deberian usar America/Bogota
7. **Phone normalization inconsistente** — 4 implementaciones diferentes (consolidar a 1)
8. **Unresolved variables como literal** (R-3) — `{{placeholder}}` deberia ser string vacio
9. **SessionManager bypassing src/lib/domain/** — refactor candidate (excepcion a Regla 3 ratificada en Phase 42 LEARNINGS, pendiente fase dedicada)
10. **Bug pre-existente `agent-production.ts:154`** — query filtra por columna inexistente `is_active` (out of scope Phase 42, tracked separately)
11. **Somnio V1 (`somnio-sales-v1`, `somnio-recompra-v1`) confirmed dead code** — auditoria Phase 42 verifico cero sesiones activas ni handlers vivos. Candidato a deletion en fase de cleanup

### P3 — Baja (Cleanup)

9. **Duplicaciones de codigo** — Supabase admin client duplicado, model IDs hardcoded (7 refs)
10. **Commented code** — 179 archivos con 3+ lineas de comentarios
11. **Dead code potencial** — `getTemplatesForIntents()` en template-manager.ts
12. **Workspace config UI** — Name/slug editing placeholder
13. **Task reminders** — Placeholder "Proximamente"

> **Auditado y verificado 19 feb 2026:** P0-3 (temp route), P0-2 (cycle detection), P1-5 (exito parcial), P1-6 (taskOverdue await), P1-7 (totalValue mismatch) — todos resueltos en codigo, removidos de deuda.
> **Verificado 19 feb 2026 (quick-003/004):** P0-1 (variables vacias task.overdue) — resuelto: taskDescription y contactName ahora fluyen completos. P0-4 (workspace_id missing) — resuelto: pipeline ownership validation + defense-in-depth en 8 enrichment queries. P0-2 (cycle detection) — 3 bugs criticos ya resueltos, reclasificado a P1 por cobertura incompleta. P1-3 (missing enrichment) y P1-4 (TriggerContext type gap) — resueltos en Real Fields Fix y quick-004.

---

## Presencia Publica — morfx.app (Phase 37.5 Block A)

**Estado:** ✅ Funcional — deployado 2026-04-14

### Landing bilingue (`src/app/(marketing)/[locale]/`)
- **Idiomas:** ES en `/`, EN en `/en` (next-intl 4.x `localePrefix: 'as-needed'`)
- **Ruta root:** ya NO es redirect a `/login` — sirve landing publico con hero + about + product + CTA
- **Legal:** `/privacy` (Ley 1581 + ARCO) + `/terms` (14 secciones, handwritten desde doc del equipo legal)
- **Footer:** MORFX S.A.S. + NIT 902.052.328-5 + Carrera 38 #42-17 Apto 1601B Bucaramanga + +57 313 754 9286 + morfx.colombia@gmail.com
- **SEO:** Metadata completa, OG image branded 1200x630, alternates ES/EN
- **Sin referencias:** a 360dialog (stack actual es Meta Direct), sin NIT incorrecto (`902.058.328-5`)

### Middleware composicion (pattern)
- Repo-root `middleware.ts` compone 2 middlewares: 6 paths marketing (`/`, `/en`, `/privacy`, `/en/privacy`, `/terms`, `/en/terms`) via `createMiddleware` de next-intl; todo lo demas via `updateSession` de Supabase. Preserva bypasses criticos (Inngest, cron, `_next/*`).
- **Rutas auth fuera del locale segment:** `/login`, `/signup`, `/forgot-password` no son parte de `(marketing)/[locale]/` — no tienen variantes ES/EN

### Meta Business Verification (Blocking para Phase 38 Embedded Signup)
- **Phase 37.5 Block A completo:** website publico + legal pages listas como evidencia para Meta reviewer
- **Block B (email corporativo `info@morfx.app` via Porkbun forwarding):** handled by separate instance
- **Block C (Facebook Page MORFX S.A.S. conectada a Business Portfolio):** handled by separate instance
- **Block D (Domain TXT verify + BV resubmit):** manual user action (checklist en `.planning/phases/37.5-meta-verification-website/META-VERIFICATION-CHECKLIST.md`)
- **Expected SLA Meta:** 2-5 dias habiles post-resubmit (community reports 2 semanas a 7 meses)

### Bugs conocidos Phase 37.5
- WSL + Geist fonts outage bloquea `npm run build` local (pattern conocido desde Phase 42.1-07); Vercel build funciona normal
- `--legacy-peer-deps` requerido en npm install (pre-existente: @webscopeio/react-textarea-autocomplete peer React 18 vs app React 19.2.3)

### Deuda tecnica abierta
- Legal review profesional de T&C + Privacy antes de launch mayor (v1.0 pending-legal-review banner activo)
- OG image branding iteration pendiente

### Landing editorial v1 (shipped 2026-04-22)

- **Standalone:** `.planning/standalone/ui-redesign-landing/` — 3 plans (01 layout + home → 02 legal pages → 03 DoD + close).
- **Driver:** Meta App Review (Facebook Business Verification). El producto (inbox v2 editorial) ya tenia el look paper/ink/rubric — la landing seguia shadcn-slate default, incoherencia detectable en la review.
- **Status:** ✅ SHIPPED a produccion **SIN feature flag** (diferencia clave vs inbox editorial v2 que usa flag per-workspace). Activacion inmediata y global para todos los visitantes de `morfx.app`. Rollback seria via `git revert`, no flag flip.
- **Commits range:** `1c2fd6f..<HEAD-post-Plan-03-T3>` en `main`, push unico al final de Plan 03 (D-LND-12). Vercel auto-deploy disparado.
- **Scope:** 11 archivos re-skineados (1 created + 10 modified). **Cero cambios** en `src/app/globals.css` (tokens `.theme-editorial` + utilities `.mx-*` ya existian desde `ui-redesign-conversaciones` Plan 01 — esta fase es el primer consumer externo al inbox del mismo bloque, validando reusabilidad).

**Archivos creados (1):**
- `src/app/(marketing)/fonts.ts` — loader dedicado EB Garamond (400/500/600/700/800) + Inter + JetBrains Mono (400/500) via `next/font/google` **per-segment**. Next 15 deduplica el WOFF2 bundle con `src/app/(dashboard)/whatsapp/fonts.ts` (misma familia → mismo hash → mismo chunk). Verificable en `.next/static/media/`.

**Archivos modificados (10):**
- `src/app/(marketing)/[locale]/layout.tsx` — wrapper `className="${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} theme-editorial ..."` unconditional (D-LND-04). Preserva `NextIntlClientProvider`, `Header`, `main`, `Footer`.
- `src/components/marketing/header.tsx` — paper-0 bg + border-b ink-2, logo light-only (D-LND-08 — `/logo-dark.png` removido), ThemeToggle eliminado (D-LND-07), CTA "Empezar" en patron ink-1 press byte-exact del composer Send (D-LND-10).
- `src/components/marketing/footer.tsx` — paper-3 bg, section headings `.mx-smallcaps` ink-3 11px tracking-[0.12em], NIT/razon social/CIIU en font-mono 11px ink-3, links ink-2→ink-1 underline-offset editorial.
- `src/components/marketing/landing/hero.tsx` — eyebrow `.mx-smallcaps` rubric-2, headline `.mx-display` EB Garamond text-[3rem]→[6rem] responsive, rule ornament horizontal `h-px w-20 bg-[var(--ink-1)]`, subhead `.mx-body-long` max-w-[36rem], CTAs ink-1 press + outline ink-1.
- `src/components/marketing/landing/about.tsx` — ornament centrado `— ❦ —` al tope, heading `.mx-h1` 2-2.75rem, intro `.mx-body-long` leading-[1.7], objetoSocial blockquote italic border-l rubric-2, legal data labels smallcaps + values font-mono.
- `src/components/marketing/landing/product-section.tsx` — cards alternando `odd:bg-[var(--paper-1)]`, icon container rounded-[6px] border paper-4 con lucide strokeWidth={1.5}, heading `.mx-h1`, description `.mx-body-long`, bullets con check boxes rounded-[3px] border ink-3 (reemplaza rounded-full primary/10 shadcn), illustration Card paper-2 con icono strokeWidth={1.25}.
- `src/components/marketing/landing/cta.tsx` — wrapper paper-1, ornament `— ❦ —`, heading `.mx-display` 2.5-4rem, CTAs WhatsApp ink-1 press + Email outline ink-1, contactLine font-mono ink-3.
- `src/components/marketing/legal/legal-section.tsx` — refactor backward-compatible con props nuevas `sectionNumber`, `subtitle`, `showOrnament`. Layout grid `md:grid-cols-[6rem_1fr]` + aside sticky top-24 con `.mx-marginalia` serif italic ink-3 (hidden <md), body column max-w-[42rem] con `.mx-body-long` leading-[1.7] ink-2, subsections recursivas nivel 0→`.mx-h3` nivel 1+→`.mx-smallcaps`, rule ornament `— ❦ —` toggleable (default true).
- `src/app/(marketing)/[locale]/terms/page.tsx` — page header con eyebrow "MORFX S.A.S." + `.mx-display` + lastUpdated mono, TOC editorial con `§ N ∣ heading` marginalia inline, 14 secciones via `<LegalSection sectionNumber={`§ ${idx + 1}`} showOrnament={idx < last}>` derivando numero del idx (no i18n — D-LND-06 copy intacto).
- `src/app/(marketing)/[locale]/privacy/page.tsx` — mismo pattern adaptado a 4 secciones `§ 1..§ 4`.

**Decisiones clave (subset, lista completa en `.planning/standalone/ui-redesign-landing/CONTEXT.md`):**

- **D-LND-02 — SIN feature flag.** A diferencia del inbox (per-workspace opt-in), la landing es publica → rollout global. Rollback es `git revert`.
- **D-LND-07 — ThemeToggle removido del marketing header.** `.theme-editorial` fuerza `color-scheme: light` — toggle seria ruido sin efecto. Trade-off menor: perdida de feature discovery (visitante anonimo no descubre dark mode del dashboard hasta loguearse).
- **D-LND-09 — Marginalia para legal pages.** Pattern editorial revista clasica (New Yorker, Atlantic): `§ N` en columna marginalia izquierda, cuerpo en columna central `.mx-body-long`, ornaments `— ❦ —` entre secciones.
- **D-LND-10 — CTA pattern byte-exact del composer Send button.** 4 CTAs en marketing usan el mismo tratamiento visual (bg ink-1, rounded-[4px], `active:translate-y-px`, font-semibold 13px sans). Consistencia product ↔ marketing.
- **D-LND-12 — Push unico al final.** 14 commits atomicos por task (Plans 01/02/03), un solo `git push origin main` en Plan 03 T3 para evitar race condition donde Meta cae en un estado intermedio.

**Zero changes verificados (`git diff 1c2fd6f -- ...`):**
- `src/app/(dashboard)/**` → 0 lineas (inbox editorial v2 intocable).
- `src/lib/**`, `src/hooks/**` → 0 lineas (domain, agentes, Inngest, hooks intactos — Regla 6 spirit para fases UI-only de surfaces publicos).
- `src/app/globals.css` → 0 lineas (tokens + utilities ya existian).
- `src/messages/{locale}.json` → 0 lineas (D-LND-06 copy intacto).
- Zero npm packages agregados (next/font/google ya estaba instalado para el inbox).

**DoD UI (6 checks — dod-verification.txt):**
| Check | Pass |
|---|---|
| 1 No slate leakage (`bg-background|text-foreground|border-border`) | ✅ |
| 2 No `hsl(var(--` antipattern post-Tailwind v4 | ✅ |
| 3 No `dark:` classes (D-LND-07) | ✅ |
| 4 mx-* utilities count ≥ 15 | ✅ (46 matches) |
| 5 TS clean en marketing scope | ✅ |
| 6 Regla NO-TOUCH (`git diff 1c2fd6f -- protected-paths`) | ✅ (0 lineas) |

**Patterns reutilizables documentados (LEARNINGS.md §3):**
1. Per-segment font loader Next 15 (dedup automatico del bundle).
2. Theme unconditional vs gated — tabla de decision por tipo de surface (publico vs productivo).
3. CTA consistency product ↔ marketing byte-exact.
4. Form controls font inheritance footgun — 12 instancias de `style={{ fontFamily: 'var(--font-sans)' }}` explicito para romper herencia serif bajo `.theme-editorial`.
5. Legal pages editorial pattern (marginalia + body-long + rule ornaments) via `<LegalSection>` backward-compatible.
6. Section number derivation del idx del map (no hardcode en i18n).

**Reglas verificadas:**
- **Regla 1 (push a Vercel):** `git push origin main` ejecutado en Plan 03 T3.
- **Regla 4 (docs):** esta entrada + `LEARNINGS.md` + `dod-verification.txt` + SUMMARY files por plan.
- **Regla NO-TOUCH (spirit Regla 6):** verificado en DoD Check 6.

**Referencias:**
- `.planning/standalone/ui-redesign-landing/LEARNINGS.md` — patterns + trade-offs + handoff completo.
- `.planning/standalone/ui-redesign-landing/dod-verification.txt` — raw output de los 6 checks.
- `.planning/standalone/ui-redesign-landing/01-SUMMARY.md` + `02-SUMMARY.md` + `03-SUMMARY.md` — commit chain por plan.

---

## Configuracion Pendiente (No es codigo)

1. **SMTP** — Configurar en Supabase para emails transaccionales
2. **360dialog webhook URL** — Configurar URL de produccion + WHATSAPP_WEBHOOK_SECRET en Vercel
3. **Inngest env vars** — INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY en Vercel
4. **Migraciones DB** — 11 archivos renombrados pendientes de deploy
5. **Deprecated files cleanup** — SomnioEngine legacy, SandboxEngine legacy

---

## Proximos Pasos Recomendados

1. ~~**Wave 1 — Security Hotfixes:**~~ COMPLETADO (quick-003: workspace_id filters, temp route ya eliminado)
2. ~~**Wave 2 — Automation Variables:**~~ COMPLETADO (quick-004: task.overdue emitter fix, otros triggers verificados correctos)
3. **Wave 3 — AI Builder Coverage:** Expandir cycle detection para cubrir mas campos de condicion y trigger types (P1)
4. **Wave 4 — Resilience:** Store-before-process en webhook WhatsApp (P1)
5. **Wave 5 — Performance/Cleanup:** Consolidar phone normalization, rate limiting, Twilio inbound
6. **v3.0 Planning:** Nuevas features (multi-agent, analytics avanzados, inventario, pagos)

---

*Generado: 19 febrero 2026 — Actualizado con fixes quick-003 (workspace_id) y quick-004 (task.overdue variables)*
*Actualizado: 20 febrero 2026 — Hotfix bot CRM: mapeo name/shippingCity/shippingDepartment, department en contactUpdate, sync conversation.contact_id post-order*
*Actualizado: 14 abril 2026 — Phase 37.5 Block A completo: morfx.app con landing publico bilingue ES/EN + privacy + terms, middleware compuesto next-intl + Supabase whitelist. Listo para resubmit de Meta Business Verification.*
*Actualizado: 7 abril 2026 — Phase 42 (Session Lifecycle) completada: cron de cierre, partial unique index, retry 23505, defensive timer-guard, TZ-safe RPC*
*Actualizado: 18 abril 2026 — Phase 44 (CRM Bots Read + Write) SHIPPED: dos agentes IA internos expuestos como API (reader + writer two-step propose/confirm), aislamiento fisico por carpeta, rate-limit compartido `'crm-bot'` 50/min/workspace, kill-switch `CRM_BOT_ENABLED` (requiere Vercel redeploy — Blocker 6), Inngest cron `crmBotExpireProposals`, email alerts Resend, observability full. Pending production QA en Task 6 checkpoint.*
*Actualizado: 19 abril 2026 — Phase 44.1 (CRM Bots Config DB) SHIPPED: 3 env vars de CRM bots relocadas a tabla `platform_config` en Supabase. Nuevo helper `src/lib/domain/platform-config.ts` con cache in-memory 30s TTL. Kill-switch ahora flipeable via SQL sin redeploy (resuelve Blocker 6). `RESEND_API_KEY` permanece en Vercel (secret). QA kill-switch procedure actualizado — ver seccion 11.1.*
*Actualizado: 21 abril 2026 — Standalone `somnio-recompra-crm-reader` SHIPPED (codigo) con feature flag default `false` (Regla 6 rollout gradual): `somnio-recompra-v1` ahora enriquece la sesion con contexto rico del cliente (ultimo pedido, tags, total pedidos, direccion) via Inngest function `recompra-preload-context` que invoca al agente `crm-reader` en paralelo al saludo. Comprehension del turno 1+ inyecta seccion dedicada `## CONTEXTO CRM DEL CLIENTE (precargado)` cuando `_v3:crm_context_status === 'ok'`. 26 unit tests passing. Activacion manual via SQL en `platform_config.somnio_recompra_crm_reader_enabled`. Ver seccion 11.2.*
*Actualizado: 22 abril 2026 — Standalone `crm-stage-integrity` SHIPPED (codigo) con feature flags default `false` (Regla 6 rollout gradual). Fix del bug "pedidos se devuelven" reportado 2026-04-21: 6 capas compuestas (domain CAS + audit log append-only + Inngest concurrency per-orderId + runtime kill-switch + build-time cycle detection recursiva + Kanban Realtime + toast rollback). Flags `crm_stage_integrity_cas_enabled` y `crm_stage_integrity_killswitch_enabled` en `platform_config` — flipeable via SQL sin redeploy. Audit log (`order_stage_history`), Inngest concurrency, cycle detection y Kanban Realtime operativos desde deploy (additive, sin flag). Ver seccion CRM Pedidos + `.planning/standalone/crm-stage-integrity/LEARNINGS.md` para rollout guide.*
*Actualizado: 22 abril 2026 — Standalone `ui-redesign-conversaciones` SHIPPED (6 plans + 06 DoD/docs). Re-skin editorial del modulo Inbox WhatsApp detrás de feature flag per-workspace `workspaces.settings.ui_inbox_v2.enabled` (default `false`, Regla 6). 8 componentes visuales re-skineados (inbox-layout/conversation-list/conversation-item/chat-view/chat-header/contact-panel/message-bubble/message-input) + 6 archivos nuevos (getIsInboxV2Enabled helper + fonts per-route + InboxV2 context + MxTag/IconButton/DaySeparator primitives) + bloque `.theme-editorial` en globals.css (~310 lineas) con tokens paper/ink/rubric + shadcn overrides scoped. Scope confinado a `/whatsapp` (D-07). Dark mode forzado a light (UI-SPEC §12.4). Fix universal del bug pre-existente `hsl(var(--background))` en chat-view post Tailwind v4. Shadcn primitives `dropdown-menu.tsx` + `popover.tsx` extendidos con prop opcional `portalContainer` (aditivo, byte-identical default) para re-rooting Radix portals dentro del scope editorial. D-17 (channel-down banner) y D-18 (snoozed state) diferidos — ver `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` + LEARNINGS.md para checklist de un-defer. Primera activacion productiva: workspace Somnio (id `a3843b3f-c337-4836-92b5-89c58bb98490`) tras QA lado a lado aprobado por el usuario en Vercel prod. Ver seccion 2. WhatsApp → subseccion "UI Editorial v2 — Inbox Re-skin" + `.planning/standalone/ui-redesign-conversaciones/LEARNINGS.md`.*
*Actualizado: 22 abril 2026 — Standalone `ui-redesign-landing` SHIPPED (3 plans: 01 layout+home → 02 legal pages → 03 DoD+close). Re-skin editorial de la presencia publica `morfx.app` (landing + terms + privacy + header + footer) **SIN feature flag** — rollout global inmediato para todos los visitantes. Driver: Meta App Review (Facebook Business Verification) — producto (inbox v2 editorial) + marketing ahora tienen el mismo lenguaje paper/ink/rubric. 11 archivos re-skineados (1 created: `src/app/(marketing)/fonts.ts` per-segment loader con dedup automatico del WOFF2 bundle vs `(dashboard)/whatsapp/fonts.ts`; 10 modified). **Cero cambios en `src/app/globals.css`** — tokens + utilities `.theme-editorial` ya existian desde `ui-redesign-conversaciones` Plan 01; esta fase es el primer consumer externo al inbox. ThemeToggle removido del marketing header (D-LND-07 — `.theme-editorial` fuerza `color-scheme: light`), logo light-only (D-LND-08), copy byte-exact (D-LND-06). Legal pages con marginalia `§ N` serif italic ink-3 + body-long leading-[1.7] + rule ornament `— ❦ —` entre secciones (D-LND-09). CTAs ink-1 press byte-exact del composer Send del inbox (D-LND-10 — consistency product ↔ marketing). Push unico al final (D-LND-12) — commit range `1c2fd6f..<HEAD>` pusheado a origin/main, Vercel auto-deploy triggered. Regla NO-TOUCH verificada: 0 lineas diff en `src/app/(dashboard)/ src/lib/ src/hooks/ src/app/globals.css src/messages/` vs base. Ver subseccion "Landing editorial v1" bajo "Presencia Publica — morfx.app" + `.planning/standalone/ui-redesign-landing/LEARNINGS.md` (6 patterns reutilizables para futuras fases UI publicas) + `dod-verification.txt` (6/6 checks PASS primera ejecucion, cero fixes inline).*

### Actualización 2026-04-23 — Realignment landing al mock v2.1

La landing de morfx.app (shipped 2026-04-22) fue detectada como divergente del mock pixel-perfect del design handoff v2.1 (`morfx Design System (2).zip`). Re-hecha el mismo día 2026-04-23 vía Plan 04 de la fase `ui-redesign-landing`:

- **Wordmark** tipográfico `morf·x` (no logo image)
- **Primary CTAs** rubric-2 rojo con shadow stamp (no ink-1)
- **Hero 2-col** con mockup WhatsApp inbox framed + 4 tape corners dorados rotado 0.6°
- **Secciones nuevas:** Manifest strip (bordes dashed), Modules grid 12-col con 5 cards + mini-mockups, Flow diagram 3-col "cómo funciona"
- **About** rehecho con ledger legal + blockquote Ley 1258/2008
- **Footer dark** (bg ink-1) 4-col con wordmark + nav + contact + legal strip mono

Range pushado: `cfd447d..9642e36` (13 commits).

### Preparación 2026-04-23 — Mega-fase dashboard planificada

Fase `ui-redesign-dashboard` con CONTEXT + PLAN committed, **ready-to-execute** en próxima sesión. Re-skinea 7 módulos (CRM, Pedidos, Tareas, Agentes, Automatizaciones, Analytics/Métricas, Configuración) gated por flag `ui_dashboard_v2.enabled`. 4 waves (infra → 3‖ → 2‖ → 2‖ → close), ~6-8h con paralelización. Artefactos en `.planning/standalone/ui-redesign-dashboard/`.

### UI Editorial Dashboard v2 (in rollout — 2026-04-23)

**Standalone:** `.planning/standalone/ui-redesign-dashboard/`
**Status:** SHIPPED detrás de feature flag — flag default `false` per workspace (Regla 6).

**Feature flag:** `workspaces.settings.ui_dashboard_v2.enabled` (boolean, JSONB).
**Coexistencia:** independiente de `ui_inbox_v2.enabled` (D-DASH-03). Un workspace puede tener uno sin el otro. Caso típico Somnio hoy: `ui_inbox_v2=true` y `ui_dashboard_v2=false`. Post-QA de esta fase, se activan ambos.

**Activación per workspace (manual, via SQL — admin UI deferred):**
Snippet completo en `.planning/standalone/ui-redesign-dashboard/activacion-somnio.sql`.

Resumen:
```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_dashboard_v2,enabled}',
  'true'::jsonb,
  true
)
WHERE id = '<workspace-uuid>';
```

**Rollback:**
```sql
UPDATE workspaces
SET settings = jsonb_set(settings, '{ui_dashboard_v2,enabled}', 'false'::jsonb)
WHERE id = '<workspace-uuid>';
```

**Módulos re-skineados (7):**
- **CRM** (`src/app/(dashboard)/crm/`) — dictionary-table para listados de contactos/productos, detail drawer ledger-style, dialogs editorial.
- **Pedidos** (`src/app/(dashboard)/crm/pedidos/`) — status pills editorial (mx-tag--verdigris/gold/rubric/indigo/ink), kanban cards paper-1 + flag pills, order sheet ledger-style, pipeline tabs smallcaps.
- **Tareas** (`src/app/(dashboard)/tareas/`) — kanban 4-col paper-0 + border ink-1 + pri-stripe 3px, dictionary-table list-view, detail sheet con dp-hd + meta-grid + details collapsibles, form editorial inputs.
- **Agentes** (`src/app/(dashboard)/agentes/`) — 9 metric cards (serif 30px tabular-nums), config panel 6 sections editorial, preset cards selectables.
- **Automatizaciones** (`src/app/(dashboard)/automatizaciones/`) — dictionary-table listing + wizard editorial + React Flow canvas dotted-grid con nodos paper-0/stamp + AI builder chat + historial pills.
- **Analytics + Métricas** (`src/app/(dashboard)/analytics/` + `metricas/`) — Recharts re-themed via props (AreaChart rubric-2 + LineChart multi-series rubric/gold/verdigris), KPI strip dictionary-style, date-range popover portal-respectful.
- **Configuración** (`src/app/(dashboard)/configuracion/`) — integraciones (Shopify/SMS/BOLD + sync-status) + WhatsApp (landing/templates/equipos/quick-replies/costos) + tareas, forms editorial helpers reutilizables, sub-nav dictionary-list.

**Infraestructura compartida (Wave 0):**
- `src/lib/auth/dashboard-v2.ts` — server-side flag resolver `getIsDashboardV2Enabled(workspaceId)` (fail-closed try/catch, mismo pattern que `inbox-v2.ts`).
- `src/app/(dashboard)/fonts.ts` — loader EB Garamond + Inter + JetBrains Mono via `next/font/google` (per-segment preload con dedupe Next).
- `src/app/(dashboard)/layout.tsx` — wrapper conditional `theme-editorial` className + font vars basado en el flag.
- `src/components/layout/sidebar.tsx` — re-skin editorial conditional gated (paper-1 bg, smallcaps section labels, ink-1 border, rubric-2 active state, wordmark `morf·x`).
- `src/components/layout/dashboard-v2-context.tsx` — `DashboardV2Provider` + `useDashboardV2()` hook para propagación sin prop drilling.

**Shadcn primitives extendidos aditivamente (BC-additive `portalContainer?: HTMLElement | null`):**
- `sheet.tsx` (Plan 03 Pedidos), `alert-dialog.tsx` (Plan 04 Tareas), `dialog.tsx` (Plan 06 Automatizaciones). Heredan pattern de `dropdown-menu.tsx` + `popover.tsx` ya extendidos por fase Conversaciones Plan 01.

**CSS:**
- `src/app/globals.css` — bloque `.theme-editorial` heredado de fase Conversaciones (sin cambios estructurales; tokens canónicos reutilizados). **Cero cambios nuevos** al globals.

**Out-of-scope (deferred):**
- Módulos `whatsapp` (tiene su propio flag `ui_inbox_v2.enabled`), `super-admin`, `sandbox`, `onboarding`, `create-workspace`, `invite` — estos pueden romperse visualmente con flag ON (D-DASH-04). Si surge necesidad, fase `ui-redesign-dashboard-extras` con `[data-theme-override="slate"]` en sus layouts.
- Mobile responsive <1024px — fase futura.
- Dark mode editorial — fuera de scope (`.theme-editorial` forzado a `color-scheme: light`).
- Sistema de microanimaciones — fuera de scope.
- Admin UI para flipear flag sin SQL — operativo, no frecuente. Standalone separado low-priority.
- i18n del dashboard editorial — keys preservadas donde existían (D-DASH-18); textos nuevos hardcoded en español.
- `Select` primitive `portalContainer` extension — deuda si QA reporta leakage.

**Stack:** cero npm packages nuevos. Las 3 fuentes ya están en uso por la fase Conversaciones; `next/font/google` las cachea entre segments.

**Métricas:** 49 commits phase-scoped, 107 archivos tocados, +13,085 / -2,238 LOC (neto +10,847), 9 plans, 4 waves, ~1 día con paralelización.

**Reglas verificadas:**
- **Regla 6** (proteger dashboard productivo): cero cambios en `src/lib/domain`, `src/lib/agents`, `src/lib/automation`, `src/inngest`, `src/app/api`, `src/app/actions`, `src/hooks`. Verificable via `git log --grep="ui-redesign-dashboard|worktree-agent"` filtro phase-scoped (Check 6 del reporte DoD).
- **Regla 1** (push a Vercel): commits de Plans 01-09 pusheados al final de Plan 09.
- **Regla 4** (docs): este documento actualizado.
- **Coexistencia con flag inbox v2 (D-DASH-03):** un workspace puede tener uno, otro, ambos o ninguno activo.

**DoD verification:** `.planning/standalone/ui-redesign-dashboard/dod-verification.txt` (7 checks PASS: slate leakage por módulo, hsl antipattern delta=0, dark: delta=0, mx-* count 120≥50, tsc clean, Regla 6 NO-TOUCH phase-scoped, flag-OFF byte-identical).

**LEARNINGS:** `.planning/standalone/ui-redesign-dashboard/LEARNINGS.md` (12 secciones — 7 patterns establecidos, pitfalls, deferred, Regla 6, rollout playbook, recommendations, DoD evidence, commits ranges).

*Actualizado: 23 abril 2026 — Standalone `somnio-recompra-template-catalog` SHIPPED. Recompra independizado a nivel de templates: `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` (revierte fix T2 `cdc06d9`). Scope redefinido tras audit D-11 — los 3 templates que el plan iba a tocar ya existian en prod con copy equivalente o mejor (saludo/preguntar_direccion_recompra/registro_sanitario), y los gaps reales eran otros 3 intents (contraindicaciones, tiempo_entrega_1_3_days, tiempo_entrega_2_4_days zona DEFAULT) ahora cerrados via migration `20260423142420_recompra_template_catalog_gaps.sql` (aplicada en prod ANTES del push — Regla 5). Cambios de codigo: `response-track.ts` (TEMPLATE_LOOKUP_AGENT_ID + `{{direccion_completa}}` incluye departamento D-12 + export `resolveSalesActionTemplates`), `constants.ts` (agrega `'registro_sanitario'` a `INFORMATIONAL_INTENTS` D-06 — cierra deuda), `transitions.ts` (elimina entry `saludo` D-05 + `quiero_comprar → preguntar_direccion` con L5 D-04). Tests: 15 nuevos (9 transitions.test.ts + 6 response-track.test.ts) → suite recompra 32/32 green. Bug `.planning/debug/recompra-greeting-bugs.md` movido a `resolved/`. Ver `.planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md`.*

