---
phase: twilio-to-onurix-migration
plan: 04
type: execute
wave: 3
depends_on: [02, 03]
files_modified:
  - package.json
  - pnpm-lock.yaml
autonomous: false

must_haves:
  truths:
    - "package.json no contiene dependencia 'twilio'"
    - "pnpm-lock.yaml no contiene entries de 'twilio@'"
    - "pnpm install --frozen-lockfile corre sin errores"
    - "pnpm build (next build con TS strict) pasa verde — detectaría cualquier import Twilio residual"
    - "Regresión Onurix pasa: scripts/test-onurix-sms.mjs y test-onurix-domain.mjs salen exit 0"
    - "Allowlist de identificadores Twilio (14 tokens surface-area: '@/lib/twilio', 'executeSendSmsTwilio', 'saveTwilioIntegration', 'twilioWarning', 'TwilioConfig', 'send_sms_onurix', etc.) devuelve 0 matches en src/ TS/TSX — hard gate pre-deploy, sin falsos positivos de comentarios"
    - "Tras deploy a Vercel, /api/webhooks/twilio/status devuelve 404 (nativo, sin route)"
    - "Tras deploy, al disparar una de las 3 automations ex-Twilio (GUIA TRANSPORTADORA / Inter / template final ultima), el SMS se envía por Onurix con sms_messages.provider='onurix' (D-04 validación humana real)"
  artifacts:
    - path: "package.json"
      provides: "Manifest sin dep Twilio"
      contains: '"shopify-api-node"'
    - path: "pnpm-lock.yaml"
      provides: "Lockfile sin entries twilio"
      contains: "lockfileVersion"
  key_links:
    - from: "Vercel build pipeline"
      to: "pnpm install --frozen-lockfile"
      via: "package.json + pnpm-lock.yaml"
      pattern: "frozen-lockfile"
---

<objective>
Fase B (parte 3/3) — Retirada de dep + deploy + validación humana final. Correr `pnpm remove twilio` para eliminar la dep del `package.json` y del lockfile. Verificar que `pnpm build` pasa verde (TS strict detectaría cualquier import sobreviviente). Push a Vercel (Regla 1 CLAUDE.md). Tras deploy, el humano dispara cada una de las 3 automations ex-Twilio y Claude verifica que el SMS sale vía Onurix (este ES el test real de D-04, no Fase A — ver RESEARCH.md §Pitfall 5).

Purpose: Cierre del cutover. Plan 02 + Plan 03 ya eliminaron los callers de `twilio` npm; este plan cierra el ciclo retirando el paquete del árbol de dependencias y validando end-to-end con tráfico real que Onurix entrega.

Output: Zero trazas de Twilio en el repo. Producción enviando SMS por Onurix confirmado con evidencia (`sms_messages.provider='onurix'` para nuevos envíos de las 3 automations).

Este plan es **autonomous: false** porque contiene el checkpoint D-04 (validación con triggers reales en producción) — NO se puede verificar automáticamente sin acción humana (disparar los flows de cada automation con datos reales controlados).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/twilio-to-onurix-migration/CONTEXT.md — D-04 (validación manual), D-10 (retirar dep twilio)
@.planning/standalone/twilio-to-onurix-migration/RESEARCH.md — §Example 5 (pnpm remove), §Pitfall 5 (validación POST-Fase B, no antes), §Example 4 (ripgrep gates pre-merge)
@CLAUDE.md — Regla 1 (push a Vercel antes de pedir pruebas), Regla 6 (proteger agente producción)
@scripts/test-onurix-sms.mjs — regresión Onurix API
@scripts/test-onurix-domain.mjs — regresión Onurix domain
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: pnpm remove twilio + gate de grep final + pnpm build verde</name>
  <files>
    package.json
    pnpm-lock.yaml
  </files>
  <read_first>
    - package.json (línea 84 con dep twilio)
    - pnpm-lock.yaml (contiene ~2 entries de twilio@5.12.1)
    - .planning/standalone/twilio-to-onurix-migration/RESEARCH.md §Example 4 (comandos grep gate) y §Example 5 (pnpm remove)
  </read_first>
  <action>
    **A. Pre-check: confirmar que `package.json` todavía lista la dep (para que `pnpm remove` tenga algo que retirar):**
    ```bash
    # Desde raíz del repo.
    grep -n '"twilio":' package.json  # Expected: muestra la línea ~84 con la dep — confirma state pre-edit.
    ```
    El gate duro de `src/` limpio se evalúa al final (`<verify>`) con un allowlist targeted (ver ahí). NO se ejecuta un `grep -ri "twilio" src/` aquí — es propenso a falsos positivos en comentarios incidentales.

    **B. Retirar la dep:**
    ```bash
    pnpm remove twilio
    ```
    Esto actualiza `package.json` (elimina línea 84) Y `pnpm-lock.yaml` (elimina las ~2 entries de `/twilio/5.12.1`).

    **C. Verificar que el lockfile quedó limpio:**
    ```bash
    grep -n "^twilio@\|/twilio/" pnpm-lock.yaml
    # Debe devolver 0 matches (exit 1).

    grep -c '"twilio":' package.json
    # Debe devolver 0.
    ```

    **D. Correr `pnpm install --frozen-lockfile` para confirmar consistencia:**
    ```bash
    pnpm install --frozen-lockfile
    # Expected: exit 0, "Lockfile up-to-date"
    ```

    **E. Correr build completo (TS strict + next build):**
    ```bash
    pnpm build
    # Expected: exit 0. Cualquier import de `twilio` o `@/lib/twilio` sobreviviente aquí falla el build.
    ```

    **F. Correr tests de regresión Onurix (scripts standalone):**
    ```bash
    node --env-file=.env.local scripts/test-onurix-sms.mjs
    node --env-file=.env.local scripts/test-onurix-domain.mjs
    ```
    Si cualquiera falla, investigar — probablemente alguna edición de Plan 02 rompió el domain layer.

    **G. Commit atómico:**
    ```bash
    git add package.json pnpm-lock.yaml
    git commit -m "chore(twilio-migration): retirar dep npm twilio (pnpm remove) + lockfile"
    ```

    NO pushear todavía — el push va junto con la verificación final en Task 2.
  </action>
  <verify>
    <automated>grep -c '"twilio":' package.json | grep -qx "0"</automated>
    <automated>grep -E "^twilio@|/twilio/" pnpm-lock.yaml 2>&1 | (! grep -q .)</automated>
    <!-- Targeted allowlist of Twilio surface-area identifiers from AUDIT-REPORT §Inventario. Avoids false positives from incidental comments / var names. -->
    <automated>! grep -rE "twilio-form|twilio-usage|@/lib/twilio|checkTwilioConfigured|executeSendSmsTwilio|saveTwilioIntegration|testTwilioConnection|getTwilioIntegration|twilioWarning|TwilioConfig|createTwilioClient|getTwilioConfig|send_sms_onurix|Enviar SMS \(Twilio\)|category: 'Twilio'" src/ --include="*.ts" --include="*.tsx"</automated>
    <automated>pnpm install --frozen-lockfile 2>&1 | tail -5</automated>
    <automated>pnpm build 2>&1 | tail -10</automated>
    <automated>node --env-file=.env.local scripts/test-onurix-sms.mjs 2>&1 | tail -5</automated>
    <automated>node --env-file=.env.local scripts/test-onurix-domain.mjs 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` no contiene la key `"twilio":`.
    - `pnpm-lock.yaml` no contiene líneas matcheando `^twilio@` ni `/twilio/`.
    - Allowlist de identificadores Twilio (regex con los 14 surface-area tokens del AUDIT-REPORT) devuelve 0 matches en `src/` TS/TSX — gate final pre-deploy.
    - `pnpm install --frozen-lockfile` completa con exit 0.
    - `pnpm build` completa con exit 0 (TS strict pasa).
    - Tests de regresión Onurix pasan (`test-onurix-sms.mjs` + `test-onurix-domain.mjs`).
    - Commit creado con mensaje exacto `chore(twilio-migration): retirar dep npm twilio (pnpm remove) + lockfile`.
  </acceptance_criteria>
  <done>
    - Dep retirada, lockfile limpio, build verde, regresión pasa, commit listo para push (Task 2 empuja).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Push a Vercel + validación humana D-04 (3 triggers reales + sms_messages.provider='onurix')</name>
  <read_first>
    - .planning/standalone/twilio-to-onurix-migration/CONTEXT.md §D-04 (validación manual con triggers reales)
    - .planning/standalone/twilio-to-onurix-migration/RESEARCH.md §Pitfall 5 (validación pertenece a Fase B, no Fase A)
    - CLAUDE.md §Regla 1 (push a Vercel antes de pedir pruebas)
  </read_first>
  <what-built>
    - Backend sin código Twilio (Plan 02)
    - UI sin referencias Twilio (Plan 03)
    - Dep Twilio retirada del árbol (Task 1 de este plan)
    - Build verde localmente

    Falta:
    1. Push a Vercel (deploy automático en main).
    2. Validación humana: disparar cada una de las 3 automations que ANTES usaban Twilio y confirmar que el SMS sale por Onurix (este es el D-04 real).
    3. Verificar que el webhook eliminado devuelve 404 tras deploy.
    4. Confirmación final para cerrar el phase.

    **RESULTADO ESPERADO tras este checkpoint:** Producción 100% Onurix, cero código Twilio, 0 confusiones en UI, warnings reales en wizard, dep retirada. El usuario también debe retirar manualmente (post-fase, out of scope):
    - Webhook URL en consola Twilio
    - Env vars Twilio en Vercel (si existían)
  </what-built>
  <how-to-verify>
    **Paso 1 — Push a Vercel:**
    ```bash
    git push origin main
    ```
    Vercel auto-deploya. Esperar que el build termine (ver en Vercel dashboard).

    Si el build FALLA en Vercel (ej. `Cannot find module 'twilio'`), significa que algo escapó al grep local — parar, investigar, y re-correr Task 1 gate.

    **Paso 2 — Verificar webhook eliminado (post-deploy):**
    ```bash
    curl -X POST https://morfx.app/api/webhooks/twilio/status -d '{"test":1}' -H "Content-Type: application/json" -o /dev/null -w "%{http_code}\n"
    ```
    Expected: `404` (ruta no existe, Next.js devuelve 404 nativo).

    **Paso 3 — Validación D-04 real con las 3 automations ex-Twilio:**

    Para cada una de:
    - GUIA TRANSPORTADORA (`f77bff5b-eef8-4c12-a5a7-4a4127837575`)
    - Inter (`24005a44-d97e-406e-bdac-f74dbb2b5786`)
    - template final ultima (`71c4f524-2c8b-4350-a96d-bbc8a258b6ff`)

    Y opcionalmente REPARTO (`c24cde89-2f91-493c-8d5b-7cd7610490e8`) para confirmar que el rename no rompió nada:

    1. El usuario dispara el trigger de la automation con un contacto de prueba o dato real controlado.
    2. Claude consulta en Supabase SQL Editor:
       ```sql
       SELECT
         id,
         provider,
         status,
         to_number,
         created_at,
         cost_cop,
         source
       FROM sms_messages
       WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
         AND created_at > NOW() - INTERVAL '10 minutes'
       ORDER BY created_at DESC
       LIMIT 5;
       ```
       Expected:
       - `provider = 'onurix'` (NO `'twilio'`)
       - `source = 'automation'`
       - `cost_cop = 97` (o múltiplo si es multi-segment)
       - `status`: arranca en `pending`, cambia a `delivered` tras ~60s vía Inngest `sms-delivery-check`.
    3. El cliente de prueba confirma que recibió el SMS con sender `MORFX`.

    **Paso 4 — Checklist final al cerrar el phase:**
    - [ ] 3 automations validadas con provider='onurix' en sms_messages
    - [ ] Cliente de prueba recibió cada uno de los 3 SMS
    - [ ] Status final `delivered` en los 3 registros
    - [ ] Webhook Twilio devuelve 404 (confirmado con curl)
    - [ ] Humano retiró (o anotó como pendiente) la URL del webhook en la consola Twilio
    - [ ] Humano retiró (o anotó como pendiente) env vars `TWILIO_*` en Vercel dashboard
    - [ ] LEARNINGS.md actualizado (ver Regla 0 CLAUDE.md)

    **Paso 5 — Commit final (si hay cambios de docs):**
    Si Claude documentó observaciones durante la validación (p. ej. descubrimientos sobre REPARTO), commit con:
    ```bash
    git add .planning/standalone/twilio-to-onurix-migration/
    git commit -m "docs(twilio-migration): cerrar fase con resultado de validación real"
    git push origin main
    ```
  </how-to-verify>
  <acceptance_criteria>
    - Push a Vercel exitoso (build verde).
    - `curl` a `/api/webhooks/twilio/status` devuelve 404.
    - Las 3 automations ex-Twilio (GUIA TRANSPORTADORA, Inter, template final ultima) fueron disparadas con contacto de prueba.
    - Cada una generó una fila en `sms_messages` con `provider='onurix'` Y `status='delivered'` (o al menos `status='sent'` → Inngest actualizará a delivered en 60s).
    - Cliente de prueba confirmó recepción de cada SMS (acción humana).
    - Humano aprueba cierre del phase.
  </acceptance_criteria>
  <resume-signal>
    Escribe "validación completa" si las 3 automations enviaron por Onurix correctamente y recibiste los SMS en los contactos de prueba.

    Si alguna automation falla (p. ej. `provider='twilio'` aparece en `sms_messages` tras el deploy), DESCRIBE el fallo — significa que el deploy no se propagó o que un caller sobrevivió. En ese caso: rollback via `git revert` del commit de Plan 02/03/04 mientras se investiga.
  </resume-signal>
</task>

</tasks>

<verification>
- `pnpm build` pasa verde localmente antes del push (gate duro).
- `grep -ri "twilio" src/` devuelve 0 matches.
- Deploy Vercel verde.
- Webhook eliminado devuelve 404.
- 3 automations validadas end-to-end con `sms_messages.provider='onurix'`.
- Humano confirma cierre.
</verification>

<success_criteria>
- Twilio completamente eliminado del codebase (src/, package.json, pnpm-lock.yaml, api/webhooks/).
- Producción enviando SMS vía Onurix a través del domain layer (Regla 3 honrada end-to-end).
- UI consistente: un solo tab SMS, un solo warning real en wizard.
- Cero falsos positivos / cero código muerto.
- Validación humana con tráfico real confirma el switch exitoso.
</success_criteria>

<output>
After completion, create `.planning/standalone/twilio-to-onurix-migration/04-SUMMARY.md` documenting:
- Resultado de pnpm remove (líneas eliminadas de package.json y lockfile)
- Output de pnpm build final (success)
- Resultado de los tests de regresión Onurix
- URL del deploy Vercel
- Para cada una de las 3 automations: ID, timestamp del trigger, ID del registro en sms_messages, status final
- Checklist de acciones post-phase pendientes (retirar webhook URL Twilio + env vars)
- Nota para LEARNINGS.md (Regla 0 CLAUDE.md — documentar bugs encontrados y patterns aprendidos durante el cutover)
</output>
