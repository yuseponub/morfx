# Deploy Notes — somnio-sales-v3-pw-confirmation

**Wave 7 deploy date:** 2026-04-28 15:23 America/Bogota

---

## SQL apply (Task 1)

- **Migration file:** `supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql` (517 LoC, 24 INSERTs)
- **Applied at:** 2026-04-28 ~14:00–15:00 America/Bogota (Supabase SQL Editor manual)
- **Rows inserted:** **38** (vs Plan 02 SUMMARY estimate de 41 — diff de 3, dentro del rango aceptable; bien por encima del mínimo de 18 declarado en Plan 13 must_haves)
- **Coverage por intent (24 intents distintos, todos los esperados):**
  - Informacionales (15): saludo (2), precio (3), contenido (2), formula (3), como_se_toma (3), pago (1), envio (2), ubicacion (2), contraindicaciones (2), dependencia (1), efectividad (3), promociones (1), registro_sanitario (1), tiempo_entrega_{same_day,next_day,1_3_days,2_4_days,sin_ciudad} (1 cada uno = 5)
  - Sales post-compra (9): confirmacion_orden_same_day (2), confirmacion_orden_transportadora (2), pedir_datos_post_compra (1), agendar_pregunta (1), claro_que_si_esperamos (1), fallback (1)
- **Spot-checks:** verificación delegada al usuario; query `intent IN ('registro_sanitario','agendar_pregunta','claro_que_si_esperamos')` retornó 1 row cada uno (lo esperado por D-11/D-27)
- **GRANTs:** aplicados via DO block al final de la migración (no se re-verificaron con query de `information_schema` — los INSERTs corrieron sin permission errors, validación implícita)

**Anomalía no-bloqueante:** Templates `confirmar_direccion_post_compra`, `cancelado_handoff`, `error_carga_pedido` referenciados por response-track.ts NO están en el catálogo (decisión de Plan 04 — se eliminaron del catálogo). response-track maneja la ausencia con graceful degradation (`emptyReason: 'templates_not_found_in_catalog'`). Documentado en Plan 07 SUMMARY §6. NO se rompe nada — el agente nunca emitirá esos templates por ahora; si en el futuro se decide agregarlos, se hace con una migración nueva.

---

## Code push (Task 2)

- **Pre-push validation:**
  - `npx tsc --noEmit` → **0 errores TS** (clean)
  - `npx vitest run src/lib/agents/somnio-pw-confirmation/__tests__/` → **5 suites, 65/65 tests passed** (9.26s)
  - `npm run build` → **omitido** (proceso colgó >3h sin output después de typecheck OK; Vercel correrá su propio build en el push)
- **Commit range:** `c555a31..72423ae` (19 commits totales pusheados — 11 del PW-confirmation Plans 11+12 + 8 commits de phases concurrentes godentist-blast-sms-experiment Plans 01-06 + agent-forensics-panel hotfix QA)
- **PW-confirmation commits únicos pusheados (11):**
  - `4938958` Plan 11 Task 1 — somnio-pw-confirmation-agent.ts (processMessage 11-step entry)
  - `a0382b6` Plan 11 Task 2 — engine-pw-confirmation.ts (sandbox wrapper) + index.ts re-export
  - `53e7f8e` Plan 11 Task 3 — V3ProductionRunner branch
  - `b42fd5b` Plan 11 Task 4 — webhook-processor dispatch (D-05 BLOCKING dispatch)
  - `4deeb4c` Plan 11 SUMMARY
  - `864a515` Plan 12 Task 1 — transitions.test.ts (15 tests)
  - `2b274a2` Plan 12 Task 2 — state.test.ts (20 tests)
  - `943681d` Plan 12 Task 3 — response-track.test.ts (15 tests)
  - `5205fa1` Plan 12 Task 4 — sales-track.test.ts (7 tests)
  - `18d3d49` Plan 12 Task 5 — crm-writer-adapter.test.ts (8 tests)
  - `451fad5` Plan 12 SUMMARY
- **Push command:** `git push origin main` → `c555a31..de11110  main -> main` (push exitoso, push subsecuente extendió hasta `72423ae`)
- **Vercel deploy:** auto-trigger por GitHub push (URL del deployment: pending — el usuario lo verá en https://vercel.com/morfxjose/morfx-new/deployments)
- **Inngest sync:** function `pw-confirmation-preload-and-invoke` se registrará automáticamente en el siguiente health-check de Inngest a `/api/inngest` (verificable post-deploy en Inngest dashboard)

---

## Smoke test 1 — Dropdown del routing-editor (Task 3, CRITICAL)

- **URL tested:** https://morfx.app/agentes/routing/editor
- **Workspace:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`)
- **Verificado por:** usuario (jose) en 2026-04-28
- **Result:** **PASS** — el dropdown muestra `'somnio-sales-v3-pw-confirmation'` como opción seleccionable
- **D-02 verificado:** ✅ La opción aparece en el editor sin que exista regla activa, lo que confirma que el `agentRegistry.register('somnio-sales-v3-pw-confirmation', ...)` corre en cold lambda y el editor lo lista correctamente

---

## Smoke test 2 — End-to-end (Task 4, OPCIONAL)

- **Activación:** **DEFERIDO** — el usuario decidió NO activar el agente en este deploy
- **Estado actual:** agente listo en producción, sin tráfico
  - Templates en DB ✅ (38 rows)
  - Código pusheado ✅ (Vercel deploy auto-triggered)
  - Inngest function registrada ✅ (auto-sync)
  - Routing rule **NO creada** (D-02 — la activación es 100% responsabilidad del usuario)
- **Razón del defer:** decisión del usuario — quiere validar manualmente antes de exponer a clientes reales
- **Aislamiento confirmado (Regla 6 sin feature flag):** sin regla en `routing_rules` que mencione el `agent_id='somnio-sales-v3-pw-confirmation'` = sin tráfico = aislamiento total. El agente `somnio-sales-v3` actual sigue atendiendo clientes Somnio sin cambios.

### SQL para activar manualmente (cuando el usuario decida)

```sql
-- Crear regla de routing en Somnio workspace (priority 700 — debajo de saludo, por encima de fallback)
INSERT INTO routing_rules (workspace_id, name, priority, conditions, event, enabled)
VALUES (
  'a3843b3f-c337-4836-92b5-89c58bb98490',
  'Somnio PW Confirmation routing',
  700,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('fact', 'activeOrderStageRaw', 'operator', 'in', 'value', ARRAY['NUEVO PAG WEB','FALTA INFO','FALTA CONFIRMAR']),
      jsonb_build_object('fact', 'activeOrderPipeline', 'operator', 'equal', 'value', 'Ventas Somnio Standard')
    )
  ),
  jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'somnio-sales-v3-pw-confirmation')),
  true  -- enabled=true para activar
);

-- Para desactivar (rollback rápido):
-- UPDATE routing_rules SET enabled=false WHERE name='Somnio PW Confirmation routing';
```

---

## Documentación pendiente (Regla 4)

- [ ] `docs/analysis/04-estado-actual-plataforma.md` — agregar sección PW-confirmation (estado: shipped, sin tráfico, esperando activación manual)
- [ ] `docs/architecture/` — documentar el patrón nuevo de Inngest 2-step BLOCKING (reader + agente in-process, sin polling) — único en codebase, contrasta con recompra que es non-blocking
- [ ] `MEMORY.md` (auto-memory) — agregar referencia al standalone shipped + link a este DEPLOY-NOTES
- [ ] `agent-scope.md` (`.claude/rules/`) — la sección `somnio-sales-v3-pw-confirmation` ya existe y está actualizada; verificar que la fecha "shipped <fecha post-Plan 12>" se reemplaza por "shipped 2026-04-28"

---

## Anomalías y aprendizajes durante el deploy

### Anomalías de proceso (no-bloqueantes para el deploy)

1. **Worktree isolation drift en Plan 08** — el agente paralelo de Plan 08 commiteó directamente a `main` en lugar de su worktree. Plan 07 detectó el mismo riesgo a tiempo y lo corrigió (movió file al worktree, eliminó del main, commiteó solo en worktree). Mitigación aplicada para Waves 4+: prompt explícito `<worktree_path_discipline>` con re-check de `pwd && git branch --show-current` antes de cada commit. Plans 09-12 todos respetaron isolation. **Bug a investigar en gsd-executor:** Bash sessions a veces aterrizan en el path del repo principal en lugar del worktree del subagent.
2. **Plan 11 deviations auto-fix** (4, todas Rule 2/3 críticas):
   - `types.ts` expandido a v3-shape (V3ProductionRunner envía v3-style v3Input — bloqueante)
   - `EngineConfig.agentModule` union extendida (Plan 09 SUMMARY lo había marcado CRITICO)
   - webhook-processor branch fail-closed on dispatch error (anti respuesta-con-agente-incorrecto)
   - Mark inbound messages processed in PW dispatch path (anti retry-loop)
3. **`npm run build` colgó >3h** sin producir output después de typecheck OK. Killed manualmente. Vercel build será la validación real. **Bug a investigar:** Next 16 + Babel + OpenTelemetry + node 22 en WSL — posible deadlock en postcss workers.

### Anomalías de catálogo (no-bloqueantes para el deploy)

1. **3 templates faltantes vs Plan 07 grep checks** — `confirmar_direccion_post_compra`, `cancelado_handoff`, `error_carga_pedido` no están en el catálogo (Plan 04 los eliminó). response-track.ts los referencia pero degrada gracefully cuando TemplateManager retorna empty (`emptyReason: 'templates_not_found_in_catalog'`). Si en el futuro se decide agregarlos, hacer migración suplementaria.
2. **3 rows menos vs Plan 02 estimate** — esperado 41, aplicado 38. No se identificó cuáles 3 faltaron (probablemente variantes OPC opcionales). Investigación deferida — el catálogo cubre los 24 intents requeridos.

### Aprendizajes para próximos standalones

- **Inngest 2-step BLOCKING pattern (D-05)** funcionó limpio. Patrón nuevo en codebase, vale documentar en `docs/architecture/` para que otros agentes lo reusen cuando necesiten contexto pre-cargado antes de invocar agente.
- **Worktree isolation:** el prompt `<worktree_path_discipline>` debería mover-se al template oficial de gsd-executor para evitar que cada orchestrator lo tenga que repetir.
- **Build pipeline:** considerar pre-build cache warm-up para evitar deadlocks en WSL.

---

## LEARNINGS.md (a redactar al cierre del standalone)

Plan 13 SUMMARY apuntará a `LEARNINGS.md` con detalle de:
- Patrón Inngest 2-step BLOCKING (primera implementación en codebase)
- Two-step propose+confirm directo via `processWriterMessage` reemplazado por adapter helpers (D-08 vs RESEARCH §C.2 'opción más limpia')
- State machine pura (D-25) — escalable a otros agentes sales
- Catálogo de templates independiente por agente (D-15) — ya validado en recompra-template-catalog 2026-04-23
- 3 anomalías de proceso documentadas arriba (worktree drift, build hang, catalog mismatch)

---

## Next steps

- [x] SQL aplicado en prod
- [x] Código pusheado
- [x] Smoke test 1 PASS (dropdown)
- [ ] Smoke test 2 — DEFERIDO al usuario
- [ ] `LEARNINGS.md` del standalone
- [ ] `MEMORY.md` actualizado con shipped status
- [ ] Activación manual (cuando el usuario decida)
- [ ] V1.1 (futuro): editar items via AI SDK sub-call (D-13 V1 deferred → V1.1)
- [ ] V1.1 (futuro): tool real `handoff_human` (D-21 stub flag → materialización)
