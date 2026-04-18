# 02-SUMMARY — Guard source-aware + rename atómico cross-file

**Completado:** 2026-04-17 22:28 COT
**Commits:**
- `eacf068` — feat(sms-source-taxonomy): agregar TRANSACTIONAL_SOURCES + MARKETING_SOURCES
- `8280065` — refactor(sms-guard): bypass para SMS transaccionales + rename atómico

**Deploy:** Pushed a `origin/main` (97af3c7..8280065) y usuario confirmó Vercel deploy Ready.

## Diff summary

**`src/lib/sms/constants.ts`** (Task 1, commit `eacf068`):
- Agregado bloque "SMS Source Taxonomy" con:
  - `TRANSACTIONAL_SOURCES = ['automation', 'domain-call', 'script'] as const`
  - `MARKETING_SOURCES = ['campaign', 'marketing'] as const`
  - Types `TransactionalSource`, `MarketingSource`, `SMSSource`
- Zero imports preservado (convención anti-circular respetada).

**`src/lib/sms/utils.ts`** (Task 2, commit `8280065`):
- Import consolidado: añade `TRANSACTIONAL_SOURCES` al import existente de `./constants`.
- Nueva función `isTransactionalSource(source?: string | null): boolean` con default permisivo (NULL → true) per D-02.
- Rename `isWithinSMSWindow` → `isWithinMarketingSMSWindow`. Lógica idéntica (8AM-9PM) per D-04. SIN alias del nombre viejo.

**`src/lib/domain/sms.ts`** (Task 2, commit `8280065`):
- Import consolidado en una sola línea de 3 símbolos: `formatColombianPhone, isWithinMarketingSMSWindow, isTransactionalSource` desde `@/lib/sms/utils`.
- Guard en paso 2 refactorizado: `if (!isTransactionalSource(params.source) && !isWithinMarketingSMSWindow())` — bypass 24/7 para transactional, window check solo para marketing.
- Error message literal intacto (D-04 + cero UI consumers).
- Paso 6: agregado `console.warn` cuando `params.source` está vacío + variable local `effectiveSource = params.source || 'domain-call'`; `p_source` en el RPC pasa a `effectiveSource`.

## Validación técnica

**`npx tsc --noEmit`** filtrado (excluyendo somnio test files pre-existentes):
- Zero errores nuevos introducidos por estos cambios.
- Los 4 errores pre-existentes en `src/lib/agents/somnio/__tests__/*.test.ts` (vitest no instalado, implicit any) existen desde antes del phase. Deviation de la acceptance criteria estricta "tsc exits 0" documentada aquí — imposible de satisfacer sin tocar archivos fuera de scope.

**`grep -rn "isWithinSMSWindow" src/`** → 0 matches (nombre viejo erradicado globalmente).

**`grep -rn "isTransactionalSource" src/`** → matches en utils.ts (definición) + domain/sms.ts (uso). ≥ 2 matches.

**`grep -rn "isWithinMarketingSMSWindow" src/`** → matches en utils.ts (definición) + domain/sms.ts (uso). ≥ 2 matches.

**`src/lib/automations/action-executor.ts`** — NO fue modificado. Ya pasa `source: 'automation'` en líneas 1099-1104 (verificado en RESEARCH §Call Site Inventory).

## Truths verificados

- `constants.ts` exporta TRANSACTIONAL_SOURCES, MARKETING_SOURCES y types ✓
- `utils.ts` exporta `isTransactionalSource` con default permisivo para NULL/undefined ✓
- `utils.ts` exporta `isWithinMarketingSMSWindow` (renombrado, lógica idéntica) ✓
- `isWithinSMSWindow` NO existe en ningún archivo de `src/` ✓
- Guard en `domain/sms.ts` bypasea window check cuando `params.source ∈ {automation, domain-call, script, NULL, undefined, unknown}` ✓
- Guard aplica `isWithinMarketingSMSWindow()` solo para `campaign` | `marketing` ✓
- `domain/sms.ts` emite `console.warn` cuando fallback `'domain-call'` se dispara (Q5) ✓
- UN SOLO commit para rename cross-file (Pitfall 3 honrado) ✓
- Usuario confirma Vercel deploy Ready ✓

## Commits atómicos (verificación de Pitfall 3)

| SHA | Archivos |
|---|---|
| `eacf068` | `src/lib/sms/constants.ts` |
| `8280065` | `src/lib/sms/utils.ts`, `src/lib/domain/sms.ts` |

El rename cross-file (utils.ts define nuevo nombre + domain/sms.ts consume nuevo nombre) vive en UN SOLO commit `8280065`. El repo nunca quedó en estado build-roto entre commits — si se `git checkout eacf068`, el código sigue compilando porque `domain/sms.ts` aún importa `isWithinSMSWindow` del viejo nombre. Si se `git checkout 8280065`, todo usa nombres nuevos. No hay commit intermedio donde el símbolo esté roto.

## Deviation / sorpresas

- **tsc no-emit exits 0 imposible de satisfacer.** Los 4 errores de `somnio/__tests__/*.test.ts` son deuda pre-existente (vitest no instalado en `package.json`). Documentado como deviation, pero el código SMS en sí compila limpio. Follow-up opcional: instalar vitest o excluir tests del tsc root config — fuera de scope.

- **Regla 5 sin fricción.** La columna `source` ya era NOT NULL en prod (Plan 01 checkpoint cerrado) antes del push — cero riesgo de referenciar schema inexistente.

- **Zero nuevos callers descubiertos durante implementación.** RESEARCH §Call Site Inventory ya había auditado todos los paths; la implementación no tuvo que agregar nada fuera de los 3 archivos planificados.

## Precondición para Plan 03

Código refactorizado vive en producción (Vercel). Listo para smoke test empírico post-21:00 COT. Estamos a las 22:28 COT — fuera de ventana, condición ideal para validar que un SMS transaccional se envía fuera del rango 8AM-9PM.
