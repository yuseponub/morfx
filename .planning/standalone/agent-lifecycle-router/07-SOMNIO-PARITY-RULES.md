# Somnio Parity Rules — agent-lifecycle-router v1

**Created:** 2026-04-26 11:47:18 America/Bogota (16:47 UTC)
**Workspace:** a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
**Approach:** Opcion B (D-15 strict 100% parity) — fact `recompraEnabled` consume `workspace_agent_config.recompra_enabled` para replicar el switch legacy sin divergencias.
**Created via:** SQL INSERT directo en Supabase Studio (más rápido que admin form, mismo resultado verificable).

## Production state at creation

- Somnio `recompra_enabled = true` → todos los is_client caen a Rule 3 (is_client_to_recompra → somnio-recompra-v1)
- Somnio `conversational_agent_id = somnio-sales-v3` → Rule 2 usa este literal; cualquier !is_client cae a `no_rule_matched` → fallback automático a `somnio-sales-v3` (Plan 04 webhook gate)

## Rules Created

### Rule 1 — forzar_humano_kill_switch (priority 1000)
- **id:** `a2ea3a67-3aab-4223-9368-5f97a4b5d431`
- **rule_type:** agent_router
- **priority:** 1000
- **conditions:**
  ```json
  { "all": [{ "fact": "tags", "operator": "arrayContainsAny", "value": ["forzar_humano", "pausar_agente"] }] }
  ```
- **event:** `{ "type": "route", "params": { "agent_id": null } }` → `reason='human_handoff'` (bot no responde)
- **active:** true
- **Razón:** Kill switch (D-04). Permite que admin/operador silencie al bot por contacto agregando una de las 2 tags. Reemplaza el patrón skip-tags legacy de webhook-handler.ts:91 (que usaba `WPP/P/W/RECO`) con un mecanismo más explícito y observable vía routing_audit_log.
- **Nota:** Las tags `forzar_humano` y `pausar_agente` aún NO existen en Somnio (Q2 snapshot baseline). Se crean bajo demanda desde la UI normal de tags (Regla scope: tags se crean desde UI tags, no desde router). Hasta entonces, esta regla no matchea nada — comportamiento por defecto.

### Rule 2 — legacy_parity_recompra_disabled_client_to_default (priority 900) — B-1 fix
- **id:** `9f6789c5-b9f4-4296-bf3c-ccfd0fd940ab`
- **rule_type:** agent_router
- **priority:** 900
- **conditions:**
  ```json
  { "all": [
    { "fact": "isClient", "operator": "equal", "value": true },
    { "fact": "recompraEnabled", "operator": "equal", "value": false }
  ]}
  ```
- **event:** `{ "type": "route", "params": { "agent_id": "somnio-sales-v3" } }`
- **active:** true
- **Razón:** Replica el branch `if (contactData?.is_client) { if (!recompraEnabled) ... }` de webhook-processor.ts:174-188. Cuando recompra está desactivado, el cliente cae al `conversational_agent_id` del workspace (somnio-sales-v3 actualmente), evitando silencio.
- **Mantenimiento:** El literal `'somnio-sales-v3'` es el valor de `workspace_agent_config.conversational_agent_id` para Somnio al momento de crear la regla. Si Somnio cambia su `conversational_agent_id` en el futuro, esta regla DEBE actualizarse correspondientemente. Documentado como mantenimiento en 07-FLIP-PLAN.md.
- **Estado actual:** Como `recompra_enabled=true` para Somnio, esta regla NO matchea hoy — Rule 3 captura todos los is_client. La regla queda activa por correctness conceptual (cubre el caso si el usuario flippea recompra_enabled=false en el futuro sin tocar el router).

### Rule 3 — is_client_to_recompra (priority 800)
- **id:** `7e642b5b-698f-4af8-b1b4-741e9177e95b`
- **rule_type:** agent_router
- **priority:** 800
- **conditions:**
  ```json
  { "all": [
    { "fact": "isClient", "operator": "equal", "value": true },
    { "fact": "recompraEnabled", "operator": "equal", "value": true }
  ]}
  ```
- **event:** `{ "type": "route", "params": { "agent_id": "somnio-recompra-v1" } }`
- **active:** true
- **Razón:** Replica el branch `if (contactData?.is_client && recompraEnabled) { route to recompra }` de webhook-processor.ts. Es el branch que captura ~80.8% del tráfico Somnio (17,204 clients / 21,295 contactos según Q4 snapshot).

## Behavior expected (parity 100% con webhook-processor.ts:174-188)

| Caso | Legacy (flag OFF) | Router (flag ON) | Match? |
|------|-------------------|------------------|--------|
| tag forzar_humano / pausar_agente | (skip-tag handling existente — bot silencia o pause) | reason=human_handoff (Rule 1, agent_id=null) | YES — formaliza skip handling |
| is_client + recompra_enabled=true | route to somnio-recompra-v1 | reason=matched, agent_id=somnio-recompra-v1 (Rule 3) | YES |
| is_client + recompra_enabled=false | recompra_disabled_client_skip (silencio) | reason=matched, agent_id=somnio-sales-v3 (Rule 2) | DIVERGE (intentional, see note below) |
| !is_client | route to conversational_agent_id (somnio-sales-v3) | reason=no_rule_matched → fallback to conversational_agent_id (somnio-sales-v3 per Plan 04) | YES |

## Parity Validation Note (D-15)

El caso **"is_client + recompra_enabled=false"** en legacy hace `return { success: true }` que es silencio (ningún agente responde). La Rule 2 enruta a `somnio-sales-v3` para evitar perder al cliente.

**Estado actual (2026-04-26):** `Somnio.recompra_enabled = true`, así que este caso NO ocurre en producción. La divergencia es teórica — solo aparece si el usuario flippea recompra_enabled=false. Ambas opciones son válidas:

1. **Rule 2 con `agent_id: 'somnio-sales-v3'`** (current — recupera tráfico al agente conversacional default)
2. **Rule 2 con `agent_id: null`** (silencio idéntico al legacy)

El dry-run en Task 3 captura este case explícitamente. Como `recompra_enabled=true`, el dry-run debe mostrar `changed_count = 0` para parity 100%. Si Somnio cambiara `recompra_enabled=false` en el futuro y prefiere silencio, modificar Rule 2 a `agent_id: null`.

## SQL para reproducir (idempotente vía DELETE primero)

```sql
DELETE FROM routing_rules WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
-- Re-run el bloque de INSERT en /tmp/somnio-parity-rules.sql
```
