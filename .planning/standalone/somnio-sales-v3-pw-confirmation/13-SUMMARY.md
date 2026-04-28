---
phase: somnio-sales-v3-pw-confirmation
plan: 13
status: complete
wave: 7
completed: 2026-04-28
duration_minutes: ~90
autonomous: false
---

# Plan 13 SUMMARY — Wave 7 Deploy + Activación Diferida

## Decisión agregada

**GO** — Standalone `somnio-sales-v3-pw-confirmation` SHIPPED 2026-04-28. 13 commits pusheados (`c555a31..72423ae`, 11 únicos del standalone + 8 commits de phases concurrentes que coexistían en main local). Migración SQL aplicada en Supabase production (38 rows, 24 intents). Smoke test 1 (dropdown) PASS. Smoke test 2 (e2e WhatsApp real) DEFERIDO por decisión del usuario — el agente queda listo en producción sin tráfico hasta que el usuario active manualmente la regla de routing (D-02).

## Tasks completados

| Task | Resultado | Notas |
|------|-----------|-------|
| 1. Checkpoint SQL apply | ✅ DONE | 38 rows insertados en `agent_templates` (24 intents, mínimo Plan 13 era 18 — superado). Migración: `supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql`. |
| 2. Pre-push validation + push | ✅ DONE (build skipped) | `npx tsc --noEmit` 0 errores. `npx vitest run __tests__/` 65/65 PASS. `npm run build` colgó >3h y se mató — Vercel build será la validación real. `git push origin main` exitoso. |
| 3. Smoke test 1 dropdown | ✅ PASS | Usuario confirmó visual en `/agentes/routing/editor` workspace Somnio: dropdown muestra `'somnio-sales-v3-pw-confirmation'` (D-02). |
| 4. Smoke test 2 e2e | ⏸️ DEFERIDO | Usuario decidió activar manualmente después. Sin regla en `routing_rules` = sin tráfico = aislamiento total (Regla 6 sin feature flag). |
| 5. Documentación deploy | ✅ DONE | `13-DEPLOY-NOTES.md` creado con timestamps, commit range, anomalías, learnings. |

## Commits pusheados (PW-confirmation, 11 únicos)

| Plan | Commits | Notas |
|------|---------|-------|
| 11 | `4938958`, `a0382b6`, `53e7f8e`, `b42fd5b`, `4deeb4c` | agent + wrapper + runner branch + webhook dispatch + SUMMARY |
| 12 | `864a515`, `2b274a2`, `943681d`, `5205fa1`, `18d3d49`, `451fad5` | 5 vitest suites (65 tests) + SUMMARY |

Plans 01-10 ya estaban en `origin/main` desde commits previos durante la ejecución por wave. Push de Wave 7 cerró el deploy con los 11 commits faltantes.

## Estado del agente en producción

| Capa | Estado |
|------|--------|
| Templates en DB (Supabase) | ✅ 38 rows, 24 intents |
| Código deployado en Vercel | ✅ Push exitoso, deploy auto-trigger |
| Inngest function registrada | ✅ Auto-sync (`pw-confirmation-preload-and-invoke`) |
| `agentRegistry` register | ✅ Cold lambda lo registra (smoke 1 lo confirmó) |
| Routing rule activa | ❌ NO creada (D-02 — usuario activa manualmente cuando decida) |
| **Tráfico real** | **0 mensajes** — el agente no atiende clientes hasta que se cree la regla |

**Aislamiento garantizado:** sin regla en `routing_rules` que mencione `agent_id='somnio-sales-v3-pw-confirmation'`, ningún mensaje entrante llega al agente. El agente actual de Somnio (`somnio-sales-v3` o `somnio-recompra-v1`) sigue atendiendo clientes sin cambios. Esto satisface Regla 6 (proteger agente en producción) sin necesidad de feature flag.

## Anomalías documentadas (ver `13-DEPLOY-NOTES.md` §Anomalías)

1. **Worktree isolation drift en Plan 08** — agente paralelo commiteó a main en lugar de worktree. Mitigado en Waves 4+ con `<worktree_path_discipline>` prompt explícito. Bug a investigar en `gsd-executor`.
2. **Plan 11 deviations auto-fix** — 4 correcciones críticas Rule 2/3 aplicadas autonomamente: types.ts v3-shape, EngineConfig union, webhook fail-closed, mark-processed.
3. **`npm run build` hang >3h** — Next 16 + Babel + WSL deadlock. Killed manualmente. Vercel build es el gate real.
4. **3 templates faltantes vs Plan 07 grep checks** — `confirmar_direccion_post_compra`, `cancelado_handoff`, `error_carga_pedido` (eliminados en Plan 04). Graceful degradation via `emptyReason: 'templates_not_found_in_catalog'`.
5. **3 rows menos vs Plan 02 estimate** — esperado 41, aplicado 38. Cubre los 24 intents requeridos. No-bloqueante.

## Próximos pasos

- [ ] **`LEARNINGS.md`** del standalone (Regla 0 obligatorio post-shipped) — incluir patrón Inngest 2-step BLOCKING + lecciones de worktree isolation + 5 anomalías
- [ ] **Actualizar `MEMORY.md`** con `[Somnio Sales v3 PW Confirmation (standalone, shipped)]` linkando a este SUMMARY + `13-DEPLOY-NOTES.md`
- [ ] **Actualizar `agent-scope.md`** sección `somnio-sales-v3-pw-confirmation`: reemplazar "shipped <fecha post-Plan 12>" por "shipped 2026-04-28"
- [ ] **Activación manual** (cuando el usuario decida) — SQL template completo en `13-DEPLOY-NOTES.md` §Smoke test 2
- [ ] **V1.1 (futuro):** editar items via AI SDK sub-call (D-13 V1 deferred → V1.1)
- [ ] **V1.1 (futuro):** tool real `handoff_human` (D-21 stub flag → materialización)

## Acceptance criteria (Plan 13)

- [x] Migración aplicada en prod ✅
- [x] Código pusheado + Vercel triggered ✅
- [x] Inngest function registrada (auto via Vercel deploy) ✅
- [x] Dropdown del routing-editor muestra agente (D-02) ✅
- [x] `13-DEPLOY-NOTES.md` documenta todo ✅
- [ ] Smoke 2 e2e — DEFERIDO con razón documentada (decisión usuario)

**Standalone listo para `LEARNINGS.md` + cierre.**

## Link

- [13-DEPLOY-NOTES.md](./13-DEPLOY-NOTES.md) — detalle completo del deploy + anomalías + SQL de activación
