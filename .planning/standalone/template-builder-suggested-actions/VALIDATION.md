---
phase: standalone
slug: template-builder-suggested-actions
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-12
---

# Standalone template-builder-suggested-actions — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Fuente: RESEARCH.md §Validation Architecture (verificado contra codebase + ai@6.0.86).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (usado en todo el repo) |
| **Config file** | existente a nivel repo |
| **Quick run command** | `npx vitest run src/lib/config-builder/templates/__tests__/` |
| **Full suite command** | `npx vitest run src/lib/config-builder/` + `npx tsc --noEmit` |
| **Estimated runtime** | ~20-40 segundos |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/config-builder/templates/__tests__/` + `npx tsc --noEmit`
- **After every plan wave:** Run `npx vitest run src/lib/config-builder/` + `npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite verde + checklist QA manual (Plan 03 Task 3)
- **Max feedback latency:** ~40 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 01 | 1 | D-01/D-02/D-03/D-07/D-08/D-09 | — | `mergeChips` filtra labels tipo confirmación de los AI-chips (CONFIRM_RE) | unit (tdd) | `npx vitest run src/lib/config-builder/templates/__tests__/suggested-actions.test.ts` | ❌ W0 | ⬜ pending |
| 01-T2 | 01 | 1 | D-01 (tool) | Scope creep (Elevation) | `suggestActions` echo puro — cero imports supabase/domain (grep en diff de tools.ts); Zod caps: max 3 actions, label ≤30, message ≤200 (V5 input validation) | unit | `npx vitest run src/lib/config-builder/templates/__tests__/` (suggested-actions.test.ts + system-prompt.test.ts extendido) | ✅ system-prompt.test.ts existe / ❌ W0 resto | ⬜ pending |
| 01-T3 | 01 | 1 | D-10 | — | persistence mode solo en route de templates; `/api/builder/chat` intocado (grep) | unit + type | `npx tsc --noEmit` + grep `originalMessages` solo en `src/app/api/config-builder/templates/chat/route.ts` | ✅ (tsc) | ⬜ pending |
| 02-T1 | 02 | 2 | D-01/D-03/D-06/D-07 | XSS vía labels IA (Tampering) | chips renderizan labels como texto React (sin `dangerouslySetInnerHTML` — grep 0 matches en componente nuevo) | type + grep | `npx tsc --noEmit` + `grep -c dangerouslySetInnerHTML <componente>` = 0 | ✅ (tsc) | ⬜ pending |
| 02-T2 | 02 | 2 | D-04/D-05/D-06/D-08/D-09 | Submit sin validar (Elevation) | chip Confirmar solo visible con guard D-07; submit real sigue tras prompt-gate de confirmación | type + manual QA | `npx tsc --noEmit` (comportamiento → QA manual) | ✅ (tsc) | ⬜ pending |
| 03-T1 | 03 | 3 | Regla 4 docs | — | agent-scope.md actualizado 7→8 tools + stepCountIs(15) | grep | `grep -c "suggestActions" .claude/rules/agent-scope.md` ≥ 1 | ✅ | ⬜ pending |
| 03-T2 | 03 | 3 | Regla 1 push | — | push a Vercel pre-QA | CLI | `git status` limpio + push exitoso | ✅ | ⬜ pending |
| 03-T3 | 03 | 3 | D-04..D-10 (QA) | — | checklist QA 9 puntos en browser | manual | — (checkpoint human-verify) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/config-builder/templates/__tests__/suggested-actions.test.ts` — `deriveStage` (9 predicados) + `mergeChips` (precedencia D-03, cap 4 D-02, dedupe, filtro confirm) + guard D-07 (`draftMatchesValidated` true/false según ediciones post-validate, excluyendo `variableMapping`). Se crea en Plan 01 Task 1 (`tdd="true"`) — la lógica vive en módulo puro `src/lib/config-builder/templates/suggested-actions.ts`, testeable sin React.

*Framework ya instalado — no requiere setup adicional.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Click chip → mensaje visible del usuario | D-04 | UI streaming + LLM en vivo | Browser `/configuracion/whatsapp/templates/builder` (puerto 3020): click chip no-local → burbuja usuario con el texto del chip |
| Acciones locales (file picker, navegar, nueva sesión) | D-05 | Interacción browser real | Click "📷 Subir imagen" abre file picker; "Ver mis templates" navega; "Crear otro template" resetea sesión |
| Chips ocultos durante streaming | D-06 | Estado `status` de useChat en vivo | Enviar mensaje → chips desaparecen hasta `status === 'ready'` |
| Chips de arranque + prompts pre-armados | D-08/D-09 | Empty-state + respuesta LLM | Sesión nueva → 4 chips; click envía descripción completa → IA propone borrador en 1 turno |
| Persistencia tras recarga | D-10 | Round-trip JSONB + rehidratación | Crear sesión con AI-chips → recargar → chips deterministas recomputados + AI-chips del último mensaje presentes |
| Guard D-07 con template con variables | D-07 + Pitfall 6 | Comportamiento runtime de la IA con `variableMapping` | Template con variables: validar → chip Confirmar aparece; editar body → desaparece hasta re-validar |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (suggested-actions.test.ts — Plan 01 Task 1 tdd)
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
