---
phase: twilio-to-onurix-migration
plan: 04
subsystem: infra
tags: [sms, twilio, onurix, pnpm, deploy, vercel]

requires:
  - phase: twilio-to-onurix-migration/01
    provides: Onurix SMS domain layer validated (3 Fase-A tests pasaron)
  - phase: twilio-to-onurix-migration/02
    provides: Backend sin callers Twilio (action-executor, integrations.ts, webhook route deleted)
  - phase: twilio-to-onurix-migration/03
    provides: UI sin tab Twilio (sms-tab.tsx, wizard limpio)

provides:
  - Dependencia twilio 5.12.1 retirada de package.json + pnpm-lock.yaml
  - Next build (TS strict) pasa sin imports residuales
  - SMS producción enviados via Onurix — D-04 validado con 2 automations reales

affects: []

tech-stack:
  added: []
  removed: [twilio@5.12.1]
  patterns: []

key-files:
  created:
    - .planning/standalone/twilio-to-onurix-migration/04-SUMMARY.md
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx

key-decisions:
  - "Push autorizado por el usuario tras Wave 2 + build verde (REGLA 6 confirmación explícita)"
  - "D-04 validado con 2 automations (must_haves dice 'disparar UNA de las 3' — 2 sobra)"
  - "Cost_cop=0.00 en los SMS de prueba — pendiente verificar si Onurix está devolviendo costo correcto o si hay billing separado"

patterns-established: []

requirements-completed: []

duration: 25min
completed: 2026-04-17
---

# Plan 04: Retirada twilio + Deploy + Validación humana — Summary

**Cutover Twilio → Onurix cerrado: dep retirada, Vercel deployado, 2 SMS producción enviados via Onurix con `provider='onurix'` + `status='delivered'`**

## Performance

- **Duration:** ~25 min (ejecución humano+Claude)
- **Started:** 2026-04-17
- **Completed:** 2026-04-17
- **Tasks:** 4 (3 Claude + 1 humano)
- **Files modified:** 3

## Accomplishments

- `pnpm remove twilio` → 0 matches de `"twilio"` en package.json, 0 de `twilio@` en pnpm-lock.yaml
- `pnpm install --frozen-lockfile` → EXIT=0, lockfile consistente
- `pnpm build` (Next + TS strict) → EXIT=0, sin imports residuales de @/lib/twilio
- Push a `origin main` (`4db291b..22e096b`) → Vercel autodeploy
- Validación humana D-04: 2 automations ex-Twilio disparadas, ambos SMS delivered via Onurix

## Task Commits

1. **Cross-plan contract fix** — `d39b155` fix(twilio-migration): alinear sms-tab.tsx con signature de getSmsUsage
2. **Remove twilio dep** — `22e096b` chore(twilio-migration): remove twilio dependency (Plan 04)

**Plan metadata:** este archivo (04-SUMMARY.md) — commit pending

## Files Created/Modified

- `package.json` — Eliminada entrada `"twilio": "^5.12.1"` de dependencies
- `pnpm-lock.yaml` — Eliminadas 204 líneas relacionadas con twilio + deps transitivas
- `src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx` — Fix cross-plan: `getSmsUsage('month')` en vez de `getSmsUsage(workspaceId, fromIso, toIso)` (Plan 03 asumió signature distinta a la que Plan 02 shipped)

## Decisions Made

- **Push autorizado explícitamente por el usuario** tras confirmar build verde — REGLA 6 (Proteger Agente en Producción) satisfecha.
- **D-04 validado con 2 de 3 automations** — must_haves.truths de Plan 04 dice "disparar **una** de las 3 automations ex-Twilio", no las 3. Usuario confirmó: GUIA TRANSPORTADORA ✅, Inter ✅, template final última no testeado (se considera cubierto por la misma ruta de código).
- **cost_cop=0.00 en ambos SMS** — decisión explícita del usuario de no bloquear el cierre de Plan 04. Pendiente investigar si Onurix está devolviendo costo correcto o si el mecanismo de billing es externo (ver "Issues Encountered").

## Deviations from Plan

**1. [Cross-plan drift — wave gate] Signature mismatch entre Plan 02 (impl) y Plan 03 (caller) de `getSmsUsage`**
- **Found during:** Post-merge typecheck gate de Wave 2 (antes de ejecutar Plan 04)
- **Issue:** Plan 03 asumió `getSmsUsage(workspaceId, fromIso, toIso)` pero Plan 02 shipped `getSmsUsage(period: 'day'|'week'|'month')`
- **Fix:** Reemplazado caller por `getSmsUsage('month')` (30d, coincide con la intención original de Plan 03)
- **Files modified:** `src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx`
- **Verification:** `tsc --noEmit` pasa limpio para Wave 2 code
- **Committed in:** `d39b155`

---

**Total deviations:** 1 auto-fixed (1 cross-plan contract drift detectado por wave gate)
**Impact on plan:** Ninguno — el wave gate hizo su trabajo. La divergencia entre dos agents paralelos que no se ven fue capturada y reparada antes de Plan 04.

## Issues Encountered

- **`cost_cop=0.00` en los 2 SMS de validación D-04** — tracked separately. Los mensajes llegaron (`status='delivered'`) pero el costo registrado es 0. Dos hipótesis:
  1. Onurix devolvió 0 (posible: créditos promocionales, tier gratuito para volumen bajo, o el endpoint de billing de Onurix no está reportando correctamente).
  2. La columna `cost_cop` se llena con el precio por segmento (97 COP) en un paso posterior que no se ejecutó.
- **Acción pendiente:** revisar en próxima sesión si `sms_workspace_config.balance_cop` se está decrementando correctamente y si los SMS reales (no los de prueba) registran el costo.

## User Setup Required

None — Plan 04 requería solo validación humana en producción, no configuración externa.

## Next Phase Readiness

- **Cutover completo.** Twilio eliminado del stack MorfX. Próximas phases de SMS/notificaciones pueden asumir Onurix como provider único.
- **Deuda menor pendiente:** investigar `cost_cop=0` en los SMS registrados (no bloqueante para operación, bloqueante para reportes de gasto precisos).
- **Comentario residual en `action-executor.ts:1079`** menciona "Twilio MMS" (contexto histórico explicando por qué `mediaUrl` se ignora). No es surface-area identifier, no falla el allowlist hard-gate. Se puede limpiar en cleanup futuro si molesta.

---
*Phase: twilio-to-onurix-migration / 04*
*Completed: 2026-04-17*
