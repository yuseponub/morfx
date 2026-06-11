---
phase: standalone
slug: gemini-fallback-haiku
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Standalone gemini-fallback-haiku — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (ya configurado en el repo) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run src/lib/agents/somnio-v4/fallback/__tests__/` (ajustar al path final del módulo) |
| **Full suite command** | suite canónica v4: `npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'` |
| **Estimated runtime** | ~60-120 segundos (suite canónica: 358 passed | 7 skipped baseline) |

---

## Sampling Rate

- **After every task commit:** Run quick command (tests del módulo fallback)
- **After every plan wave:** Run suite canónica v4 completa
- **Before `/gsd-verify-work`:** Suite canónica verde (358+nuevos | 7 skipped)
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

*(Las filas se llenan por el planner — referencia del RESEARCH § Validation Architecture: FSM del breaker con fake timers, predicado isGeminiSaturation, paridad de shape con MockLanguageModelV3, no-fallback en parse errors, Regla 6 byte-identical.)*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| — | — | — | — | — | — | — | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Tests nuevos del módulo fallback (breaker FSM + predicado + paridad) — archivos a crear por los planes
- [ ] `__resetBreakers()` test helper para aislar estado module-singleton entre tests (RESEARCH Pitfall: state leak en vitest)

*La infraestructura vitest existente cubre el resto.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fallback real bajo saturación Gemini en sandbox | D-05/D-07/D-08 | Requiere ola de saturación real o forzar error con API key inválida de Google en local | Sandbox /sandbox con Gemini saboteado → verificar respuesta vía Haiku + eventos fallback_triggered/circuit_opened en debug panel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
