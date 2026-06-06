# Deferred Items — ui-redesign-editorial-shell

Items descubiertos durante la ejecución que están FUERA DEL SCOPE de esta fase
(SCOPE BOUNDARY del executor: solo se auto-arreglan issues causados por los cambios
del task actual). NO se corrigen aquí.

## Errores de typecheck pre-existentes (descubiertos en Plan 05 Task 1)

`pnpm exec tsc --noEmit` reporta 4 errores en archivos de test pre-existentes que esta
fase NO tocó (verificado: existían en el base `5c4a92a1`; `git diff --name-only 5c4a92a1 HEAD`
no incluye ningún `__tests__`). No son causados por los cambios de este standalone (CSS/JSX
del chrome editorial v3).

- `src/lib/domain/__tests__/conversations.test.ts:16` — TS7022/TS7024: `eqMock` sin anotación
  de tipo (implicit any en su propio initializer).
- `src/lib/instagram/__tests__/webhook-handler.test.ts:87` — TS2307: `Cannot find module
  '@/lib/inngest/client'` (módulo movido/renombrado; el test apunta a una ruta inexistente).
- `src/lib/messenger/__tests__/webhook-handler.test.ts:83` — TS2307: mismo módulo faltante
  `@/lib/inngest/client`.

**Acción recomendada:** abrir un standalone/hotfix de mantenimiento de tests aparte para
anotar `eqMock` y corregir la ruta de import de `inngest/client` en los webhook-handler tests.
