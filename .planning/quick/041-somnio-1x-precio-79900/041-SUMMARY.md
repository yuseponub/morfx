---
phase: 041-somnio-1x-precio-79900
type: quick
completed: 2026-04-10
status: complete
one_liner: "Bajar precio 1x de Somnio (somnio-v3) de $89,900 a $79,900 y marcar SOMNIO_PRICES legacy como @deprecated"
commits:
  - f4b4765 feat(somnio-v3): bajar precio 1x a $79,900
  - e0498db docs(somnio-v1): marcar SOMNIO_PRICES como deprecated
pushed: true
---

# Quick Task 041: Somnio 1x a $79,900

## Objetivo

Sincronizar el código del agente `somnio-v3` con el nuevo precio de 1 frasco ($79,900), ya actualizado manualmente en la tabla `agent_templates` de producción. 2x ($129,900) y 3x ($169,900) no cambian.

## Cambios aplicados

### Commit 1 — `feat(somnio-v3): bajar precio 1x a $79,900` (`f4b4765`)

- `src/lib/agents/somnio-v3/constants.ts`
  - `PACK_PRICES['1x']: '$89,900' → '$79,900'`
  - `PACK_PRICES_NUMERIC['1x']: 89900 → 79900`
- `src/lib/agents/somnio-v3/comprehension-prompt.ts`
  - Línea 29 (PRECIOS): solo el segmento 1x actualizado, 2x/3x intactos byte-por-byte.

### Commit 2 — `docs(somnio-v1): marcar SOMNIO_PRICES como deprecated` (`e0498db`)

- `src/lib/agents/somnio/variable-substitutor.ts`
  - JSDoc `@deprecated` agregado arriba del `export const SOMNIO_PRICES`, apuntando a `somnio-v3/constants.ts` como fuente de verdad.
  - Valores numéricos del objeto legacy (`$77,900`, `$109,900`, `$139,900`) sin cambios.

## Deviations

### Rule 1 — Task 3 commit omitido por discrepancia con realidad del repo

- **Esperado por el plan:** `temp-update-templates.sql` estaba tracked en git y se podía hacer `git add -u` + commit de eliminación.
- **Realidad:** El archivo NUNCA estuvo en el índice de git (era un archivo untracked en la raíz). `git ls-files temp-update-templates.sql` retorna vacío y `git log --all -- temp-update-templates.sql` no muestra historia.
- **Acción tomada:** `rm temp-update-templates.sql` aplicado en el filesystem (el archivo ya no existe). Se omitió el commit `chore: eliminar ...` porque no había cambios en el índice para commitear. El resultado funcional (archivo eliminado del repo) se alcanzó.
- **Resultado:** 2 commits en lugar de 3. El scope físico del plan se cumplió igual.

## Verificaciones

```bash
# 1. Scope bloqueante — 0 matches
grep -rn "89900|\$89,900" src/lib/agents/somnio-v3 src/lib/agents/somnio
# → No matches found

# 2. Nuevo precio presente en los 3 lugares esperados
grep -rn "79900|\$79,900" src/lib/agents/somnio-v3
# → 3 matches:
#   constants.ts:140 (PACK_PRICES '$79,900')
#   constants.ts:151 (PACK_PRICES_NUMERIC 79900)
#   comprehension-prompt.ts:29 (PRECIOS)

# 3. 2x y 3x intactos en constants.ts
# → 129900 y 169900 confirmados (líneas 152-153 PACK_PRICES_NUMERIC + '$129,900'/'$169,900' en PACK_PRICES)

# 4. @deprecated aplicado a SOMNIO_PRICES legacy (no cambiaron valores numéricos)

# 5. Archivo temp-update-templates.sql eliminado del filesystem
test ! -f temp-update-templates.sql && echo "OK"
# → OK

# 6. 2 commits en origin/main
git log origin/main -3 --oneline
# → e0498db docs(somnio-v1): marcar SOMNIO_PRICES como deprecated
# → f4b4765 feat(somnio-v3): bajar precio 1x a $79,900
# → 18bacb3 docs(envia-status-polling): complete phase
```

## DB

La tabla `agent_templates` fue actualizada manualmente por el usuario vía SQL editor de Supabase ANTES de este task (precondición declarada en el contexto). NO se tocó la DB desde este task.

## Push

`git push origin main` ejecutado con éxito. Los 2 commits están en `origin/main` y disparan el deploy automático de Vercel.
