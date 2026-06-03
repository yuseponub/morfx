# Phase 39: WhatsApp Outbound + Templates - Context

**Gathered:** 2026-06-03
**Status:** Ready for research/planning
**Alias:** "meta-direct-outbound" (informal name used while closing Phase 38)

<domain>
## Phase Boundary

Workspaces conectados por Meta directo pueden **enviar** todos los tipos de mensaje de WhatsApp
y **gestionar templates** vía Cloud API, con el flag per-workspace `whatsapp_provider`
(`'meta_direct' | '360dialog'`) decidiendo qué sender se usa — habilitando migración gradual
sin romper 360dialog/Somnio (Regla 6).

Incluye (scope ROADMAP Phase 39 — FIJO): WA-01 texto, WA-02 media (imagen/video/audio/doc/sticker),
WA-03 enviar templates, WA-04 interactivos (botones/listas), WA-06 download/upload media vía Meta CDN,
WA-07 read receipts, WA-08 CRUD de templates (crear/listar/eliminar/sync status), WA-09 template-status
webhooks (push, no polling), MIG-03 channel sender registry provider-aware. (MIG-01 el flag ya existe
desde Phase 38.)

NO incluye: FB Messenger (Phase 40), Instagram (Phase 41). El inbound ya quedó en Phase 38.
</domain>

<decisions>
## Implementation Decisions

### Secuencia / alcance del build
- **D-01:** **Construir TODO el scope completo ANTES del primer cutover.** No slice fino — se
  implementan texto + media + templates (CRUD completo) + interactivos + read-receipts + el switch
  de provider, y recién con todo listo se migra el primer número. (Usuario: "todo antes del cutover".)
  El planner organiza en olas internas, pero el cutover real espera a tener la superficie completa.

### Routing de provider (MIG-03)
- **D-02:** Volver **provider-aware el `ChannelSender` registry existente** (`src/lib/channels/registry.ts`).
  Hoy `getChannelSender('whatsapp')` → `whatsappSender` (360dialog). El nuevo diseño resuelve
  `workspace.whatsapp_provider` y enruta whatsapp → `whatsappSender` (360dialog) **o** un nuevo
  `metaWhatsappSender` (Cloud API). **Default sigue `360dialog`** (Regla 6 — Somnio y todos los
  clientes actuales intactos hasta flip explícito por SQL).
- **D-02b (discreción Claude/planner, con constraint):** El `metaWhatsappSender` resuelve credenciales
  Meta (BISUAT desencriptado + `phone_number_id`) vía `resolveByWorkspace` (`src/lib/meta/credentials.ts`).
  El mecanismo exacto de threading (extender la firma de `ChannelSender` vs resolver dentro del sender por
  `workspaceId`) lo decide el research/planner — PERO no debe romper el path 360dialog existente
  (la firma actual `send(apiKey, to, ...)` debe seguir funcionando byte-idéntica para 360dialog).

### Primer cutover (validación real)
- **D-03:** El **primer número que se flipea a `meta_direct` es el de prueba** (Pruebas Morfx,
  `+57 310 5197782`, ya CONNECTED en Phase 38). Riesgo cero a producción. Somnio + clientes reales
  migran DESPUÉS, uno por uno, tras validar el ciclo completo en el número de prueba (Regla 6).

### Ventana de servicio de 24h (WhatsApp)
- **D-04:** **Mantener el comportamiento actual — NO agregar lógica nueva.** El check de ventana
  (`last_customer_message_at` + "Ventana de 24h cerrada. Usa un template.") ya existe en
  `src/app/actions/messages.ts` y vive en el action layer (ARRIBA del sender), así que **se hereda
  gratis para Meta**. Fuera de 24h se bloquea el texto libre y la UI pide usar template — paridad
  total con 360dialog. (El "auto-template de re-engagement" se descarta de esta fase → Deferred.)
  NOTA: el 131047 que vimos al cerrar Phase 38 NO fue por la ventana sino por routing al número
  360dialog equivocado — D-02 lo arregla de raíz.

### Templates (WA-08/09) — "todo super completo"
- **D-05:** **Gestión de templates por Meta COMPLETA y research-driven.** Crear, listar, eliminar,
  sincronizar status (vía webhook push, WA-09), y todo el flujo de creación (igual que el builder
  actual). **Usar el `config-builder-whatsapp-templates` existente como BASE**, extendido para Meta
  (provider-aware o flujo Meta completo — el research decide la forma exacta). El usuario quiere
  funcionalidad total, no un MVP.
  - **RESEARCH OBLIGATORIO — edición de templates:** el usuario mencionó "editar templates". Meta
    Cloud API **NO permite editar templates aprobados** (se eliminan y recrean; ediciones limitadas
    solo en rejected/paused en versiones recientes del Graph API). El research DEBE mapear exactamente
    qué es editable por Meta y reflejar la realidad en la UI (no prometer editar lo que no se puede).

### Media (WA-02/06)
- **D-06:** En scope, completo. Meta exige **subir media a Meta CDN** (obtener media ID) ANTES de
  enviar — distinto de 360dialog que toma una URL. Inbound: la media de Meta llega como URLs del CDN
  con expiry ~5 min → **descargar a Supabase Storage** (reusar patrón existente). Provider-aware en el
  sender. (Detalle de implementación = research/planner.)

### Read receipts (WA-07) + Interactivos (WA-04)
- **D-07:** Read receipts (palomitas azules) vía Cloud API al abrir conversación, provider-aware.
- **D-08:** Mensajes interactivos (botones/listas) vía Cloud API. Ambos en scope; forma exacta =
  discreción del planner.

### Claude's Discretion
- Mecanismo de threading de credenciales Meta en el sender (D-02b).
- Implementación de upload/download de media Meta CDN.
- Punto de disparo de read receipts.
- Builder de mensajes interactivos.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §"Phase 39: WhatsApp Outbound + Templates" — goal, deps, 5 success criteria.
- `.planning/REQUIREMENTS.md` — WA-01..09, MIG-01 (flag, ya hecho), MIG-03 (sender registry provider-aware).

### Phase 38 (lo que ya existe — reusar, NO reconstruir)
- `.planning/phases/38-embedded-signup-wa-inbound/38-CONTEXT.md` §D-04/D-05/D-06 — flag `whatsapp_provider`, coexistencia no-breaking, migración gradual.
- `.planning/phases/38-embedded-signup-wa-inbound/PLAYBOOK-number-activation.md` §"GAP DE OUTBOUND" — el diagnóstico del 131047 + por qué el send es 360dialog-only hoy + el diseño recomendado del switch centralizado.
- `.planning/phases/38-embedded-signup-wa-inbound/38-VERIFICATION.md` — outbound declarado explícitamente fuera de Phase 38 → es esta fase.

### Código a tocar / reusar (integration points)
- `src/lib/channels/registry.ts` — `getChannelSender(channel)` (hoy whatsapp→360dialog). MIG-03 lo vuelve provider-aware.
- `src/lib/channels/types.ts` — interface `ChannelSender` / `ChannelSendResult` (la firma a respetar/extender).
- `src/lib/channels/whatsapp-sender.ts` — `whatsappSender` (wrapper 360dialog actual; NO romper).
- `src/lib/meta/api.ts` — `sendWhatsAppText` / `sendWhatsAppTemplate` (helpers Meta ya existentes, SIN USAR — base del `metaWhatsappSender`).
- `src/lib/meta/credentials.ts` — `resolveByWorkspace(workspaceId, channel)` para resolver BISUAT + phone_number_id del workspace (outbound).
- `src/lib/meta/token.ts` — `decryptToken` (AES-256-GCM) para el BISUAT guardado.
- `src/lib/domain/messages.ts` — `sendTextMessage`/`sendMediaMessage`/`sendTemplateMessage` (path de envío + persistencia; provider-agnostic arriba del sender).
- `src/app/actions/messages.ts` — check de ventana 24h existente (`last_customer_message_at` → "usa template"); hoy resuelve `apiKey = settings.whatsapp_api_key || env.WHATSAPP_API_KEY` (el fallback que causó el 131047).
- `src/lib/whatsapp/templates-api.ts` + `src/lib/config-builder/templates/**` — builder/CRUD de templates 360dialog actual (BASE para WA-08/09 Meta — D-05).
- `src/lib/meta/constants.ts` — `META_GRAPH_API_VERSION = 'v22.0'`, `META_BASE_URL`.
- `workspace_meta_accounts` + `workspaces.whatsapp_provider` — credenciales Meta per-workspace + el flag de routing.

### Docs oficiales Meta (research debe verificar contra la versión vigente v22.0)
- Cloud API send messages: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
- Media upload/download (Meta CDN): https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
- Message Templates (create/manage, edit constraints): https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- Template status webhooks: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
- Customer service window (24h) + re-engagement (131047): https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChannelSender` interface + `getChannelSender` registry — ya existe la abstracción de senders; MIG-03 solo la vuelve provider-aware.
- `sendWhatsAppText` / `sendWhatsAppTemplate` (`meta/api.ts`) — helpers Meta ya escritos, listos para el `metaWhatsappSender`.
- `resolveByWorkspace` (`meta/credentials.ts`) + `decryptToken` — resolución de credenciales Meta per-workspace.
- Check de ventana 24h en `actions/messages.ts` — provider-agnostic, se hereda gratis (D-04).
- Builder/CRUD de templates 360dialog (`config-builder-whatsapp-templates`) — base para WA-08/09.
- Patrón de download de media inbound → Supabase Storage (existente para 360dialog).

### Established Patterns
- Coexistencia no-breaking via flag per-workspace (somnio-v4, crm-mutation-tools, godentist-fb-ig). Aplica idéntico aquí: default 360dialog, opt-in meta_direct.
- Regla 3: toda mutación/envío pasa por domain layer; el sender es el borde externo.

### Integration Points
- Punto único de decisión de provider: el registry/resolver de senders (D-02). Hay que asegurarse de que TODAS las superficies de envío (inbox, agente `engine-adapters/production/messaging.ts`, automatizaciones `action-executor.ts`, contact-reviews) pasen por ahí — no parchear sitio por sitio (lección del diagnóstico de Phase 38).
</code_context>

<specifics>
## Specific Ideas
- El usuario quiere templates "todo super completo" — funcionalidad total (incl. lo que hoy hace el builder), no un mínimo. Research-driven.
- Validar el ciclo entero en el número de prueba ya activado (+57 310 5197782) antes de tocar Somnio/clientes.
- El switch de provider debe ser CENTRALIZADO (una sola puerta), cubriendo todas las superficies de envío — explícitamente por la lección del 131047 (el inbox caía al `WHATSAPP_API_KEY` global).
</specifics>

<deferred>
## Deferred Ideas
- **Auto-template de re-engagement** (reabrir conversación automáticamente fuera de ventana 24h) — nueva capacidad, no esta fase (D-04).
- **Flip de Somnio / clientes reales a meta_direct** — operación de cutover posterior, tras validar en el número de prueba (D-03). Cada migración valida número por número.
- **Cambiar el default global a `meta_direct`** — cuando todos los números estén migrados (D-05 Phase 38). No en esta fase.
- FB Messenger (Phase 40), Instagram (Phase 41).
</deferred>

---

*Phase: 39-whatsapp-outbound-templates*
*Context gathered: 2026-06-03*
