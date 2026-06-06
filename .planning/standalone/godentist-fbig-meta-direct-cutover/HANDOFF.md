# GoDentist FB/IG: ManyChat → Meta Direct cutover — HANDOFF

**Created:** 2026-06-06 (pre-compact handoff)
**Status:** DISCOVERY DONE (grounded facts below) — NOT started. Next: GSD discuss → research → plan → execute.
**Workspace:** GoDentist Valoraciones `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`

## Goal (user's words)

Conectar GoDentist FB **e** IG por **Meta Direct** (este sistema, el mismo flujo que Varixcenter), **desconectar ManyChat** para el workspace GoDentist Valoraciones, y que **los agentes que hoy responden vía ManyChat respondan por la nueva integración**. **WhatsApp se queda en 360dialog** por ahora (solo migran FB + IG).

## Grounded facts (verified in prod 2026-06-06 — NOT assumed)

- Workspace `f0241182-…`: `messenger_provider='manychat'`, `instagram_provider='manychat'`, `whatsapp_provider='360dialog'`. Settings tiene `manychat_api_key`, `manychat_webhook_secret`, `whatsapp_api_key`.
- `workspace_meta_accounts` para este ws: **NINGUNO** → FB/IG aún NO conectados a Meta Direct (hay que conectar la página FB + cuenta IG profesional).
- `routing_rules` activas: **1** — `"GoDentist FB/IG → godentist-fb-ig (lead capture)"`, priority 100, condición `{ fact:'channel', operator:'in', value:['facebook','instagram'] }`, evento `route → agent_id='godentist-fb-ig'`. **La regla es por canal (no depende del transporte) → ya enruta FB/IG al agente correcto.**
- Agente que responde hoy a FB/IG = **`godentist-fb-ig`** (sibling shipped 2026-05-05; 79 templates `agent_id='godentist-fb-ig'`; saludo lead-capture). Coexiste con `godentist` (WhatsApp).

## ⚠️ HALLAZGO CRÍTICO — esto define el alcance (código nuevo, no solo config)

El inbound de **Meta Direct IG/FB** (`processInstagramWebhook` / `processMessengerWebhook`, llamados desde `src/app/api/webhooks/meta/route.ts:157,210`) es **human-only por D-IG-01**: SOLO guarda el mensaje, **NO despacha a ningún agente** (ni Inngest, ni routeAgent). Se diseñó así para Varixcenter (inbox humano).

El agente `godentist-fb-ig` responde hoy porque el inbound llega por **ManyChat** (`/api/webhooks/manychat/route.ts` → `src/lib/manychat/webhook-handler.ts`), que en el paso 4/5 **emite un evento Inngest de agente** (`inngest.send(...)`, ~línea 250) → runner → `routeAgent` → `godentist-fb-ig`.

**Conclusión:** si solo conectamos Meta Direct + flip de providers, los DMs entran al inbox pero **el agente queda MUDO**. La migración REQUIERE:

### Trabajo de código (core)
Cablear el inbound de Meta IG/FB al **pipeline de agente** (emitir el mismo evento Inngest que ManyChat → `routeAgent` → `godentist-fb-ig`), **gated** para que:
- Workspaces CON agente resuelto para el canal (GoDentist, routing rule activa) → despachan al agente.
- Workspaces SIN agente (Varixcenter, human-only D-IG-01) → **siguen human-only, byte-idénticos (Regla 6).**

Patrón a replicar: el bloque de `src/lib/manychat/webhook-handler.ts` (find/create conv → store → contact_id → `inngest.send` evento de agente). Gate sugerido (a confirmar en research): `resolveAgentIdForWorkspace` / routeAgent resuelve un agente ≠ null para el (workspace, channel) → dispatch; si null → human-only. Varixcenter no tiene routing rule de agente → null → human-only preservado.
Considerar también la infra de interruption-system-v2 lock (ManyChat la tiene, inerte para godentist-fb-ig porque v4Path=false) — replicar inerte o omitir.

### Trabajo operacional (cutover, human-action)
1. **Conectar Facebook** (Configuración → Integraciones, logueado en ws GoDentist, con admin de la página FB de GoDentist) → crea fila `workspace_meta_accounts channel='facebook'` + suscribe webhook. Elegir la página correcta de GoDentist (el fix GAP-41-01/09 ya maneja multi-página; aquí no hay fila FB previa, así que el connect crea la del page elegido).
2. **Conectar Instagram** (mismo panel) → crea fila `channel='instagram'` (comparte page_id; uq_meta_page parcial ya lo permite, GAP-41-02).
3. **Flip providers:** `UPDATE workspaces SET messenger_provider='meta_direct', instagram_provider='meta_direct' WHERE id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514';` (WhatsApp queda 360dialog — NO tocar).
4. **Agregar la página de GoDentist al Meta App** (webhook fields page + instagram) si no está — verificar suscripción.
5. **Desconectar ManyChat:** en el dashboard de ManyChat, desconectar la página FB + cuenta IG de GoDentist para que ManyChat deje de recibir/responder esos DMs. (Coordinar timing para evitar doble-respuesta durante el solape — ver Riesgos.)

## Open questions / research items
1. ¿`resolveAgentIdForWorkspace` / `routeAgent` resuelve `godentist-fb-ig` por la routing rule de canal en el path de Meta inbound? ¿Cuál es el gate exacto para human-only vs agente? (confirmar Varixcenter queda human-only).
2. ¿El agente `godentist-fb-ig` envía por el sender meta_direct al flipear providers? Confirmar que su send pasa por el domain chokepoint (`readMessengerProvider`/`readInstagramProvider`) y no está hardcodeado a ManyChat.
3. ¿La ventana 24h aplica igual? FB/IG meta_direct = solo 24h + HUMAN_AGENT tag (sin templates HSM). godentist-fb-ig responde a inbound (dentro de ventana) → debería estar OK; confirmar.
4. ¿`webhook-processor`/runner para FB/IG meta_direct necesita el lock interruption-v2? (godentist-fb-ig v4Path=false → inerte). Confirmar paridad.
5. Dedup/idempotencia: ManyChat usa su `mid`; Meta usa `message.mid`/`m_…`/IGSID. Confirmar que no hay doble-proceso si ambos llegan durante el solape.

## Riesgos
- **Doble-respuesta durante el solape:** mientras ManyChat siga conectado Y Meta Direct activo, un mismo DM podría procesarse por ambos. Mitigar: secuencia de cutover (conectar Meta + flip + verificar → INMEDIATAMENTE desconectar ManyChat), o ventana de mantenimiento. Definir en discuss/plan.
- **Regla 6 (Varixcenter):** el cambio de código al inbound Meta IG/FB NO debe alterar el comportamiento human-only de Varixcenter ni de WhatsApp/godentist. Tests de no-regresión obligatorios.
- **Página/IG mal elegidos** en el connect (multi-página). Pre-chequear con SQL la fila creada.
- **Agente en prod** (godentist-fb-ig atiende clientes reales por ManyChat) — no romper durante la transición (Regla 6).

## Archivos clave (referencia)
- Inbound Meta (human-only hoy): `src/lib/instagram/webhook-handler.ts`, `src/lib/messenger/webhook-handler.ts`, llamados desde `src/app/api/webhooks/meta/route.ts`.
- Patrón de dispatch a agente (a replicar): `src/lib/manychat/webhook-handler.ts` (paso `inngest.send` ~L250) + `src/lib/agents/production/webhook-processor.ts` (`routeAgent`).
- Resolución de agente: `src/lib/agents/routing/route.ts`, `src/lib/agents/registry-helpers.ts` (`resolveAgentIdForWorkspace`).
- Connect Meta Direct: Configuración → Integraciones (`ConnectFacebook` / `ConnectInstagram`), `src/app/actions/meta-onboarding.ts`.
- Providers/sender chokepoint: `src/lib/domain/messages.ts` (`readMessengerProvider`/`readInstagramProvider`).
- Scope del agente: CLAUDE.md §"Godentist FB/IG Sibling Agent".

## Valores de referencia
- Workspace GoDentist Valoraciones: `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`.
- Agente: `godentist-fb-ig`. Routing rule ya existe (priority 100, channel in [facebook,instagram]).
- Verify token Meta (prod env `META_WEBHOOK_VERIFY_TOKEN`): `morfx_meta_60b065195e017e50c14d77e9f913c417`.
- Webhook URL: `https://www.morfx.app/api/webhooks/meta` (www, no apex).
- Rollback rápido: re-flip providers a `manychat` + reconectar ManyChat.

## GSD path (después del compact)
1. `/gsd-discuss-phase` (o discuss del standalone) — decisiones: gate human-only vs agente, secuencia de cutover anti-doble-respuesta, si se borran las manychat keys, feature flag sí/no.
2. `/gsd-research-phase` — confirmar open questions 1-5 (routeAgent en Meta inbound, sender chokepoint, lock, dedup).
3. `/gsd-plan-phase` — plan del código (wire Meta inbound → agente, gated, Regla 6 Varixcenter) + runbook operacional del cutover.
4. `/gsd-execute-phase` + cutover con el operador.
