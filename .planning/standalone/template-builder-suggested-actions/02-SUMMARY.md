---
phase: template-builder-suggested-actions
plan: 02
subsystem: ui
tags: [ai-sdk-v6, react, config-builder, whatsapp-templates, chips, ui]

# Dependency graph
requires:
  - phase: template-builder-suggested-actions Plan 01
    provides: "Módulo puro suggested-actions.ts (deriveStage, mergeChips, extractAiActions, STARTER_CHIPS, tipo Chip) + tool echo suggestActions + route activeTools/persistence"
provides:
  - "Componente presentacional puro SuggestedActionChips (portable al builder de automatizaciones — sin imports template-specific)"
  - "Integración end-to-end en chat-pane: derivación useMemo (fuente única), strip gated por status, click handlers híbridos (mensaje/upload/navegación/nueva-sesión), starter-chips en empty-state"
  - "Silenciamiento de suggestActions en la burbuja (sin loading ni pill verde — Pitfall 3)"
  - "Prop onNewSession del layout hacia ChatPane (reset de sesión desde el chip post-submit)"
affects: [automatizaciones-builder-chips (follow-up futuro — el componente ya es portable)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UI derivada con useMemo desde messages + draft (cero useState/dispatch para chips — Pitfall 5)"
    - "Componente presentacional portable con interface estructural propia (SuggestedChip super-tipo de Chip)"
    - "Strip de acciones FUERA del scroll-container (patrón error-banner — Pitfall 7)"
    - "Doble guard D-06: render condicional status==='ready' + no-op if(isLoading) en handler"

key-files:
  created:
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/suggested-action-chips.tsx
  modified:
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx

key-decisions:
  - "handleChipClick recibe SuggestedChip (no Chip) — el módulo puro usa ChipAction (union estrecha) y el componente portable usa action:string (ancho); la varianza de funciones exige que el callback acepte el super-tipo para ser asignable al prop onChipClick"
  - "Strip y empty-state ambos renderizan SuggestedActionChips (dos call-sites): strip con chips derivados gated por status, empty-state con STARTER_CHIPS disabled por isLoading"
  - "Silenciamiento de suggestActions en DOS puntos de chat-message: early-return null en ToolLoading (suprime el spinner) + early-return null en ToolOutput antes del pill genérico (suprime el check verde)"

patterns-established:
  - "Componente de chips portable: interface SuggestedChip propia + onChipClick por props, cero acoplamiento al dominio de templates (listo para /automatizaciones/builder)"

requirements-completed: [D-01, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10]

# Metrics
duration: 7min
completed: 2026-06-12
---

# Phase template-builder-suggested-actions Plan 02: UI de chips de acción sugerida en el builder Summary

**Chips de acción sugerida funcionando end-to-end en `/configuracion/whatsapp/templates/builder`: componente presentacional puro `SuggestedActionChips` (portable), derivación con `useMemo` como fuente única (Pitfall 5), strip gated por `status==='ready'` fuera del scroll-container (Pitfall 7), 4 comportamientos de click (mensaje/upload/navegación/nueva-sesión — D-04/D-05) con doble guard D-06, starter-chips D-08/D-09 en el empty-state y silenciamiento total de la tool en la burbuja (Pitfall 3).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-12T22:58:58Z
- **Completed:** 2026-06-12T23:05:56Z
- **Tasks:** 2
- **Files modified:** 4 (1 creado, 3 modificados)

## Accomplishments
- Componente `SuggestedActionChips` presentacional puro: interface `SuggestedChip` propia (sin imports template-specific → portable al builder de automatizaciones), variante `confirm` con paleta emerald, XSS mitigado renderizando labels como texto plano (React escapa — T-TBC-05)
- `chat-message.tsx`: `suggestActions` invisible en la burbuja — early-return `null` en `ToolLoading` (sin spinner) y en `ToolOutput` antes del pill genérico de éxito (sin check verde) — Pitfall 3
- `chat-pane.tsx`: integración completa con UNA sola fuente de chips (`useMemo` sobre `draft + messages`, cero `useState`/dispatch nuevos — Pitfall 5), strip entre messages-area e input FUERA del scroll-container (Pitfall 7), gating D-06, handler híbrido con las 4 acciones (sendMessage D-04 / upload-image, navigate-templates, new-session D-05), empty-state con los 4 starter-chips D-08 que envían los prompts D-09
- `template-builder-layout.tsx`: prop `onNewSession={handleNewSession}` conectada al `<ChatPane>` (reusa el reset existente — el chip "Crear otro template" del estado post-submit limpia draft + sesión)

## Task Commits

1. **Task 1: Componente SuggestedActionChips + silenciar suggestActions en burbuja** - `3bbc34f5` (feat)
2. **Task 2: Integración en chat-pane + empty-state + acciones locales + prop onNewSession** - `f5e4efd1` (feat)

## Files Created/Modified
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/suggested-action-chips.tsx` - Componente presentacional puro y portable (props: chips, disabled, onChipClick; interface SuggestedChip propia; variante confirm)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx` - Derivación useMemo + strip gated + handler híbrido + empty-state starter-chips + prop onNewSession destructurada
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx` - TOOL_LABELS entry + doble early-return null (ToolLoading + ToolOutput) para silenciar suggestActions
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx` - Prop onNewSession={handleNewSession} pasada al ChatPane

## Decisions Made
- **`handleChipClick` recibe `SuggestedChip`, no `Chip`:** el módulo puro tipa `action` como `ChipAction` (union estrecha `'upload-image' | 'navigate-templates' | 'new-session'`) mientras el componente portable lo tipa como `string` (ancho). Por la varianza de funciones (strictFunctionTypes), un callback que solo acepta `Chip` NO es asignable al prop `onChipClick: (chip: SuggestedChip) => void`. La solución limpia: el handler acepta el super-tipo `SuggestedChip` (solo lee `chip.action` por comparación de string y `chip.message`), y el tipo `Chip` se quitó del import al quedar sin referencia directa. Mantiene el componente desacoplado del dominio sin casts.
- **Dos call-sites de `SuggestedActionChips`:** el strip (chips derivados, gated por `status==='ready' && messages.length>0 && mergedChips.length>0`) y el empty-state (STARTER_CHIPS, `disabled={isLoading}`). El componente retorna `null` si `chips.length===0`, así que el strip no aparece cuando no hay chips.
- **Silenciamiento en dos puntos:** suprimir solo el output dejaba el spinner "Sugiriendo acciones..." durante el streaming. Se aplicó el early-return también en `ToolLoading` (que recibe `toolName` como prop) para invisibilidad total, como recomienda el RESEARCH (Pitfall 3).

## Deviations from Plan

None - plan executed exactly as written.

(Nota menor de implementación, no desviación: el plan mostraba `handleChipClick` con firma `(chip: Chip)`. Se ajustó a `(chip: SuggestedChip)` por la varianza de funciones descrita arriba — el comportamiento es idéntico y la asignabilidad al prop del componente portable queda correcta. El acceptance criterion del plan no fija la firma del parámetro.)

## Issues Encountered
None. El typecheck detectó el tema de varianza de funciones al primer `tsc --noEmit`; resuelto cambiando el parámetro al super-tipo estructural.

## Threat Model Compliance
Los 2 threats del register quedan mitigados:
- **T-TBC-05** (XSS vía labels de la IA): labels renderizados como texto plano — React escapa por defecto; `grep dangerouslySetInnerHTML suggested-action-chips.tsx` = 0.
- **T-TBC-06** (chip dispara acción durante streaming): doble guard D-06 — render condicional `status === 'ready'` en el strip + no-op `if (isLoading) return` en `handleChipClick`. El empty-state usa `disabled={isLoading}` adicional.

## Verification Results
- `npx tsc --noEmit` — exit 0 (Task 1 y Task 2)
- `npx vitest run src/lib/config-builder/templates/__tests__/` — 36/36 verde (sin regresión del Plan 01: 27 suggested-actions + 9 system-prompt)
- Acceptance criteria Task 1: SuggestedActionChips export=1, dangerouslySetInnerHTML=0, config-builder/templates imports=0 (portable), suggestActions en chat-message=5 (label + ToolLoading + ToolOutput + dynamic call-sites), branch null (línea 134) ANTES del pill genérico emerald (línea 194)
- Acceptance criteria Task 2: import suggested-actions=1, useMemo presente, gating D-06=1, fileInputRef.click=2 (botón + chip), router.push=1, onNewSession prop type=1, STARTER_CHIPS presente, layout onNewSession total=2 (TemplateSessionHistory preexistente + ChatPane nueva), onNewSession dentro de `<ChatPane>`=1, strip FUERA del scroll-container (línea 300, después del cierre del messages-area línea 266, antes del error display línea 309), scan parent-level (82-125) y handleChatImageUpload intactos (cero removals)

## Next Phase Readiness
- Plan 03 hace el push a Vercel (Regla 1) antes del QA del usuario en `/configuracion/whatsapp/templates/builder` (puerto 3020).
- QA manual pendiente (justificación: requiere LLM en vivo + sesión real — RESEARCH §Validation Architecture): las 4 variantes de click (mensaje, upload, navegación, nueva sesión), empty-state con los 4 starter-chips enviando prompts D-09, gating D-06 durante streaming, y un template CON variables end-to-end (Pitfall 6 — verificar si el chip "✅ Confirmar y crear" aparece dado el comportamiento real de la IA con variableMapping).
- Limitaciones preexistentes documentadas que el QA debe esperar (no del feature): lag de persistencia de 1 turno cerrado al 100% en Plan 01 vía persistence mode; `headerImageStoragePath` no rehidrata tras recarga (Pitfall 8 — etapa "subir imagen" reaparece, consistente con el preview).
- El componente `SuggestedActionChips` ya es portable: el follow-up `automatizaciones-builder-chips` puede importarlo tal cual y proveer su propia derivación de etapa.

## Self-Check: PASSED

- Archivos creados verificados en disco: suggested-action-chips.tsx, 02-SUMMARY.md
- Archivos modificados verificados: chat-pane.tsx (deriveStage + SuggestedActionChips), chat-message.tsx (suggestActions x5), template-builder-layout.tsx (onNewSession x5)
- Commits verificados en git log: 3bbc34f5, f5e4efd1

---
*Standalone: template-builder-suggested-actions*
*Completed: 2026-06-12*
