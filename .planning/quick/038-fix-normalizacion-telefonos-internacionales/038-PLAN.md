---
phase: quick-038
plan: 038
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/utils/phone.ts
  - src/app/actions/conversations.ts
  - src/components/contacts/phone-input.tsx
  - src/lib/csv/parser.ts
  - src/lib/tools/handlers/crm/index.ts
autonomous: true

must_haves:
  truths:
    - "Números internacionales (US, MX, etc.) se normalizan correctamente a E.164"
    - "Números colombianos siguen funcionando (backward compat)"
    - "startNewConversation ya no prepende '+57' hardcoded en else final"
    - "phone-input.tsx usa validación genérica internacional"
    - "TypeScript compila sin errores nuevos"
  artifacts:
    - path: "src/lib/utils/phone.ts"
      provides: "normalizePhone internacional + isValidPhone genérica"
      contains: "parsePhoneNumberFromString"
    - path: "src/app/actions/conversations.ts"
      provides: "startNewConversation usando helper compartido"
      contains: "normalizePhone("
    - path: "src/components/contacts/phone-input.tsx"
      provides: "Validación internacional de teléfono en UI"
      contains: "isValidPhone"
    - path: "src/lib/csv/parser.ts"
      provides: "Mensaje de error actualizado (no dice 'colombiano')"
    - path: "src/lib/tools/handlers/crm/index.ts"
      provides: "Mensajes PHONE_INVALID con ejemplos +1 y +52"
  key_links:
    - from: "src/app/actions/conversations.ts"
      to: "src/lib/utils/phone.ts"
      via: "import normalizePhone"
      pattern: "from.*lib/utils/phone"
    - from: "src/components/contacts/phone-input.tsx"
      to: "src/lib/utils/phone.ts"
      via: "import isValidPhone"
      pattern: "isValidPhone"
---

<objective>
Verificar y commitear el fix de normalización internacional de teléfonos que ya fue aplicado al working tree por una sesión de debug.

Purpose: El bug reportado (MorfX antepone +57 a números extranjeros, impidiendo enviar WhatsApp a clientes US/MX) ya tiene fix implementado y verificado por el debugger. Esta quick task cierra el loop: verifica congruencia, re-corre typecheck, y consolida el fix en un commit atómico.

Output: 1 commit atómico con los 5 archivos modificados + SUMMARY.md documentando la resolución.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/debug/resolved/foreign-number-prefix.md
</context>

<critical_notice>
**EL FIX YA FUE APLICADO AL WORKING TREE.** NO re-implementar nada.

Los 5 archivos listados en files_modified ya contienen los cambios descritos en el debug session (ver sección `fix:` del markdown). El debugger ya ejecutó `npx tsc --noEmit` limpio y validó 11 casos con libphonenumber-js.

Tu trabajo es SOLO:
1. Verificar que el working tree coincide con lo documentado
2. Re-correr typecheck
3. Commitear
4. Escribir SUMMARY
</critical_notice>

<tasks>

<task type="auto">
  <name>Task 1: Verificar working tree + typecheck</name>
  <files>
    src/lib/utils/phone.ts
    src/app/actions/conversations.ts
    src/components/contacts/phone-input.tsx
    src/lib/csv/parser.ts
    src/lib/tools/handlers/crm/index.ts
  </files>
  <action>
    Verificar que los 5 archivos modificados en working tree contienen los cambios descritos en .planning/debug/resolved/foreign-number-prefix.md:

    1. Ejecutar `git status` y confirmar que los 5 archivos aparecen como modified (M).

    2. Ejecutar `git diff src/lib/utils/phone.ts` y verificar:
       - `normalizePhone` usa `parsePhoneNumberFromString` (no la validación `country !== 'CO'` rechazando)
       - Existe nueva función exportada `isValidPhone`
       - Estrategia: si empieza con '+' parsea internacional; si no, fallback CO / prepend '+'

    3. Ejecutar `git diff src/app/actions/conversations.ts` y verificar:
       - `startNewConversation` ya NO contiene el bloque `'+57' + normalizedPhone`
       - Ahora importa/usa `normalizePhone` del helper compartido
       - Las líneas ~569-594 originales están reemplazadas

    4. Ejecutar `git diff src/components/contacts/phone-input.tsx` y verificar:
       - Usa `isValidPhone` en vez de `isValidColombianPhone`
       - Mensaje de error incluye ejemplo internacional (ej: US)

    5. Ejecutar `git diff src/lib/csv/parser.ts` y `git diff src/lib/tools/handlers/crm/index.ts` y verificar:
       - Los mensajes de error ya NO dicen "colombiano"
       - En crm/index.ts los ejemplos incluyen +1 y/o +52

    6. Re-correr typecheck para confirmar que sigue limpio:
       ```bash
       npx tsc --noEmit
       ```
       Si aparecen errores NUEVOS relacionados con los archivos modificados, PARA y reporta. Errores preexistentes no relacionados (tests, otros módulos) son aceptables — el debugger ya los confirmó como pre-existing.

    Si alguna verificación falla (archivo no coincide con debug session), PARA y reporta la discrepancia antes de commitear. NO re-implementar; documentar qué falta.
  </action>
  <verify>
    - `git status` muestra los 5 archivos como modified
    - `git diff` de cada archivo coincide con lo descrito en fix: del debug session
    - `npx tsc --noEmit` no introduce errores nuevos en los 5 archivos
  </verify>
  <done>
    Working tree verificado como congruente con el debug session y typecheck limpio para los archivos modificados. Listo para commit.
  </done>
</task>

<task type="auto">
  <name>Task 2: Commit atómico del fix</name>
  <files>
    src/lib/utils/phone.ts
    src/app/actions/conversations.ts
    src/components/contacts/phone-input.tsx
    src/lib/csv/parser.ts
    src/lib/tools/handlers/crm/index.ts
  </files>
  <action>
    Stagear EXPLÍCITAMENTE solo los 5 archivos del fix (NO usar `git add .` ni `-A` — hay muchos otros archivos modificados/untracked en el repo que NO pertenecen a esta quick task):

    ```bash
    git add \
      src/lib/utils/phone.ts \
      src/app/actions/conversations.ts \
      src/components/contacts/phone-input.tsx \
      src/lib/csv/parser.ts \
      src/lib/tools/handlers/crm/index.ts
    ```

    Verificar staging con `git diff --cached --stat` — deben aparecer exactamente 5 archivos.

    Crear commit atómico con mensaje descriptivo en español (siguiendo convención del repo):

    ```
    fix(quick-038): normalizacion internacional de telefonos

    Soporta numeros extranjeros (US, MX, etc.) usando libphonenumber-js
    con auto-deteccion de pais. Antes el sistema antepone '+57' hardcoded
    a cualquier numero no-CO, bloqueando envio de WhatsApp a clientes
    internacionales.

    - phone.ts: normalizePhone reescrita con parsePhoneNumberFromString,
      nueva funcion isValidPhone generica internacional
    - conversations.ts: startNewConversation usa helper compartido en
      lugar de logica custom que prependia '+57' en else final
    - phone-input.tsx: usa isValidPhone generico, acepta internacionales
    - csv/parser.ts + tools/handlers/crm: mensajes de error actualizados
      con ejemplos +1 y +52

    Agentes Somnio/Godentist (normalizers.ts) NO modificados — fuera de
    scope, solo atienden mercado CO por ahora.

    Casos verificados:
    - +1 714-408-2081 → +17144082081 (US)
    - +52 55 1234 5678 → +525512345678 (MX)
    - 3001234567 → +573001234567 (CO backward compat)
    - 7144082081 → null (10 digitos ambiguo, UI pide codigo pais)

    Debug session: .planning/debug/resolved/foreign-number-prefix.md

    Co-Authored-By: Claude <noreply@anthropic.com>
    ```

    NO hacer push todavía (el usuario decide cuándo). Dejar el commit local listo.

    **IMPORTANTE:** NO modificar git config, NO usar --no-verify, NO amend. Si pre-commit hook falla, investigar y crear commit nuevo.
  </action>
  <verify>
    - `git log -1 --stat` muestra el commit con exactamente 5 archivos
    - `git status` muestra los 5 archivos ya NO en modified (committed)
    - Otros archivos modificados/untracked del repo siguen intactos (no contaminaron el commit)
  </verify>
  <done>
    Fix consolidado en 1 commit atómico local. Working tree limpio respecto a los 5 archivos del fix. Otros cambios del repo preservados.
  </done>
</task>

</tasks>

<verification>
Al finalizar los 2 tasks:

1. `git log -1 --oneline` muestra el commit del fix
2. `git log -1 --stat` confirma exactamente 5 archivos en el commit
3. `npx tsc --noEmit` no tiene errores nuevos en los archivos modificados
4. `git status` muestra los 5 archivos fuera de la lista de modified
5. Debug session markdown sigue en `.planning/debug/resolved/foreign-number-prefix.md`
</verification>

<success_criteria>
- [ ] Working tree verificado como congruente con debug session
- [ ] `npx tsc --noEmit` limpio para archivos del fix
- [ ] 1 commit atómico creado con los 5 archivos (y solo esos 5)
- [ ] Commit message descriptivo en español con co-author
- [ ] Otros archivos modificados/untracked del repo intactos
- [ ] SUMMARY.md escrito en quick task directory
</success_criteria>

<output>
After completion, create `.planning/quick/038-fix-normalizacion-telefonos-internacionales/038-SUMMARY.md` documentando:
- Qué se verificó (congruencia working tree vs debug session)
- Resultado del typecheck
- Hash del commit creado
- Link al debug session como referencia del root cause analysis
- Nota explícita de que `src/lib/agents/somnio/normalizers.ts` quedó fuera de scope por diseño
</output>
