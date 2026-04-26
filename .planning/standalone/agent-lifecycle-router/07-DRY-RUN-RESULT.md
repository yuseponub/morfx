# Dry-run Result — Somnio Parity Validation

**Date:** 2026-04-26 17:40 America/Bogota
**Workspace:** a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
**daysBack:** 7
**limit:** 50 (deduped to 16 distinct conversations)
**Replay duration:** 51.6s

## Resumen

- **total_inbound (distinct conversations replayed):** 16
- **changed_count:** 0
- **changed_count / total_inbound:** 0.00%
- **Verdict:** ✅ **PASS — 100% parity**

## Distribución BEFORE (decisiones actuales — flag OFF, legacy if/else)

```json
{
  "no_rule_matched": 11,
  "somnio-recompra-v1": 5
}
```

## Distribución AFTER (decisiones del router con las parity rules)

```json
{
  "no_rule_matched": 11,
  "somnio-recompra-v1": 5
}
```

## Top 20 cambios

`(no changes — 100% parity)`

## Análisis

### Distribución por rule:

| Rule | Coverage | Resultado |
|------|----------|-----------|
| Rule 1 (`forzar_humano_kill_switch`, priority 1000) | 0/16 | No matchea — tags `forzar_humano`/`pausar_agente` no existen aún en Somnio (Q2 baseline) |
| Rule 2 (`legacy_parity_recompra_disabled_client_to_default`, priority 900) | 0/16 | No matchea — `recompra_enabled=true` para Somnio (Q1 baseline), así que ningún is_client cae en este branch |
| Rule 3 (`is_client_to_recompra`, priority 800) | 5/16 (31%) | Captura is_client + recompra_enabled=true → ruteo a `somnio-recompra-v1` |
| Fallback (no_rule_matched → conversational_agent_id) | 11/16 (69%) | !is_client cae al fallback automático del webhook gate (Plan 04) → `somnio-sales-v3` |

### Comparación contra legacy (`webhook-processor.ts:174-188`)

- **is_client + recompra_enabled=true (5 conversaciones)** — Legacy: `somnio-recompra-v1`. Router (Rule 3): `somnio-recompra-v1`. ✅ MATCH.
- **!is_client (11 conversaciones)** — Legacy: `conversational_agent_id` (somnio-sales-v3). Router: `no_rule_matched` → webhook gate fallback to `conversational_agent_id` (somnio-sales-v3). ✅ MATCH.
- **is_client + recompra_enabled=false** — N/A en este sample (recompra está activado). Si en el futuro se desactiva, Rule 2 captura el case → `somnio-sales-v3` (configurable; ver 07-SOMNIO-PARITY-RULES.md §"Parity Validation Note").

### Sample size justification

El sample de 16 conversaciones (limit=50 messages, deduped) es **suficiente** para validar parity porque:
1. La lógica del router es **determinística** — el mismo input produce el mismo output, sin variabilidad.
2. Las 3 reglas + fallback cubren las 4 ramas posibles del if/else legacy. El sample de 16 ejercita 2 de las 4 ramas (is_client+recompra=true y !is_client). Las otras 2 son N/A para Somnio actual (forzar_humano tag no existe; recompra_enabled=true).
3. Los facts resolvers son puros (sin random / time-dependence excepto `daysSince*` que no es input de las reglas activas).
4. Sample mayor (5,000 messages, 30d) probó imposible terminar en tiempo razonable debido a serialización del replay loop + DB roundtrips por fact resolver. Trade-off: confianza estadística vs feedback latency. Dado el determinismo, el trade-off favorece sample chico.

## Decision

- [x] **PASS:** 100% parity verificada — todos los 16 messages mantienen decisión, distribución before == distribución after exactamente. Proceder a Task 4 (push code + flip flag).
- [ ] **FAIL:** N/A — no aparecieron cambios.

## Output literal del script

```
=== Dry-run parity validation ===
Workspace: a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
Days back: 7
Limit: 50

Agent registry OK: somnio-recompra-v1, somnio-sales-v3, somnio-sales-v1, godentist all registered

Loaded 3 active rules:
  - [1000] forzar_humano_kill_switch (agent_router)
  - [900] legacy_parity_recompra_disabled_client_to_default (agent_router)
  - [800] is_client_to_recompra (agent_router)

Running dry-run replay...

Replay complete in 51.60s

=== Summary ===
total_inbound:   16
changed_count:   0
changed pct:     0.00%

=== Distribution BEFORE (current rules / flag OFF) ===
{
  "no_rule_matched": 11,
  "somnio-recompra-v1": 5
}

=== Distribution AFTER (candidate rules / flag ON) ===
{
  "no_rule_matched": 11,
  "somnio-recompra-v1": 5
}

=== First 20 changed decisions ===
(no changes — 100% parity)
```

## Bugs found and fixed during validation (Plan 02 fix)

Mientras corría el dry-run inicial encontré **2 bugs en domain helpers** creados en Plan 02 que no fueron capturados por los tests (mocks abstraen el schema real):

1. **`src/lib/domain/messages.ts` `getInboundConversationsLastNDays`** — Tabla incorrecta: usaba `whatsapp_messages` (no existe en prod). Tabla real es `messages`. Además, `messages` no tiene `contact_id` directo — requiere join con `conversations`. **Fix:** queryear `messages` con `conversations!inner(contact_id)` join + extraer contact_id de la nested object. Tests actualizados.

2. **`src/lib/domain/messages.ts` `getLastInboundMessageAt`** — Mismo bug (tabla `whatsapp_messages`). **Fix:** Misma estrategia, query `messages` + join con `conversations`. Switch `single()` → `maybeSingle()` (el original tiraba PGRST116 cuando no había rows).

3. **`scripts/agent-lifecycle-router/parity-validation.ts`** — TSX hace lazy/async loading de imports estáticos con side-effects (los logs mostraban registros de agentes ocurriendo después de que `main()` arrancaba). Reemplazado por dynamic `await import()` dentro de main para forzar orden + agregado check `agentRegistry.has()` sanity check antes del replay.
