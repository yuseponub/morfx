# Agent Spec: GoDentist FB/IG Sibling (godentist-fb-ig)

**Status:** Shipped 2026-05-05 (pending dropdown smoke + manual routing rule activation by operator)
**Standalone:** `.planning/standalone/agent-godentist-fb-ig/`
**Workspace target:** GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`)
**Channel:** Facebook Messenger + Instagram Direct (D-01)
**Habilitado por:** standalone `routing-channel-fact` (shipped 2026-05-04, commit `c410085`) — agrego el fact `channel` al motor de reglas. Este sibling es el primer caso de uso real del fact (D-20 reusable pattern).
**Patron base:** `agent-godentist` (in-prod) + `somnio-sales-v3-pw-confirmation` (shipped 2026-04-28).

---

## Quick reference

| Atributo | Valor |
|----------|-------|
| Agent ID | `godentist-fb-ig` |
| Source dir | `src/lib/agents/godentist-fb-ig/` |
| Webhook entry | `webhook-processor.ts` (branch `agentId === 'godentist-fb-ig'` paralelo al branch `'godentist'` linea 765) |
| Engine runner | `V3ProductionRunner` con `agentModule: 'godentist-fb-ig'` (extension de la union type) |
| Comprehension model | Anthropic Haiku (D-12 — igual que godentist) |
| State machine | Idem godentist verbatim (D-13) |
| Catalog | `agent_id='godentist-fb-ig'` en `agent_templates`, 79 rows clonados de godentist con saludo D-05 verbatim distinto |
| Pre-warm | `webhook-processor.ts` agrega el sibling al `Promise.all([import(...)])` (anti-Pitfall 2 / B-001 cold-lambda race) |
| VAL tag side-effect | `v3-production-runner.ts:597` extiende check a `agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'` (Pitfall 6 mitigation) |

---

## Scope

### PUEDE

- Atender mensajes inbound de **Facebook Messenger** (`channel='facebook'`) e **Instagram Direct** (`channel='instagram'`) en el workspace target (D-01 + D-02). En FB Messenger y Meta APIs, "facebook" es la superficie de mensajeria a la pagina (`conversations.channel='facebook'`).
- Emitir templates del catalogo propio bajo `agent_id='godentist-fb-ig'` (catalog independiente, 79 rows):
  - **Saludo D-05 (lead-capture)** — UNICO cambio vs godentist:
    ```
    👋 ¡Hola! Soy goBot 🤖 de godentist ®️.

    Tu valoración odontológica es totalmente GRATIS 🦷✨
    Déjanos estos datos y reservamos tu cita de inmediato:

    📌 Nombre completo
    📌 Celular

    🔒 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).

    Estás a un paso de comenzar tu nueva sonrisa 💙 ¿Deseas agendar tu cita de valoración GRATIS?
    ```
  - **Resto (~78 templates)** — clonados verbatim del godentist (precios por servicio, ubicaciones, horarios por sede, escape, follow-ups, english_response, etc.).
- Procesar el primer mensaje del cliente (turn 1, post-saludo) con LEAD CAPTURE (D-09):
  - Si turn 1 + intent='datos' + datos parciales → directo a `pedir_datos_parcial` con `{{campos_faltantes}}` calculado (helper puro `lead-capture.ts`).
  - Si turn 1 + datos criticos completos (nombre + celular + sede) → directo a `pedir_fecha`.
  - Si turn 1 + intent informational (ej: "cuanto cuestan los brackets?") → sales-track normal (D-07 reusa logica retomas existentes — `retoma_post_info`, `invitar_agendar`).
- Consultar disponibilidad real en **Dentos** via robot Railway compartido — `dentos-availability.ts` clonado verbatim (mismo robot `godentist-production.up.railway.app`, mismas credenciales JROMERO/123456, mismo workspace string `'godentist-valoraciones'` hardcoded — Q3 RESUELTA en Wave 0).
- Recibir tag `VAL` automaticamente cuando completa datos criticos (Pitfall 6 mitigated en `v3-production-runner.ts:597`). Los leads FB/IG cuentan en metricas igual que los WhatsApp.
- Coexistir con el agente `godentist` original sin afectarlo (D-04: agente original intact, default para WhatsApp).

### NO PUEDE

- Atender canales fuera de FB/IG (web chat, WhatsApp del workspace target, etc.) — D-01; si surgen requieren standalone separado.
- Operar en workspace distinto al target — D-02; la routing rule lo acota a `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`.
- Compartir catalog con godentist — D-08; tiene `TEMPLATE_LOOKUP_AGENT_ID = 'godentist-fb-ig'` literal en `response-track.ts` (Pitfall 1 prevention — anti-regresion del fix provisional `cdc06d9` revertido en somnio-recompra). El template lookup nunca cae al catalogo de godentist por error.
- Detectar `consentimiento_habeas` como intent — D-10; el consentimiento es implicito al enviar datos (D-06). NO se agrega un nuevo intent al `GD_INTENTS` array.
- Cambiar el modelo de comprehension — D-12; siempre Haiku. Cambiar a Sonnet/Opus introduce variable confusa para debug.
- Modificar el state machine de godentist — D-13. Reusa `validTransitions` verbatim. Cero deuda de schema en `agent_observability_events.state`.
- Activarse automaticamente — D-14; SIN feature flag, requiere routing rule manual del usuario en `/agentes/routing/editor`. Sin regla = sin trafico = aislamiento Regla 6 sin flag (mismo patron que `somnio-sales-v3-pw-confirmation` shipped 2026-04-28).
- Auto-crear su routing rule — D-15; el operador la crea con priority slot libre evitando colision con UNIQUE INDEX `uq_routing_rules_priority WHERE active=true` (Pitfall 4).
- Acceder a otros workspaces — `ctx.workspaceId` viene del execution context, NUNCA del input.
- Modificar el agente `godentist` original — D-04; el sibling es ADITIVO. Cualquier cambio que se "filtre" al godentist viola Regla 6.
- Importar `createAdminClient` o `@supabase/supabase-js` directamente — Regla 3 CLAUDE.md; toda mutacion via `@/lib/domain/*`.

## Validacion (gates verificables)

- `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/` retorna 0 matches no-comentario (Regla 3).
- `grep -rn "GODENTIST_AGENT_ID\b" src/lib/agents/godentist-fb-ig/` retorna 0 matches (anti-regression D-08, Pitfall 1 — el sibling NUNCA referencia la constante del godentist original).
- `grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts` retorna >=2 (pre-warm + dispatch — anti-Pitfall 2 / B-001 cold-lambda race).
- `grep -E "agentModule !== 'godentist' && (this\.config\.)?agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts` retorna match (anti-Pitfall 6 — VAL tag side-effect cubre ambos agentes).
- Suite tests: `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` retorna 6 suites con 93/93 tests passed (lock baseline post-Plan 06).
- DB sanity: `SELECT COUNT(*) FROM agent_templates WHERE agent_id='godentist-fb-ig'` retorna 79 (matches godentist baseline locked en Wave 0).
- DB sanity: `SELECT content FROM agent_templates WHERE agent_id='godentist-fb-ig' AND intent='saludo' AND priority='CORE'` contiene "goBot", "Habeas Data", "Ley 1581" (D-05 verbatim — verificado en Plan 07 APPLY-EVIDENCE).
- TypeScript compila sin errores: `npx tsc --noEmit` retorna 0 errores.

## Consumidores

- **Webhook FB/IG inbound** — flujo unico:
  1. POST `/api/webhooks/whatsapp` (compartido con FB/IG via `channel` discriminator) o endpoint Meta dedicado segun routing
  2. `webhook-processor.ts:processIncomingMessage` → feature flag check → `routeAgent({ contactId, workspaceId, conversationId })`
  3. Routing engine evalua reglas → cuando matchea la rule del operador (D-15) emite `agent_id='godentist-fb-ig'`
  4. Dispatch branch `agentId === 'godentist-fb-ig'` (paralelo al branch `'godentist'`) invoca `processMessage` del sibling
- **Sandbox QA** (opcional) — el sandbox del workspace target podria invocar al sibling si el operador lo escoge en el dropdown del sandbox-header. NO bloqueante para produccion.

## Integraciones

- **Routing engine** — fact `channel` (shipped 2026-05-04, standalone `routing-channel-fact`); el sibling es el primer caso de uso real del fact (D-20 reusable pattern para futuros siblings por canal).
- **TemplateManager** — cache 5min por `(agent_id, workspace_id)`; el sibling tiene su propio bucket separado del godentist. Lookup via `TEMPLATE_LOOKUP_AGENT_ID` constant del sibling.
- **Anthropic Haiku** — comprehension via `runWithPurpose('godentist_fb_ig_comprehension', ...)`; eventos observability con `agent: 'godentist-fb-ig'` en `agent_observability_events`.
- **Robot Railway Dentos** — `dentos-availability.ts` clonado verbatim; el robot acepta `workspaceId: 'godentist-valoraciones'` literal hardcoded (Q3 RESUELTA en Wave 0). Ambos agentes (godentist + sibling) consultan al mismo robot con misma cuenta.
- **VAL tag side-effect** — `applyGodentistValTagIfNeeded` (`v3-production-runner.ts:597`) ahora cubre ambos agentes; el check compound `agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'` previene que la metrica de leads FB/IG salga 0 falsamente (Pitfall 6).
- **Agent registry** — `src/lib/agents/registry.ts` registra `'godentist-fb-ig'`. Pre-warm via `Promise.all([import('@/lib/agents/godentist'), import('@/lib/agents/godentist-fb-ig'), ...])` en `webhook-processor.ts` (anti-Pitfall 2 / B-001).
- **Agent catalog** — `src/lib/agents/agent-catalog.ts` agrega entry para `'godentist-fb-ig'` para que el agent_id aparezca en el dropdown del routing-editor (`/agentes/routing/editor`).

## Activacion (D-15 manual)

Post-deploy, el operador va a `/agentes/routing/editor` y crea la regla. SQL pre-formado para evitar Pitfall 3 (workspace mismatch) + Pitfall 4 (priority collision):

```sql
-- Pre-check 1: verificar que el feature flag del lifecycle router esta activo en el workspace
SELECT lifecycle_routing_enabled
FROM workspace_agent_config
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
-- Esperado: true (si false, primero UPDATE workspace_agent_config SET lifecycle_routing_enabled=true WHERE workspace_id='f0241182-...')

-- Pre-check 2: verificar priority libres (UNIQUE INDEX uq_routing_rules_priority WHERE active=true)
SELECT priority, name FROM routing_rules
WHERE workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514' AND active=true
ORDER BY priority;
-- Wave 0 audit confirmo: 0 active rules en el workspace target → priority 100 libre.

-- Crear la rule (priority 100 recomendado segun Wave 0 audit):
INSERT INTO routing_rules (workspace_id, name, rule_type, priority, conditions, event, active)
VALUES (
  'f0241182-f79b-4bc6-b0ed-b5f6eb20c514',
  'GoDentist FB/IG sibling routing',
  'router',
  100,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('fact', 'channel', 'operator', 'in', 'value', ARRAY['facebook', 'instagram'])
    )
  ),
  jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'godentist-fb-ig')),
  true
);
```

Para desactivar (rollback rapido — recovery time <10s tras cache TTL):

```sql
UPDATE routing_rules SET active=false
WHERE name='GoDentist FB/IG sibling routing'
  AND workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
```

---

## Anti-patterns documentados (lecciones aprendidas)

- **NO modificar `src/lib/agents/godentist/`** — D-04; el sibling es ADITIVO. El agente `godentist` queda intacto y funcionando como default para WhatsApp. Patron identico a `somnio-sales-v3-pw-confirmation` vs `somnio-sales-v3` (shipped 2026-04-28).
- **NO compartir `TEMPLATE_LOOKUP_AGENT_ID` con godentist** — Pitfall 1; regresion documentada del fix provisional `cdc06d9` revertido en somnio-recompra-v1 (2026-04-23). El sibling DEBE tener su propio constant + sus propios INSERTs en migration.
- **NO crear feature flag** — D-14; activacion 100% via routing rule. Sin regla en `routing_rules` = sin trafico = aislamiento Regla 6 satisfecha sin flag.
- **NO insertar la routing rule en migration** — D-15; el operador la crea manualmente para evitar colision de priority + permitir control humano post-deploy.
- **NO cambiar modelo Haiku** — D-12; variable confusa para debug.
- **NO olvidar pre-warm import en webhook-processor** — Pitfall 2 / B-001 (cold-lambda race; agentRegistry vacio en lambdas frescas tira `route.ts:138 → unregistered agent_id` y cae a fallback_legacy).
- **NO olvidar extender VAL tag check** — Pitfall 6; sin la extension `agentModule !== 'godentist-fb-ig'` en el check compound, los leads FB/IG no se taggean y las metricas salen 0 falsamente.
- **NO crear nuevo intent `consentimiento_habeas`** — D-10; agrega ruido al clasificador Haiku sin valor.
- **NO crear nuevos estados en el state machine** — D-13; reusa `validTransitions` del godentist verbatim para cero deuda de schema.

## Tests que codifican el contrato

Suite completa en `src/lib/agents/godentist-fb-ig/__tests__/` (6 archivos, 93 tests passed al cierre de Plan 06):

1. `transitions.test.ts` — state machine + transition `nuevo → captura` directo cuando datos en turn 1.
2. `comprehension.test.ts` — Haiku clasifica correctamente los 23 intents + caso lead-capture (`"María López, 3001234567"` → `intent=datos, slots={nombre, telefono}`).
3. `lead-capture.test.ts` — helper puro `lead-capture.ts` con todos los branches de campos faltantes (Pitfall 5 — calculo correcto de `{{campos_faltantes}}`).
4. `sales-track.test.ts` — D-09 lead-capture parser + calculo de campos faltantes en turn 1.
5. `response-track.test.ts` — D-08 anti-regresion: `TEMPLATE_LOOKUP_AGENT_ID='godentist-fb-ig'` lookup nunca cae al catalogo godentist + saludo D-05 verbatim en turn 0.
6. `agent.test.ts` — E2E del pipeline: primer mensaje cliente con datos parciales → comprehension → sales-track → response-track → output incluye `pedir_datos_parcial` con `{{campos_faltantes}}` correctos.

## Cambios recientes

- **2026-05-05 (Plan 07):** Migration aplicada en prod — 79 godentist-fb-ig templates insertados con saludo D-05 verbatim. APPLY-EVIDENCE locked en `.planning/standalone/agent-godentist-fb-ig/07-APPLY-EVIDENCE.md`.
- **2026-05-05 (Plan 06):** 6 test suites + 93 tests passed (Wave 4).
- **2026-05-05 (Plan 05):** Wave 3 wiring complete — pre-warm + dispatch + agent-catalog + runner branch + VAL tag check.
- **2026-05-05 (Plan 04):** Lead-capture pure helper + sales-track adapted (D-09).
- **2026-05-05 (Plan 03):** Comprehension-prompt + comprehension + response-track + agent adaptados (D-08 anti-regresion + D-11 lead-capture examples).
- **2026-05-05 (Plan 02):** Verbatim clone de constants/state/transitions/dentos-availability + types/comprehension-schema/guards/phase.
- **2026-05-05 (Plan 01):** Wave 0 audit production — 79 godentist templates baseline locked, greenfield confirmado, Q1/Q2/Q3 RESUELTAS, priority 100 recomendado.

## Notas para el mantenedor

- Si en el futuro divergen FB e IG (ej: Instagram requiere flow distinto post-saludo), splitear en `godentist-fb` y `godentist-ig` como standalones separados. Hoy se mantienen unidos porque comportamiento esperado es identico (D-01).
- Si el patron "lead capture en saludo" prueba ser efectivo, considerar aplicarlo a `somnio-fb-ig` (futuro) reusando este pattern (D-20 reusable).
- El robot Railway Dentos es compartido con godentist. Si se cambian credenciales o endpoints, actualizar AMBOS agentes simultaneamente.
- La activacion del sibling es 100% manual del operador. El equipo de desarrollo NO mantiene un script E2E automatizado contra Meta APIs (costo + flakiness alta — D-18). El usuario hace pruebas manuales reales mandando mensajes a la pagina FB y al perfil IG del workspace.
