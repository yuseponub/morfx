# Phase 38: Embedded Signup + WhatsApp Inbound - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Un workspace puede conectar su cuenta de WhatsApp Business de Meta (Cloud API directo, sin 360dialog) y los mensajes entrantes llegan a MorfX por un webhook seguro y deduplicado, apareciendo en el inbox **idénticos** a los de 360dialog y entrando al **mismo pipeline de agentes**.

Esta fase entrega DOS cosas, en este orden:
1. **Camino mínimo (deliverable 1):** endpoint `/api/webhooks/meta` (inbound) + conexión manual de UN número de prueba → validación end-to-end con riesgo cero.
2. **Embedded Signup multi-tenant (deliverable 2):** UI autoservicio "Conectar WhatsApp", intercambio de token (code → BISUAT), auto-suscripción a webhooks. Se construye ENCIMA del cimiento ya probado en el deliverable 1.

NO incluye outbound/envío (Fase 39), ni FB Messenger (Fase 40), ni Instagram (Fase 41). Excepción de prueba: ver Deferred — un envío mínimo para validar ida/vuelta puede evaluarse en planning sin expandir el scope formal.
</domain>

<decisions>
## Implementation Decisions

### Estrategia de arranque / alcance
- **D-01:** Secuencia = **camino mínimo primero**, luego Embedded Signup. Primero el webhook inbound + conexión manual de 1 número (validar firma/recepción/inbox), DESPUÉS el Embedded Signup multi-tenant. Ambos dentro de la Fase 38. Motivo: el webhook es compartido por ambos caminos (no es trabajo desechable); lo único desechable es el insert manual del token (una fila SQL trivial). De-risk del componente más difícil de debuggear (firma HMAC) con un número controlado antes de exponer autoservicio a clientes reales.
- **D-02:** Credencial del número de prueba = **System User token permanente** (generado manualmente en Business Settings, para números del portafolio propio), guardado cifrado en `workspace_meta_accounts`. NO expira → no hay que repetir setup. El token multi-tenant de producción real es el **BISUAT** que entrega el flujo Embedded Signup (deliverable 2), uno por workspace/cliente.
- **D-03:** El modelo multi-tenant NO cambia: `workspace_meta_accounts` guarda **una fila por (workspace, canal)** con su propio token cifrado. La diferencia entre deliverable 1 y 2 es solo CÓMO entra el token a esa fila (insert manual vs popup Embedded Signup) — ambos terminan en la misma tabla per-workspace. El System User token NO reemplaza lo multi-tenant; es solo el atajo para la primera prueba.

### Aislamiento de 360dialog (Regla 6 — Somnio intacto)
- **D-04:** Routing por **flag `whatsapp_provider` per-workspace**: default `'360dialog'` HOY (Somnio y todos los clientes actuales siguen igual), opt-in `'meta_direct'` activado manualmente por SQL por workspace. Mismo patrón de coexistencia no-breaking que somnio-v4 y otros agentes.
- **D-05:** Migración gradual: flipear workspace por workspace a `'meta_direct'` conforme migremos cada número que ya trabaja, validando uno a uno. Cuando todos estén migrados → cambiar el **default a `'meta_direct'`** y dejar 360dialog como fallback/legacy.
- **D-06:** Descartado el approach "por presencia de fila en `workspace_meta_accounts`" para decidir el routing — conectar un número flipearía el tráfico automáticamente, y queremos poder conectar/probar SIN activar tráfico hasta estar seguros. El flag explícito da ese control.
- **D-07:** El número de prueba se conecta en un **workspace de prueba dedicado/aparte** (nunca Somnio ni un cliente real). Aislamiento total: un mensaje al número de prueba jamás toca datos ni el agente de Somnio.
- **D-08:** La conexión Meta directo ES más rápida que 360dialog — llamadas directas a `graph.facebook.com` sin el relay intermediario. Ese es el beneficio de latencia de la migración.

### Reuso del pipeline de agentes
- **D-09:** `/api/webhooks/meta` **reusa `processWebhook`** (`src/lib/whatsapp/webhook-handler.ts`), idéntico a 360dialog. El endpoint nuevo solo cambia: (a) verifica firma HMAC-SHA256 con el **App Secret de Meta** (`META_APP_SECRET`) sobre el **body crudo** (`req.text()`, NO el JSON re-serializado — causa #1 de fallos), (b) resuelve workspace con `resolveByPhoneNumberId` (ya construido en Fase 37, `src/lib/meta/credentials.ts`) en vez de `workspaces.settings`, (c) usa `META_WEBHOOK_VERIFY_TOKEN` para el handshake GET. Resultado: inbox, agentes (v3/v4), dedup — todo idéntico, cero duplicación de lógica. NO escribir un handler nuevo dedicado (duplicaría lógica y arriesga divergencia entre los dos caminos).
- **D-10:** Dedup por `wamid` sale **gratis** al reusar `processWebhook`: la tabla `messages` ya tiene `wamid TEXT UNIQUE` (`messages_wamid_unique`) y el domain layer ya descarta duplicados. Como Meta manda el mismo `wamid`, los reintentos de Meta (hasta 7x) se deduplican sin código nuevo. NO se necesita tabla de dedup nueva.

### Plan de prueba + modo Live
- **D-11:** Primera prueba de recepción con **tu otro WhatsApp real** (no el número de prueba de Meta). Requisito operacional: registrar ese número al WABA (verificación SMS/llamada) y que **NO esté activo en 360dialog** (un número vive en un solo WABA a la vez). Es el número que terminarás usando, así que la prueba es realista (conversación ida/vuelta de verdad).
- **D-12:** Pasar la app a **modo Live ANTES** de la prueba inbound. Meta no envía todos los webhooks en Development mode (confunde el debug). Live es a nivel de TU app (`1457229738955828`) y NO afecta 360dialog/ManyChat (corren bajo apps de Meta distintas — modelo de aislamiento estándar).
- **D-13:** Criterios de prueba exitosa: (1) handshake GET responde `hub.challenge` correctamente, (2) firma HMAC valida sobre body crudo, (3) mensaje entrante visible en el inbox idéntico a 360dialog, (4) dedup confirmado (reintento Meta no crea fila duplicada), (5) Somnio sigue 100% operativo en 360dialog sin cambios (Regla 6).

### "Human Agent" — NO bloqueante
- **D-14:** El permiso "Human Agent" (no aprobado en App Review) NO bloquea la mensajería de WhatsApp. Solo extiende la ventana de respuesta a 7 días y es feature de Messenger. Con `whatsapp_business_messaging` aprobado, recibir/responder en ventana 24h/templates funciona. NO re-solicitarlo para WhatsApp. (Relevante a futuro solo para Fase 40 FB Messenger.)

### Claude's Discretion
- Mecanismo exacto de almacenamiento del flag `whatsapp_provider` (columna en `workspaces` vs tabla `workspace_channel_config` vs `settings` JSONB) — decisión de planning/research, respetando que el default actual sea `'360dialog'`.
- Forma del insert manual del token de prueba (SQL directo vs mini-acción admin) — debe ser trivial (D-01).
- Detalles de manejo de errores del webhook (token revocado/expirado, payload malformado) y observabilidad/logging del flujo Meta — no discutidos explícitamente; Claude decide siguiendo patrones existentes del webhook 360dialog.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §"Phase 38: Embedded Signup + WhatsApp Inbound" (líneas ~562-581) — success criteria, dependencies (SIGNUP-01/02/03, WA-05, HOOK-01/02/03/04).
- `.planning/REQUIREMENTS.md` — IDs SIGNUP-01..03 (Embedded Signup + token exchange + auto-subscribe), WA-05 (recibir webhooks WA), HOOK-01..04 (endpoint unificado, HMAC, 200<5s, dedup por message_id).

### Foundation ya construida (Fase 37 — reusar, NO reconstruir)
- `src/lib/meta/credentials.ts` — `resolveByPhoneNumberId(phoneNumberId)` para routing inbound, `resolveByWorkspace(workspaceId, channel)` para outbound. Usar tal cual (D-09).
- `src/lib/meta/token.ts` — `encryptToken` / `decryptToken` (AES-256-GCM). Para guardar el System User token / BISUAT cifrado.
- `src/lib/meta/api.ts` — `metaRequest`, `sendWhatsAppText`, `sendWhatsAppTemplate`, `verifyToken`.
- `src/lib/meta/constants.ts` — `META_GRAPH_API_VERSION = 'v22.0'`, `META_BASE_URL`.
- `supabase/migrations/20260401100000_create_workspace_meta_accounts.sql` — tabla multi-tenant (1 fila por workspace+channel, token cifrado, unique en phone_number_id/page_id/ig_account_id).
- `.planning/phases/37-meta-app-setup-foundation/META-SETUP-GUIDE.md` — pasos exactos de dashboard Meta (webhook config, App Review, env vars, Tech Provider).

### Pipeline inbound existente (reusar — D-09/D-10)
- `src/app/api/webhooks/whatsapp/route.ts` — webhook 360dialog: patrón GET handshake, HMAC sobre body crudo, resolución de workspace, llamada síncrona a `processWebhook`. El nuevo `/api/webhooks/meta` lo espeja cambiando solo verificación/resolución (D-09).
- `src/lib/whatsapp/webhook-handler.ts` — `processWebhook(payload, workspaceId, phoneNumberId)` (línea 56). Mete mensaje al inbox + dispara agente + dedup por wamid. REUSAR.
- `supabase/migrations/20260130000002_whatsapp_conversations.sql` — `messages.wamid TEXT UNIQUE` (dedup gratis, D-10).
- `src/lib/channels/registry.ts` — channel registry (hoy whatsapp→360dialog hardcoded; Fase 39 lo hará provider-aware con `whatsapp_provider`).

### Documentación oficial Meta (orden de conexión — verificado 2026-06-02)
- WhatsApp Cloud API Get Started: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/
- Webhooks (handshake GET + HMAC X-Hub-Signature-256): https://developers.facebook.com/docs/graph-api/webhooks/getting-started/
- Securing requests (HMAC sobre raw body): https://developers.facebook.com/docs/graph-api/securing-requests/
- Embedded Signup overview: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
- Live Mode: https://developers.facebook.com/blog/post/2019/09/23/live-mode-for-production-use/
- Access tokens (System User / BISUAT): https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/
- Human Agent feature: https://developers.facebook.com/docs/features-reference/human-agent
- Messaging policy / enforcement (riesgos de bloqueo): https://business.whatsapp.com/policy

### Reglas del proyecto (CLAUDE.md)
- Regla 6: proteger agente en producción (Somnio en 360dialog intacto, feature flag) — D-04/D-07/D-13.
- Regla 3: toda mutación vía `src/lib/domain/*`.
- Regla 5: migraciones aplicadas en prod ANTES de pushear código que las usa.
- Regla 2: timezone America/Bogota.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveByPhoneNumberId` / `resolveByWorkspace` (`src/lib/meta/credentials.ts`): resolución de credenciales multi-tenant ya construida en Fase 37.
- `encryptToken`/`decryptToken` (`src/lib/meta/token.ts`): cifrado AES-256-GCM testeado 4/4.
- `processWebhook` (`src/lib/whatsapp/webhook-handler.ts`): pipeline inbound completo (inbox + agentes + dedup). Reusable casi tal cual para Meta.
- `verifyWhatsAppHmac` (`src/app/api/webhooks/whatsapp/route.ts`): patrón HMAC-SHA256 timing-safe sobre body crudo.
- `messages.wamid UNIQUE`: dedup a nivel DB ya existente.

### Established Patterns
- **360dialog ya usa el formato Cloud API de Meta:** el payload `whatsapp_business_account` con `entry[].changes[].value.metadata.phone_number_id` es idéntico. Esto hace que `/api/webhooks/meta` sea principalmente un cambio de verificación/resolución, no un pipeline nuevo.
- Webhook procesa SÍNCRONO (return 200 tras `processWebhook`) para no morir en el corte de Vercel — `maxDuration = 60`.
- Coexistencia de proveedores vía feature flag per-workspace (patrón somnio-v4, crm-mutation-tools).

### Integration Points
- Nuevo endpoint: `src/app/api/webhooks/meta/route.ts` (GET handshake + POST events).
- Flag `whatsapp_provider` (ubicación TBD en planning) leído en el punto de routing/envío.
- `workspace_meta_accounts` insert manual (deliverable 1) → luego vía Embedded Signup (deliverable 2).
- Env vars ya en Vercel: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_TOKEN_ENCRYPTION_KEY`.
</code_context>

<specifics>
## Specific Ideas

- Hallazgo clave: el pipeline inbound de 360dialog YA es compatible con el formato Meta Cloud API → Fase 38 más liviana de lo esperado. El esfuerzo real está en (a) el endpoint con verificación/resolución Meta-específica y (b) el Embedded Signup multi-tenant (deliverable 2).
- App ID del usuario: `1457229738955828`. App Review aprobado para whatsapp_business_messaging, whatsapp_business_management, pages_messaging, instagram_manage_messages, etc. "Human Agent" no aprobado (no bloquea — D-14).
- Freelancer ayudó a aprobar App Review; la app quedó a nombre del usuario con sus links/docs. Aprobación válida en SU app.
</specifics>

<deferred>
## Deferred Ideas

- **Envío/outbound de WhatsApp por Meta directo** — Fase 39 (WA-01..09, MIG-01/MIG-03). Nota: para una prueba de conversación ida/vuelta completa con el número real (D-11), planning puede evaluar un envío MÍNIMO (un texto vía `sendWhatsAppText` ya existente) como paso de validación, sin asumir el scope completo de Fase 39. Decisión de planning.
- **FB Messenger directo** — Fase 40.
- **Instagram Direct** — Fase 41.
- **CRUD de templates / media CDN / read receipts** — Fase 39.
- Bloques B/C/D de Business Verification (email corporativo, Facebook Page, resubmit) — pasos manuales del usuario fuera de código (Fase 37.5).

None de scope creep surgió durante la discusión.
</deferred>

---

*Phase: 38-embedded-signup-wa-inbound*
*Context gathered: 2026-06-02*
