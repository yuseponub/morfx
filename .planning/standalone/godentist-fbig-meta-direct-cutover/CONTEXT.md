# CONTEXT — godentist-fbig-meta-direct-cutover

**Gathered:** 2026-06-06
**Status:** Ready for research
**Workspace target (cutover):** GoDentist Valoraciones `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`
**Agente que debe seguir respondiendo:** `godentist-fb-ig` (sibling shipped 2026-05-05 — DORMANT-via-ManyChat hoy, debe quedar LIVE-via-Meta)
**Handoff previo (discovery):** `.planning/standalone/godentist-fbig-meta-direct-cutover/HANDOFF.md`

---

<domain>
## Phase Boundary

Migrar **FB + IG de ManyChat a Meta Direct** y **eliminar ManyChat por completo del codebase**. Dos bloques:

**Bloque A — Wire + cutover (core funcional):**
Cablear el inbound de **Meta Direct FB/IG → pipeline de agente** (emitir el mismo evento Inngest que hoy emite el handler de ManyChat → `routeAgent` → agente), **gated** para que workspaces sin agente resuelto sigan human-only byte-idéntico (Varixcenter — Regla 6). Luego hacer el **cutover operacional** de GoDentist Valoraciones FB+IG a Meta Direct, dejando `godentist-fb-ig` respondiendo por el nuevo transporte.

**Bloque B — Decommission total de ManyChat (confirmado por el usuario con datos en mano):**
Reapuntar los otros 3 workspaces fuera de `manychat` y **borrar todo el código, settings, keys y env de ManyChat**. El usuario aceptó explícitamente que el FB/IG-vía-ManyChat de GoDentist/Somnio/Pruebas se apaga (están dormidos — ver evidencia abajo).

**En scope:**
- Wire Meta FB/IG inbound → dispatch de agente (gated por resolución de routing rule).
- Cutover GoDentist Valoraciones: conectar FB + IG (Meta Direct), flip `messenger_provider`/`instagram_provider` → `meta_direct`, suscribir página, borrar sus keys ManyChat.
- Reapuntar GoDentist (`36a74890`), Somnio (`a3843b3f`), Pruebas Morfx (`4b5d84dd`) fuera de `manychat`.
- Borrar: ruta `/api/webhooks/manychat`, `src/lib/manychat/**`, UI de settings ManyChat, env vars `MANYCHAT_*`, keys en settings, opción de provider `'manychat'` (según research: enum/migración).

**Fuera de scope:**
- WhatsApp: **queda en 360dialog** en TODOS los workspaces — NO se toca.
- Migrar Varixcenter (ya está en Meta Direct, human-only — se preserva byte-idéntico).
- Cambiar el comportamiento del agente `godentist-fb-ig` (catálogo, lead-capture, state machine) — el sibling es intacto; solo cambia el TRANSPORTE de entrada/salida.
- Bug aparte `contact_id` null en conversaciones FB/IG (standalone `channel-contact-resolution`).
</domain>

<decisions>
## Implementation Decisions

### Área 1 — Gate de dispatch (agente vs human-only)
- **D-01:** El gate es **auto por routing rule**: el path de Meta inbound (FB/IG) llama a `routeAgent` / `resolveAgentIdForWorkspace` para `(workspace_id, channel)`. Si resuelve un agente ≠ null → despacha al pipeline (Inngest → runner). Si null → queda **human-only** (comportamiento actual de Varixcenter). Cero config nueva. Mismo patrón que `godentist-fb-ig` (D-14/D-15: activación 100% por routing rule, sin flag).
- **D-02:** **Sin feature flag separado.** La resolución de agente ES el control. Varixcenter no tiene routing rule de agente FB/IG → null → human-only byte-idéntico (Regla 6). Rollback = re-flip de providers / desactivar routing rule (mientras el código pre-decommission siga vivo — ver D-07).
- **D-03:** El comportamiento human-only de Varixcenter y de cualquier workspace sin agente FB/IG debe quedar **byte-idéntico**. Tests de no-regresión obligatorios (grep + diff + behavioral: dispatch=0 cuando routeAgent=null).

### Área 2 — Secuencia de cutover (anti-doble-respuesta)
- **D-04:** Secuencia elegida: **conectar Meta primero, verificar, luego desconectar ManyChat.** 1) deploy del wire (aditivo) → 2) conectar FB + IG de Valoraciones (Meta Direct) → 3) flip providers msgr/ig → `meta_direct` (wa intacto) → 4) suscribir página en Meta App + verificar que el agente responde por Meta → 5) **inmediatamente** desconectar la página/IG en ManyChat. Hay ventana de solape breve; se mitiga con dedup (ver D-09) y con la inmediatez del paso 5.
- **D-05:** Durante el solape (paso 2-5), el riesgo de doble-respuesta se mitiga por: (a) idempotencia/dedup por message id en el path Meta (research OQ-5), (b) el flip de providers redirige el OUTBOUND a Meta de inmediato, (c) desconexión inmediata de ManyChat tras verificar.

### Área 3 — Credenciales y código ManyChat
- **D-06:** En el cutover de Valoraciones se **borran sus keys ManyChat** (`manychat_api_key`, `manychat_webhook_secret` de settings de ese workspace).
- **D-07:** **Decommission total confirmado.** Tras verificar Valoraciones LIVE por Meta, se: reapuntan los otros 3 workspaces fuera de `manychat`, y se **elimina todo el código ManyChat** (ruta webhook, `src/lib/manychat/**`, UI settings, env `MANYCHAT_*`, opción provider `'manychat'`). El usuario aceptó que esos 3 (dormidos) pierdan FB/IG-vía-ManyChat.
- **D-08:** **Checkpoint de seguridad entre A y B:** el borrado de código (Bloque B, difícil de revertir) ocurre **DESPUÉS** de que el cutover de Valoraciones (Bloque A) esté verificado en prod. Antes del checkpoint, rollback = re-flip providers a `manychat` + reconectar ManyChat (código aún vivo). Después del checkpoint, el rollback de manychat ya no aplica (es el punto de no retorno deliberado).

### Área 4 — Reapuntado de los otros 3 workspaces
- **D-09:** GoDentist (`36a74890`, 0 tráfico FB/IG), Somnio (`a3843b3f`, 0 en 37d, sin agente FB/IG), Pruebas Morfx (`4b5d84dd`, 1 test) se reapuntan fuera de `manychat`. **Valor destino a confirmar en research (OQ-8):** `meta_direct` sin página conectada (FB/IG efectivamente deshabilitado, sin sender activo) vs un valor neutro. NINGUNO tiene agente FB/IG enviando, así que el OUTBOUND no aplica; el efecto real es que su inbound-vía-ManyChat se apaga.
- **D-10:** **Regla 6 sobre Somnio:** Somnio es workspace productivo. Su FB/IG está dormido (0 conversaciones en 37 días, sin routing rule FB/IG) pero el cambio de provider toca un workspace productivo → requiere verificación explícita de que NINGÚN agente Somnio (sales-v3, recompra, pw-confirmation, v4) ni su WhatsApp se ven afectados (todos son WhatsApp/360dialog, channel-agnostic salvo las reglas de canal). WhatsApp NO se toca.

### Claude's Discretion
- Estructura interna del wire (dónde vive el gate en el path Meta, cómo se comparte el patrón de dispatch con el handler ManyChat antes de borrarlo) — research/planner deciden, respetando que el handler ManyChat se elimina al final.
- Orden de borrado de archivos en Bloque B (qué se borra primero para mantener typecheck/build verde por commit).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Este standalone
- `.planning/standalone/godentist-fbig-meta-direct-cutover/HANDOFF.md` — discovery completo, hallazgo human-only, valores de referencia (verify token, IDs, webhook URL).

### Scope del agente y reglas
- `CLAUDE.md` §"Godentist FB/IG Sibling Agent (`godentist-fb-ig`)" — PUEDE/NO PUEDE, validación, activación por routing rule (D-14/D-15).
- `CLAUDE.md` Regla 5 (migración antes de deploy), Regla 6 (proteger agente/canal en prod).
- `.claude/rules/agent-scope.md` §CRM Reader (consumidores) — patrón dispatch in-process.

### Inbound Meta (human-only hoy — a extender con dispatch gated)
- `src/app/api/webhooks/meta/route.ts` (llama processMessenger ~L157, processInstagram ~L210).
- `src/lib/instagram/webhook-handler.ts` (`processInstagramWebhook`).
- `src/lib/messenger/webhook-handler.ts` (`processMessengerWebhook`).

### Patrón de dispatch a agente (a replicar, luego el de ManyChat se BORRA)
- `src/lib/manychat/webhook-handler.ts` (paso `inngest.send` de evento de agente ~L250).
- `src/lib/agents/production/webhook-processor.ts` (`routeAgent`, gate `lifecycle_routing_enabled`, import godentist-fb-ig ~L260).
- `src/lib/agents/routing/route.ts`, `src/lib/agents/registry-helpers.ts` (`resolveAgentIdForWorkspace`).

### Providers / sender chokepoint
- `src/lib/domain/messages.ts` (`readMessengerProvider` / `readInstagramProvider`).
- `src/app/actions/meta-onboarding.ts` (ConnectFacebook / ConnectInstagram — connect Meta Direct).

### ManyChat (a eliminar en Bloque B — mapear blast radius)
- `src/app/api/webhooks/manychat/route.ts`, `src/lib/manychat/**`, settings UI ManyChat, env `MANYCHAT_*`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `godentist-fb-ig` agente + 79 templates + routing rule (`channel in [fb,ig]`, prio 100) YA existen — no se crean.
- Connect Meta Direct (`meta-onboarding.ts`) ya probado con Varixcenter (Phase 40/41) — multi-página resuelto (GAP-41-01/02/09).
- Sender meta_direct FB/IG (`meta-instagram-sender.ts`, `instagram-api.ts`) verificado funcionando (Phase 41).

### Established Patterns
- Dispatch in-process Inngest → routeAgent → agente (ManyChat handler hoy; se reusa el mecanismo en el path Meta).
- Gate por routing rule sin flag (precedente godentist-fb-ig D-14/D-15).
- Sender por provider via domain chokepoint (`readMessengerProvider`/`readInstagramProvider`).

### Integration Points
- `/api/webhooks/meta/route.ts` → processInstagram/processMessenger → (NUEVO) gate + dispatch.
- `workspaces.messenger_provider` / `instagram_provider` (flip a meta_direct).
- `workspace_meta_accounts` (filas creadas por el connect).

### Evidencia de tráfico (prod 2026-06-06 — base de la decisión de decommission)
- Workspaces con provider manychat (msgr/ig): **4 de 5** — GoDentist Valoraciones, GoDentist, Somnio, Pruebas Morfx.
- Conversaciones FB/IG: Valoraciones fb=979 (18 activas/7d, last 0d, único con agente FB/IG); GoDentist=0; Somnio fb=17 (0 en 37d, sin regla FB/IG); Pruebas fb=1 (test).
- Routing rules FB/IG de agente activas: **solo** Valoraciones (`godentist-fb-ig`). Reglas Somnio = WhatsApp.
- Scripts read-only usados: `scripts/_chk-manychat.ts`, `scripts/_chk-fbig-traffic.ts` (borrar tras research si se quiere).
</code_context>

<specifics>
## Specific Ideas

- El usuario quiere ManyChat **fuera del codebase** ("eliminar todo el código que tenga que ver con manychat y esta conexión. ya no lo necesitaremos") — no solo desconectar, sino borrar.
- WhatsApp se mantiene en 360dialog en todos los workspaces por ahora (decisión explícita, repetida).
- Secuencia preferida: conectar Meta primero, verificar, luego desconectar ManyChat.

## Open research questions (para research-phase)
- **OQ-1:** ¿`routeAgent`/`resolveAgentIdForWorkspace` resuelve `godentist-fb-ig` por la routing rule de canal cuando se invoca desde el path de Meta inbound? Gate exacto human-only vs agente. Confirmar Varixcenter → null → human-only.
- **OQ-2:** ¿`godentist-fb-ig` ENVÍA por sender meta_direct al flipear providers? Confirmar que su send pasa por el chokepoint (`readMessengerProvider`/`readInstagramProvider`) y no está hardcodeado a ManyChat.
- **OQ-3:** Ventana 24h: FB/IG meta_direct = solo 24h + tag HUMAN_AGENT (sin HSM). El agente responde a inbound (dentro de ventana) → OK; confirmar.
- **OQ-4:** ¿El path Meta inbound→agente necesita el lock interruption-system-v2? (`godentist-fb-ig` v4Path=false → inerte). Confirmar paridad con el handler ManyChat (que tiene infra de lock inerte).
- **OQ-5:** Dedup/idempotencia en el path Meta (`message.mid`, IGSID) — confirmar que no hay doble-proceso, especialmente durante el solape ManyChat↔Meta.
- **OQ-6:** Blast radius del borrado ManyChat: enumerar TODOS los archivos/refs/imports/env; confirmar que nada compartido (ej. contact resolution) se rompe.
- **OQ-7:** ¿`'manychat'` es un enum/CHECK constraint en `workspaces.messenger_provider`/`instagram_provider`? ¿Migración para dropearlo (Regla 5) o dejar el valor sin uso?
- **OQ-8:** Reapuntado de los 3 workspaces: ¿a `meta_direct` sin página (FB/IG deshabilitado de facto) o valor neutro? Confirmar comportamiento del domain cuando provider=meta_direct sin `workspace_meta_accounts`.
</specifics>

<deferred>
## Deferred Ideas

- Migrar el FB/IG **real** de GoDentist/Somnio/Pruebas a Meta Direct con páginas conectadas (hoy solo se reapuntan/apagan porque están dormidos). Si alguno vuelve a necesitar FB/IG, es trabajo aparte.
- Bug `contact_id` null en conversaciones FB/IG (`normalizePhone('ig-/fb-...')`=null) → standalone `channel-contact-resolution`.
- Re-smokes en vivo pendientes de Phase 41 (media IG/FB) — separados de este standalone.
</deferred>

---

*Standalone: godentist-fbig-meta-direct-cutover*
*Context gathered: 2026-06-06*
