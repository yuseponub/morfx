# Flip Plan + 24h Monitoring + v1.1 Cleanup Deferral

**Flip date:** 2026-04-27 09:09:04 UTC (04:09 America/Bogota)
**Workspace:** a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
**Rollout commit (pre-fix):** `16cafd4`
**Hotfix commit (cold-lambda race):** `c8de14a`

## Initial rollout incident (resolved)

Post-flip primer hour observability mostró **2/7 decisiones (28%) con `reason='fallback_legacy'`** (engine threw). Threshold del Plan 07 es <1% → tendría sido kill switch.

**Root cause:** Cold lambda race condition en `agentRegistry`. webhook-processor.ts importa `somnio-recompra` LAZY dentro del branch del agente (línea ~355). El router corre ANTES (línea ~215) y route.ts:138 valida `agentRegistry.has(agent_id)`. En lambdas frescas el módulo aún no está importado → throw → fallback_legacy.

**User-facing impact:** **CERO**. fallback_legacy cae al if/else legacy, que rutea al mismo `somnio-recompra-v1` que la regla habría matcheado. Solo afectó observabilidad / audit log.

**Fix** (commit `c8de14a`, pushed 2026-04-27 09:38 UTC): pre-warmup de los 4 agentes (`somnio-recompra`, `somnio-v3`, `somnio`, `godentist`) via `Promise.all([import(...)])` justo dentro del gate `if (routerEnabled && contactId)`, antes del `routeAgent` call.

**Validación post-fix:** 2/2 mensajes posteriores (09:54:43, 09:55:13 UTC) → `matched somnio-recompra-v1` ✅. Cero fallback_legacy post-fix.

## 24h monitoring checklist

- [x] **Hour +1 (Plan 07 Task 4 step 4):** routing_audit_log rows > 0 (9 rows total, 2 matched + 4 no_rule_matched + 2 fallback_legacy + 1 matched mejorando) ✅
- [x] **Hour +1: `reason='fallback_legacy'` rows post-fix = 0** ✅ (los 2 anteriores son del bug, ya parcheado)
- [ ] **Hour +6:** Distribución de `reason` consistente con dry-run Task 3 (esperado: ~80% matched somnio-recompra-v1, ~20% no_rule_matched fallback to somnio-sales-v3)
- [ ] **Hour +12:** Cero tickets de soporte por "el bot no responde" o "responde mal"
- [ ] **Hour +24:** P95 latency < 200ms (I-3 threshold). Query:
  ```sql
  SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
  FROM routing_audit_log
  WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
    AND decided_at > NOW() - INTERVAL '24 hours';
  ```
  **Estado actual** (sample de 9 rows): max=322ms, avg ~290ms, p95 estimado ~320ms → **POR ENCIMA del threshold I-3** pero pequeño sample. Re-evaluar a las 24h con volumen de producción real.
- [ ] **Hour +24:** KEEP flag ON si todo OK. KILL SWITCH si algún checkbox falla critical.

## KILL SWITCH

SQL (en Supabase Studio production):
```sql
UPDATE workspace_agent_config
SET lifecycle_routing_enabled = false
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
```

Recovery time: <10s (LRU TTL). Legacy if/else regresa instantáneamente. El código nuevo se queda intacto.

## Behavior change documentation

### "is_client + recompra_enabled=false" caso

**Estado actual (2026-04-27):** Somnio.recompra_enabled=true → este case NO ocurre. La Rule 2 (priority 900) está activa pero no matchea actualmente.

**Si en el futuro Somnio cambia a recompra_enabled=false:** Rule 2 captura el case y rutea a `somnio-sales-v3` (literal del actual conversational_agent_id). Esto **divierte** del legacy original, que silenciaba al cliente. Si se prefiere preservar silencio: cambiar Rule 2 a `event.params.agent_id: null` (human_handoff).

### Mantenimiento Rule 2 — vinculación al `conversational_agent_id`

La Rule 2 (priority 900) tiene `agent_id: 'somnio-sales-v3'` LITERAL. Si Somnio cambia su `workspace_agent_config.conversational_agent_id` en el futuro (ej: a `somnio-sales-v4`), la regla DEBE actualizarse correspondientemente. Esto NO es automático.

**Procedimiento de actualización:**
1. Desde admin form `/agentes/routing`, editar Rule 2 → cambiar `agent_id` al nuevo valor.
2. O via SQL directo: `UPDATE routing_rules SET event = jsonb_set(event, '{params,agent_id}', '"<nuevo>"') WHERE name='legacy_parity_recompra_disabled_client_to_default' AND workspace_id='a3843b3f-...';`
3. Cache TTL = 10s, cambio toma efecto en próxima lambda fresh.

## Bugs documentados (deuda técnica menor)

### B-001: `daysSinceLastInteraction` / `daysSinceLastDelivery` retornan -1

**Síntoma:** En facts_snapshot post-rollout aparece `-1` para `daysSince*`.

**Causa probable:** El resolver computa `Math.floor((now - lastInteractionAt) / 86_400_000)`. Si `lastInteractionAt` está milisegundos en el futuro (race entre webhook handling y this query), el resultado es `-1`.

**Impact:** Cero en routing actual — las 3 reglas Somnio NO usan estos facts. Solo afecta observabilidad.

**Fix:** Cambiar resolver a `Math.max(0, Math.floor(...))` o usar `>` en vez de `>=` en operadores `daysSinceAtMost`. Diferir a v1.1.

### B-002: lastInteractionAt timestamp en TZ Bogota mientras decided_at en UTC

**Síntoma:** `lastInteractionAt: 2026-04-27T14:09:48` mientras `decided_at: 2026-04-27 09:09:54+00`. 5 horas de offset (= UTC vs Bogota).

**Causa:** El resolver `lastInteractionAt` retorna el valor raw de `messages.created_at` que está en TZ Bogota (DB default). El audit log `decided_at` usa el mismo timestamp pero con offset explícito.

**Impact:** Cero en routing — no se usa para comparaciones temporales en las reglas actuales. Pero potencialmente confunde si llega regla nueva tipo `lastInteractionAt > X timestamp UTC`.

**Fix:** Normalizar resolver a ISO con offset explícito `+00:00`. Diferir a v1.1.

## v1.1 Cleanup deferral (D-15)

Después de ~1-2 semanas de rollout exitoso (criterios PASS en monitoring de 24h-7d):

1. Crear nuevo standalone phase: `agent-lifecycle-router-cleanup`
2. Tasks:
   - Borrar el bloque legacy if/else en `webhook-processor.ts` (el `if (!routerHandledMessage) { ... }` y todo lo que está adentro).
   - Borrar la columna `lifecycle_routing_enabled` de `workspace_agent_config`.
   - Borrar el case `reason='fallback_legacy'` del switch en webhook-processor.ts.
   - Aplicar fixes B-001 y B-002 (deuda técnica menor) si no se atendieron antes.
   - Update docs.

Hasta entonces, el legacy if/else SE QUEDA INTACTO en código (D-15 strict).

## Trigger de KILL SWITCH automático (futuro consideration v1.2)

Si en algún rollout futuro el `routing_audit_log` muestra > 1% de `reason='fallback_legacy'` en una ventana de 5 minutos, considerar agregar Inngest scheduled function que monitoree y emita alert. NO en scope v1.

## Próximos pasos para Jose (24h post-flip)

1. Mañana 2026-04-28 ~09:00 UTC: correr Q3-debug y verificar distribución de reasons consistente con expectativa.
2. Si OK: marcar checkboxes hour +6/+12/+24 arriba. Si FAIL: KILL SWITCH + escalation.
3. Tras 1 semana: agendar standalone `agent-lifecycle-router-cleanup` (`/gsd-add-backlog` o similar).
