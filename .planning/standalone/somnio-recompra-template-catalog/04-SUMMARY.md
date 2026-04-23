---
plan: 04
phase: somnio-recompra-template-catalog
status: complete
completed: 2026-04-23
wave: 2
---

# Plan 04 SUMMARY — Unit tests D-03/D-04/D-05/D-06/D-12

## Outcome

Safety net establecido. 15 tests nuevos (9 transitions + 6 response-track) cubren
los 5 cambios de Plans 02 y 03. Suite recompra completa: **32/32 tests verdes**
(incluyendo 7 crm-context-poll + 10 comprehension-prompt pre-existentes).

## Commit

- `b5ac990` — test(somnio-recompra-template-catalog): agregar tests unitarios D-03/D-04/D-05/D-06/D-12

## Archivos creados

- `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts` — 9 tests / 3 describes.
- `src/lib/agents/somnio-recompra/__tests__/response-track.test.ts` — 6 tests / 3 describes.

## Cobertura

| Decision | Test | Behavior verificado |
|---------|------|---------------------|
| D-04 | transitions.test.ts:D-04 redesign | `initial + quiero_comprar → preguntar_direccion` + timerSignal L5 reason correcto |
| D-04 negativo | transitions.test.ts:D-04 redesign | `quiero_comprar` ya NO matcha `ofrecer_promos` |
| D-05 | transitions.test.ts:D-05 fallback | `resolveTransition('initial', 'saludo')` → null (+ any-phase null) |
| D-03 | response-track.test.ts:saludo emite 2 messages | Turn-0 saludo produce texto CORE + imagen COMPLEMENTARIA |
| D-05 integrado | response-track.test.ts:saludo emite 2 messages | `infoTemplateIntents === ['saludo']`, NO incluye `'promociones'` |
| D-06 | response-track.test.ts:INFORMATIONAL_INTENTS | `'registro_sanitario' ∈ INFORMATIONAL_INTENTS` |
| D-12 | response-track.test.ts:direccion_completa | `'Calle 48A #27-85, Bucaramanga, Santander'` exact match |
| D-12 defensiva | response-track.test.ts:direccion_completa | departamento=null → sin `, ,` ni trailing comma |
| Regresion | transitions.test.ts:regression | datos, confirmar_direccion, seleccion_pack, no_interesa, confirmar |
| Regresion | response-track.test.ts:INFORMATIONAL_INTENTS | 9 intents originales siguen en el Set |

## Output `npm run test`

```
Test Files  4 passed (4)
     Tests  32 passed (32)
  Duration  ~17s
```

Desglose por archivo:
- `comprehension-prompt.test.ts`: 10 tests (pre-existente, sin cambios)
- `crm-context-poll.test.ts`: 7 tests (pre-existente, sin cambios)
- `transitions.test.ts`: 9 tests (nuevo)
- `response-track.test.ts`: 6 tests (nuevo)

## Q#2 scope limitation (documentado)

Solo se cubrio el happy-path de `preguntar_direccion` (datosCriticos=true, direccion+ciudad preloaded). El branch `!datosCriticos` (campos_faltantes) queda como **deuda tecnica** — documentada para LEARNINGS de Plan 05. La assertion defensiva en el test de `departamento=null` protege contra el modo de falla mas plausible (trailing comma) sin forzar branch coverage completa.

## NO pusheado

Regla 5 strict: Wave 2 queda en local hasta Plan 05, que aplica SQL en prod ANTES del push de codigo acumulado (Plans 02/03/04).

## Next

- Plan 05 (Wave 3): apply migration en prod + push + smoke test con Jose Romero + close debug file + update docs + LEARNINGS.
