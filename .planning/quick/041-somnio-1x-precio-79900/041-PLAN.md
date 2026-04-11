---
phase: 041-somnio-1x-precio-79900
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/comprehension-prompt.ts
  - src/lib/agents/somnio/variable-substitutor.ts
  - temp-update-templates.sql
autonomous: true

must_haves:
  truths:
    - "Agente somnio-v3 cotiza 1x en $79,900 (no $89,900)"
    - "Agente somnio-v3 sigue cotizando 2x en $129,900 y 3x en $169,900 sin cambios"
    - "No quedan referencias hardcoded a 89900 o $89,900 en src/lib/agents/somnio-v3 ni src/lib/agents/somnio"
    - "SOMNIO_PRICES legacy del agente somnio-sales-v1 queda marcado como @deprecated"
    - "Archivo obsoleto temp-update-templates.sql eliminado del repo"
    - "Cambios pusheados a Vercel via main"
  artifacts:
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "PACK_PRICES y PACK_PRICES_NUMERIC con 1x=$79,900"
      contains: "'1x': '$79,900'"
    - path: "src/lib/agents/somnio-v3/comprehension-prompt.ts"
      provides: "Prompt de comprensión con precio 1x actualizado"
      contains: "1 frasco (1x) = $79,900"
    - path: "src/lib/agents/somnio/variable-substitutor.ts"
      provides: "SOMNIO_PRICES legacy con JSDoc @deprecated"
      contains: "@deprecated"
  key_links:
    - from: "somnio-v3 runtime"
      to: "PACK_PRICES / PACK_PRICES_NUMERIC"
      via: "import desde constants.ts"
      pattern: "PACK_PRICES"
---

<objective>
Bajar el precio de 1 frasco (1x) de Somnio de $89,900 a $79,900 en el código del agente somnio-v3.

Purpose: Sincronizar el código con el cambio de precio ya aplicado manualmente en la tabla `agent_templates` de producción. El agente activo (somnio-v3) debe cotizar el nuevo precio consistentemente en PACK_PRICES, PACK_PRICES_NUMERIC y el prompt de comprensión. Aprovechar el cambio para marcar código legacy (somnio-sales-v1) como deprecated y eliminar un SQL suelto obsoleto.

Output: 3 commits atómicos pusheados a Vercel, código de somnio-v3 con precio 1x=$79,900, SOMNIO_PRICES legacy documentado como @deprecated, y repo sin el archivo temp-update-templates.sql.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/comprehension-prompt.ts
@src/lib/agents/somnio/variable-substitutor.ts

Contexto clave:
- El agente activo en producción es `somnio-v3`. El agente `somnio-sales-v1` (que usa `variable-substitutor.ts`) está muerto pero su código sigue en el repo.
- La DB (`agent_templates`) ya fue actualizada manualmente por el usuario vía SQL editor de Supabase. NO hay que crear migración.
- 2x y 3x NO cambian ($129,900 y $169,900 respectivamente).
- Regla 1 del proyecto: push a Vercel obligatorio tras cambios de código.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bajar precio 1x a $79,900 en somnio-v3 (commit 1)</name>
  <files>
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/comprehension-prompt.ts
  </files>
  <action>
Aplicar 3 cambios puntuales en el código del agente somnio-v3:

1. `src/lib/agents/somnio-v3/constants.ts` línea 140 (dentro de `PACK_PRICES`):
   - Cambiar `'1x': '$89,900',` → `'1x': '$79,900',`

2. `src/lib/agents/somnio-v3/constants.ts` línea 151 (dentro de `PACK_PRICES_NUMERIC`):
   - Cambiar `'1x': 89900,` → `'1x': 79900,`

3. `src/lib/agents/somnio-v3/comprehension-prompt.ts` línea 29:
   - Línea actual: `PRECIOS: 1 frasco (1x) = $89,900 | 2 frascos (2x) = $129,900 | 3 frascos (3x) = $169,900`
   - Línea nueva: `PRECIOS: 1 frasco (1x) = $79,900 | 2 frascos (2x) = $129,900 | 3 frascos (3x) = $169,900`
   - SOLO reemplazar el 1x. Los segmentos de 2x y 3x deben quedar intactos byte-por-byte.

IMPORTANTE:
- NO tocar ningún otro valor de PACK_PRICES o PACK_PRICES_NUMERIC (2x, 3x, etc).
- Usar Read antes de Edit en cada archivo para confirmar las líneas exactas (los números de línea pueden variar levemente si el archivo fue editado recientemente).
- Si los números de línea no coinciden, buscar por contenido (`'1x': '$89,900'` y `'1x': 89900`) y aplicar el reemplazo por string match.

Tras aplicar los 3 cambios, hacer commit atómico:

```bash
git add src/lib/agents/somnio-v3/constants.ts src/lib/agents/somnio-v3/comprehension-prompt.ts
git commit -m "$(cat <<'EOF'
feat(somnio-v3): bajar precio 1x a $79,900

Sincroniza código con precio ya actualizado manualmente en
agent_templates (DB producción). Solo afecta 1 frasco; 2x y 3x
se mantienen en $129,900 y $169,900.

- PACK_PRICES['1x']: $89,900 → $79,900
- PACK_PRICES_NUMERIC['1x']: 89900 → 79900
- comprehension-prompt: PRECIOS actualizado

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```
  </action>
  <verify>
```bash
# 1. Confirmar los 3 cambios exactos
grep -n "'1x':" src/lib/agents/somnio-v3/constants.ts
# Debe mostrar: '1x': '$79,900' y '1x': 79900

grep -n "1 frasco (1x)" src/lib/agents/somnio-v3/comprehension-prompt.ts
# Debe contener "= $79,900"

# 2. Confirmar que 2x y 3x NO cambiaron
grep -n "'2x'\|'3x'" src/lib/agents/somnio-v3/constants.ts
# 2x debe seguir en $129,900 / 129900
# 3x debe seguir en $169,900 / 169900

# 3. Confirmar commit
git log -1 --oneline
```
  </verify>
  <done>
- constants.ts tiene `'1x': '$79,900'` y `'1x': 79900` (nuevos valores)
- constants.ts conserva `'2x': '$129,900'` / `129900` y `'3x': '$169,900'` / `169900` (sin cambios)
- comprehension-prompt.ts línea 29 tiene `1 frasco (1x) = $79,900` y conserva `2 frascos (2x) = $129,900 | 3 frascos (3x) = $169,900`
- Commit `feat(somnio-v3): bajar precio 1x a $79,900` creado con solo esos 2 archivos staged
  </done>
</task>

<task type="auto">
  <name>Task 2: Marcar SOMNIO_PRICES legacy como @deprecated (commit 2)</name>
  <files>src/lib/agents/somnio/variable-substitutor.ts</files>
  <action>
Agregar un JSDoc `@deprecated` arriba del `export` de `SOMNIO_PRICES` en la línea 19 (aprox).

NO borrar código. NO cambiar ningún valor numérico ($77,900, etc). SOLO agregar el bloque JSDoc.

Pasos:
1. Leer `src/lib/agents/somnio/variable-substitutor.ts` para localizar el `export` exacto de `SOMNIO_PRICES` (línea ~19).

2. Insertar justo antes de ese `export` el siguiente bloque JSDoc:

```ts
/**
 * @deprecated Este mapa pertenece al agente legacy `somnio-sales-v1`,
 * que está muerto en producción. El agente activo es `somnio-v3` y sus
 * precios viven en `src/lib/agents/somnio-v3/constants.ts`
 * (ver `PACK_PRICES` y `PACK_PRICES_NUMERIC`).
 *
 * NO usar este export para nuevas features. Cualquier cambio de precio
 * en producción debe hacerse en `somnio-v3/constants.ts` y en la tabla
 * `agent_templates` de Supabase.
 */
```

3. Si ya existe un comentario arriba del export, insertar el bloque JSDoc ENTRE el comentario existente y el `export` (o arriba de todo si no hay conflicto). Preservar cualquier comentario previo.

4. NO modificar ninguna otra parte del archivo.

5. Commit atómico:

```bash
git add src/lib/agents/somnio/variable-substitutor.ts
git commit -m "$(cat <<'EOF'
docs(somnio-v1): marcar SOMNIO_PRICES como deprecated

El agente somnio-sales-v1 está muerto en producción; el activo es
somnio-v3 cuyos precios viven en somnio-v3/constants.ts. Añade JSDoc
@deprecated para evitar que futuros cambios de precio se hagan por
error en este archivo legacy.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```
  </action>
  <verify>
```bash
# JSDoc deprecated presente arriba del export
grep -n "@deprecated\|SOMNIO_PRICES" src/lib/agents/somnio/variable-substitutor.ts
# Debe mostrar @deprecated ANTES de SOMNIO_PRICES

# Los valores legacy NO cambiaron (77900 sigue ahí)
grep -n "77900\|77,900" src/lib/agents/somnio/variable-substitutor.ts

# TypeScript compila (no rompimos sintaxis)
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "variable-substitutor" || echo "OK: no errors in variable-substitutor.ts"

# Commit creado
git log -1 --oneline
```
  </verify>
  <done>
- JSDoc `@deprecated` insertado inmediatamente antes del `export` de `SOMNIO_PRICES`
- El bloque menciona explícitamente somnio-v3/constants.ts como fuente de verdad
- Valores numéricos del objeto SOMNIO_PRICES sin cambios
- TypeScript compila sin nuevos errores en ese archivo
- Commit `docs(somnio-v1): marcar SOMNIO_PRICES como deprecated` creado
  </done>
</task>

<task type="auto">
  <name>Task 3: Eliminar temp-update-templates.sql, grep final y push (commit 3)</name>
  <files>temp-update-templates.sql</files>
  <action>
Paso 1 — Eliminar el archivo obsoleto:

```bash
rm temp-update-templates.sql
```

Es un SQL suelto en la raíz del repo, sobrante de una migración vieja de templates ya aplicada en producción. No tiene valor histórico (ya hay commits que documentan el cambio).

Paso 2 — Grep final de verificación del scope completo. Debe retornar 0 matches:

```bash
grep -rn "89900\|\$89,900" src/lib/agents/somnio-v3 src/lib/agents/somnio
```

Si aparece CUALQUIER match:
- Detenerse.
- Reportar el archivo y línea.
- NO continuar con el commit ni el push.
- Volver atrás al Task 1 o Task 2 según corresponda.

Si retorna 0 matches (exit code 1 en grep sin `-q`), continuar.

Paso 3 — Commit atómico de la eliminación:

```bash
git add -u temp-update-templates.sql
git commit -m "$(cat <<'EOF'
chore: eliminar temp-update-templates.sql obsoleto

SQL suelto en raíz del repo, sobrante de una migración vieja de
templates ya aplicada en producción hace tiempo. Sin valor histórico
(hay commits documentando el cambio).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

Paso 4 — Push a Vercel (Regla 1 del proyecto):

```bash
git push origin main
```

Paso 5 — Verificar que los 3 commits llegaron a origin:

```bash
git log origin/main -3 --oneline
```
  </action>
  <verify>
```bash
# 1. Archivo eliminado del FS y del index
ls temp-update-templates.sql 2>&1 | grep -i "no such file" && echo "OK: archivo eliminado"
git ls-files temp-update-templates.sql
# Debe retornar vacío

# 2. GREP FINAL (crítico - requisito de <constraints>)
grep -rn "89900\|\$89,900" src/lib/agents/somnio-v3 src/lib/agents/somnio
# Debe retornar 0 matches (exit 1)

# 3. Los 3 commits en origin
git log origin/main -3 --oneline
# Debe mostrar:
# chore: eliminar temp-update-templates.sql obsoleto
# docs(somnio-v1): marcar SOMNIO_PRICES como deprecated
# feat(somnio-v3): bajar precio 1x a $79,900

# 4. Working tree limpio (solo para los archivos tocados en este plan)
git status --short src/lib/agents/somnio-v3 src/lib/agents/somnio temp-update-templates.sql
# Debe estar vacío
```
  </verify>
  <done>
- `temp-update-templates.sql` no existe en el filesystem ni en git ls-files
- `grep -rn "89900\|$89,900" src/lib/agents/somnio-v3 src/lib/agents/somnio` retorna 0 matches
- Commit `chore: eliminar temp-update-templates.sql obsoleto` creado
- `git push origin main` ejecutado con éxito
- Los 3 commits (feat somnio-v3, docs somnio-v1, chore) visibles en `origin/main`
  </done>
</task>

</tasks>

<verification>
Checks globales al terminar los 3 tasks:

```bash
# 1. Scope de precio limpio (requisito bloqueante)
grep -rn "89900\|\$89,900" src/lib/agents/somnio-v3 src/lib/agents/somnio
# 0 matches

# 2. Nuevo precio presente en los 3 lugares esperados
grep -rn "79900\|\$79,900" src/lib/agents/somnio-v3
# 3 matches: PACK_PRICES, PACK_PRICES_NUMERIC, comprehension-prompt

# 3. 2x y 3x intactos
grep -rn "129900\|\$129,900\|169900\|\$169,900" src/lib/agents/somnio-v3/constants.ts src/lib/agents/somnio-v3/comprehension-prompt.ts
# Debe mostrar los 4 valores (2x y 3x en ambos formatos)

# 4. @deprecated aplicado
grep -B1 -A2 "SOMNIO_PRICES" src/lib/agents/somnio/variable-substitutor.ts | head -20
# Debe verse @deprecated arriba del export

# 5. Archivo eliminado
test ! -f temp-update-templates.sql && echo "OK"

# 6. 3 commits en origin
git log origin/main -3 --oneline

# 7. TypeScript sigue compilando
npx tsc --noEmit 2>&1 | grep -i "somnio" || echo "OK: no TS errors en somnio"
```
</verification>

<success_criteria>
- [ ] PACK_PRICES['1x'] = '$79,900' en `src/lib/agents/somnio-v3/constants.ts`
- [ ] PACK_PRICES_NUMERIC['1x'] = 79900 en el mismo archivo
- [ ] comprehension-prompt.ts línea de PRECIOS muestra `1 frasco (1x) = $79,900` (con 2x/3x intactos)
- [ ] 2x ($129,900 / 129900) y 3x ($169,900 / 169900) SIN cambios en ambos archivos
- [ ] `grep -rn "89900\|\$89,900" src/lib/agents/somnio-v3 src/lib/agents/somnio` retorna 0 matches
- [ ] SOMNIO_PRICES en `src/lib/agents/somnio/variable-substitutor.ts` tiene JSDoc @deprecated que apunta a somnio-v3/constants.ts como fuente de verdad
- [ ] Valores numéricos de SOMNIO_PRICES legacy sin cambios (solo se agregó comentario)
- [ ] `temp-update-templates.sql` eliminado del repo (filesystem + git)
- [ ] 3 commits atómicos creados: `feat(somnio-v3)...`, `docs(somnio-v1)...`, `chore: eliminar temp-update-templates.sql...`
- [ ] `git push origin main` ejecutado, los 3 commits visibles en `origin/main`
- [ ] TypeScript compila sin errores nuevos en archivos somnio
</success_criteria>

<output>
Quick task — no SUMMARY.md requerido. Al terminar, confirmar al usuario:
- Los 3 commits pusheados a Vercel
- El grep final de verificación
- Que la DB ya estaba actualizada (no se tocó Supabase)
</output>
