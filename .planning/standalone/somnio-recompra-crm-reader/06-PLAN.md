---
phase: somnio-recompra-crm-reader
plan: 06
type: execute
wave: 4
depends_on: [01, 02, 03, 04, 05]
files_modified:
  - src/lib/agents/somnio-recompra/comprehension-prompt.ts
  - src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts
autonomous: true

must_haves:
  truths:
    - "`buildSystemPrompt(existingData, recentBotMessages)` extrae `existingData['_v3:crm_context']` y `existingData['_v3:crm_context_status']`"
    - "Condicion de inyeccion: `hasCrmContext = crmStatus === 'ok' && crmContext && crmContext.trim().length > 0`"
    - "Cuando hasCrmContext, el prompt final contiene la seccion literal `## CONTEXTO CRM DEL CLIENTE (precargado)` + el texto del crmContext + linea `(Usa este contexto para personalizar la comprension; NO reinventes datos.)`"
    - "La seccion `## CONTEXTO CRM DEL CLIENTE` se inyecta ANTES de `DATOS YA CAPTURADOS` (orden: analizador intro → crmSection → dataSection → botContextSection)"
    - "Las keys con prefijo `_v3:` se FILTRAN del JSON dump de `DATOS YA CAPTURADOS` — no aparecen 2 veces en el prompt ni pollucionan el dataSection"
    - "Cuando status es `'empty'`, `'error'`, `'timeout'`, o ausente, el prompt NO incluye la seccion crm — comportamiento identico al actual"
    - "Unit test cubre: (a) status=ok inyecta seccion + filtra _v3, (b) status=empty NO inyecta, (c) status=error NO inyecta, (d) status ausente NO inyecta, (e) filtrado funciona con multiples _v3: keys, (f) existingData con keys normales + _v3 mixed funciona correctamente"
  artifacts:
    - path: "src/lib/agents/somnio-recompra/comprehension-prompt.ts"
      provides: "Comprehension system prompt extendido con inyeccion condicional de contexto CRM"
      contains: "CONTEXTO CRM DEL CLIENTE"
    - path: "src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts"
      provides: "Unit test de inyeccion + filtrado"
      contains: "buildSystemPrompt"
  key_links:
    - from: "src/lib/agents/somnio-recompra/comprehension-prompt.ts"
      to: "src/lib/agents/somnio-recompra/somnio-recompra-agent.ts (Plan 05 pollCrmContext output)"
      via: "existingData Record<string, string> carrying _v3:crm_context + _v3:crm_context_status after poll"
      pattern: "existingData\\['_v3:crm_context'\\]"
---

<objective>
Wave 4 — Reader-side consumption (prompt building). Extender `buildSystemPrompt` del comprehension-prompt de recompra para:
1. **Inyectar** una seccion dedicada `## CONTEXTO CRM DEL CLIENTE (precargado)` con el texto del `_v3:crm_context` cuando el status marker es `'ok'`.
2. **Filtrar** las keys `_v3:*` del JSON dump del `DATOS YA CAPTURADOS` para que no aparezcan 2 veces y no pollucionen el prompt con metadata interna (Pitfall 7 clean prompt + RESEARCH Claude's Discretion LOCK).

Purpose: Ultima pieza del pipeline de consumo. Plan 05 poblea `input.datosCapturados['_v3:crm_context']` via poll; aqui lo convertimos en informacion que el analizador (Haiku) ve explicitamente como "contexto rico del cliente precargado" en vez de un blob random en el JSON de datos.

Decision LOCK:
- **Ubicacion:** seccion dedicada ANTES de `DATOS YA CAPTURADOS` (RESEARCH Claude's Discretion LOCK).
- **Header literal:** `## CONTEXTO CRM DEL CLIENTE (precargado)` (tipografia exacta).
- **Filtrado:** keys con prefijo `_v3:` removidas del dataSection via `Object.entries().filter()`.
- **NO truncado:** Pitfall 7 dice monitorear antes de truncar — por ahora pasamos el blob completo.

**Regla 6 CRITICAL:** El condicional `hasCrmContext` solo se activa con `status === 'ok'`. Si flag=false en produccion, la Inngest function nunca corre, `_v3:crm_context_status` nunca se setea, el prompt queda identico al actual. Los logs de Plan 05 emiten `crm_context_missing_after_wait` que es la unica señal observable — y esa sale en log backend, no en el prompt. Cero cambio para el cliente en produccion hasta Plan 07 activa el flag.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md — D-11 (comprehension lee al inicio), §Claude's Discretion (seccion dedicada ANTES de DATOS — LOCKED)
@.planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Ejemplo 3 (comprehension prompt injection verbatim), §Pitfall 7 (longitud unbounded, monitoring), Claude's Discretion LOCK
@.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 4 — Comprehension Prompt Shape
@src/lib/agents/somnio-recompra/comprehension-prompt.ts (entero, ~100 lineas — entender concatenacion actual)
@src/lib/agents/somnio/__tests__/block-composer.test.ts (patron de pure-function test, sin I/O)

<interfaces>
<!-- Current buildSystemPrompt (src/lib/agents/somnio-recompra/comprehension-prompt.ts:14-32) -->
export function buildSystemPrompt(
  existingData: Record<string, string>,
  recentBotMessages: string[] = []
): string {
  const dataSection = Object.keys(existingData).length > 0
    ? `\nDATOS YA CAPTURADOS (no re-extraer si ya estan):\n${JSON.stringify(existingData, null, 2)}`
    : '\nDATOS YA CAPTURADOS: Ninguno aun.'

  const botContextSection = recentBotMessages.length > 0
    ? `\nULTIMOS MENSAJES DEL BOT (para contexto de respuestas cortas del cliente):
${recentBotMessages.map((m, i) => `[${i + 1}] "${m}"`).join('\n')}
...`
    : ''

  return `Eres un analizador de mensajes para un agente de ventas de Somnio...${dataSection}${botContextSection}`
}

<!-- Target shape (post-edit) -->
// 1. Extract _v3:crm_context + _v3:crm_context_status from existingData
// 2. Filter _v3:* keys from filteredData (for JSON dump)
// 3. Build crmSection IF status === 'ok' (dedicated header + body)
// 4. Concatenation order: analizador intro + crmSection + dataSection + botContextSection
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Modificar buildSystemPrompt para inyectar seccion CRM + filtrar _v3: keys</name>
  <read_first>
    - src/lib/agents/somnio-recompra/comprehension-prompt.ts (archivo entero — ~100 lineas)
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Ejemplo 3 (shape propuesto verbatim)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 4 — Comprehension Inject (differences + shape exacto)
    - src/lib/agents/somnio-recompra/constants.ts — verificar si existe V3_META_PREFIX constant (RESEARCH cita `'_v3:'`)
  </read_first>
  <action>
    Editar `src/lib/agents/somnio-recompra/comprehension-prompt.ts`.

    La edicion tiene 3 partes:
    1. Extraer `_v3:crm_context` + `_v3:crm_context_status` de `existingData`.
    2. Filtrar todas las keys con prefijo `_v3:` de `existingData` antes de hacer `JSON.stringify` para el `dataSection`.
    3. Agregar una nueva variable `crmSection` que contiene la seccion dedicada, solo cuando `status === 'ok'`.
    4. Concatenar en el template: `intro + crmSection + dataSection + botContextSection`.

    **Reemplazar la funcion `buildSystemPrompt` completa** con la siguiente implementacion:

    ```typescript
    export function buildSystemPrompt(existingData: Record<string, string>, recentBotMessages: string[] = []): string {
      // ★ NEW: Extract CRM context + status marker set by Plan 03 Inngest function + Plan 05 poll.
      const crmContext = existingData['_v3:crm_context']
      const crmStatus = existingData['_v3:crm_context_status']
      const hasCrmContext = crmStatus === 'ok' && crmContext != null && crmContext.trim().length > 0

      // ★ NEW: Filter out _v3:* keys from the data dump. These are internal metadata
      // (crm_context + status marker) — exposing them in "DATOS YA CAPTURADOS" would:
      //   (a) duplicate crm_context (already in crmSection), inflating the prompt
      //   (b) leak implementation details ('_v3:crm_context_status' makes no sense to the analyzer)
      //   (c) confuse the analyzer if it tried to "capture" _v3: keys as regular fields
      const filteredData = Object.fromEntries(
        Object.entries(existingData).filter(([k]) => !k.startsWith('_v3:'))
      )

      const dataSection = Object.keys(filteredData).length > 0
        ? `\nDATOS YA CAPTURADOS (no re-extraer si ya estan):\n${JSON.stringify(filteredData, null, 2)}`
        : '\nDATOS YA CAPTURADOS: Ninguno aun.'

      // ★ NEW: Dedicated section for CRM context, inyected BEFORE "DATOS YA CAPTURADOS"
      // (Claude's Discretion LOCKED per RESEARCH.md — reader output is richer than
      // flat keys, deserves its own labelled block for analyzer context).
      const crmSection = hasCrmContext
        ? `\n\n## CONTEXTO CRM DEL CLIENTE (precargado)\n${crmContext}\n\n(Usa este contexto para personalizar la comprension; NO reinventes datos.)`
        : ''

      const botContextSection = recentBotMessages.length > 0
        ? `\nULTIMOS MENSAJES DEL BOT (para contexto de respuestas cortas del cliente):
    ${recentBotMessages.map((m, i) => `[${i + 1}] "${m}"`).join('\n')}

    REGLA DE CONTEXTO: Si el cliente envia un mensaje corto afirmativo ("si", "dale", "asi es", "claro", "listo") o negativo ("no", "ahora no", "dejame pensarlo"), analiza los ultimos mensajes del bot para entender A QUE esta respondiendo el cliente:
    - Si el bot pregunto sobre compra/adquisicion ("deseas adquirirlo?", "te gustaria llevarlo?") y el cliente dice "si" → intent = quiero_comprar
    - Si el bot mostro un resumen/confirmacion y el cliente dice "si" → intent = confirmar
    - Si el bot ofrecio opciones de pack y el cliente dice "si" o "ese" → intent = seleccion_pack
    - Si el bot hizo una pregunta informativa y el cliente responde "si" → responde segun el contexto
    - Si el bot pregunto "Seria para la misma direccion?" y el cliente dice "si"/"dale"/"esa misma"/"correcto"/"a la misma" → intent = confirmar_direccion
    - Si el bot pregunto "Seria para la misma direccion?" y el cliente dice "no"/"otra"/"diferente" y da nueva direccion → intent = datos (with new address extracted)
    - Si el bot pregunto sobre municipio/ubicacion para tiempo de entrega ("en que municipio te encuentras?") y el cliente responde con un nombre de ciudad → intent = tiempo_entrega
    - Si no hay pregunta clara en los mensajes del bot → intent = acknowledgment`
        : ''

      return `Eres un analizador de mensajes para un agente de ventas de Somnio (suplemento natural para dormir).

    CONTEXTO DE RECOMPRA: Este cliente ya compro antes. Sus datos (nombre, direccion, etc.) ya estan precargados. No necesita capturar datos desde cero, solo confirmar o actualizar. Si el cliente da una direccion diferente a la precargada, extraela normalmente.

    PRODUCTO: Somnio — 90 comprimidos de melatonina + magnesio
    PRECIOS: 1 frasco (1x) = $77,900 | 2 frascos (2x) = $109,900 | 3 frascos (3x) = $139,900
    ENVIO: Gratis a nivel nacional via Interrapidisimo o Coordinadora
    PAGO: Contra entrega (pago al recibir)
    REGISTRO SANITARIO: Producto importado con Registro Sanitario FDA. Desarrollado por Laboratorio BDE NUTRITION LLC.

    Tu tarea: analizar el mensaje del cliente y extraer TODA la informacion estructurada.

    REGLAS DE EXTRACCION:
    - Solo extrae datos EXPLICITAMENTE presentes en el mensaje
    - Nunca inventes datos
    - Telefono: normalizar a formato 573XXXXXXXXX (si tiene 10 digitos, agregar 57)
    - Ciudad: normalizar a proper case (bogota -> Bogota)${crmSection}${dataSection}${botContextSection}`
    }
    ```

    **IMPORTANTE — preservar el texto original del prompt del analizador:**
    - NO reescribir el template de system-prompt principal. El contenido completo del `return \`...\`` viene del archivo actual — copiar LITERAL el texto existente (ver `comprehension-prompt.ts:34-50+` en el archivo actual) y solo agregar `${crmSection}` antes de `${dataSection}` en el string.
    - NO tocar el contenido del botContextSection (copiar byte-identical).
    - Si el archivo actual tiene mas lineas despues de las reglas de extraccion (por ejemplo INTENTS, SCHEMA, SALIDA JSON), preservarlas — esta tarea SOLO inyecta 2 cosas: `crmSection` variable y su concatenacion, y cambia `JSON.stringify(existingData, ...)` a `JSON.stringify(filteredData, ...)`.

    **Camino recomendado de edicion:**
    1. Leer el archivo entero primero (~100 lineas).
    2. Identificar la funcion `buildSystemPrompt` desde line 14 hasta el cierre `}`.
    3. Editar:
       - Agregar las 3 lineas `const crmContext / crmStatus / hasCrmContext`.
       - Agregar las 3 lineas `const filteredData = Object.fromEntries(...)`.
       - Cambiar `JSON.stringify(existingData, null, 2)` → `JSON.stringify(filteredData, null, 2)`.
       - Agregar `const crmSection = hasCrmContext ? ... : ''`.
       - En el return, antes de `${dataSection}` agregar `${crmSection}`.
    4. NO cambiar nada mas.

    Verify:
    ```bash
    npx tsc --noEmit 2>&1 | grep "comprehension-prompt" || echo "clean"
    ```
  </action>
  <verify>
    <automated>grep -q "_v3:crm_context" src/lib/agents/somnio-recompra/comprehension-prompt.ts</automated>
    <automated>grep -q "_v3:crm_context_status" src/lib/agents/somnio-recompra/comprehension-prompt.ts</automated>
    <automated>grep -q "## CONTEXTO CRM DEL CLIENTE (precargado)" src/lib/agents/somnio-recompra/comprehension-prompt.ts</automated>
    <automated>grep -q "Object.fromEntries" src/lib/agents/somnio-recompra/comprehension-prompt.ts</automated>
    <automated>grep -qE "filter\(\(\[k\]\)\s*=>\s*!k\.startsWith\('_v3:'\)\)" src/lib/agents/somnio-recompra/comprehension-prompt.ts</automated>
    <automated>grep -q "JSON.stringify(filteredData" src/lib/agents/somnio-recompra/comprehension-prompt.ts</automated>
    <automated>grep -q "hasCrmContext" src/lib/agents/somnio-recompra/comprehension-prompt.ts</automated>
    <automated>grep -q "NO reinventes datos" src/lib/agents/somnio-recompra/comprehension-prompt.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-p06t1.log; ! grep "comprehension-prompt" /tmp/tsc-p06t1.log | grep "error TS" || echo "clean"</automated>
  </verify>
  <acceptance_criteria>
    - `buildSystemPrompt` extrae 3 variables: `crmContext`, `crmStatus`, `hasCrmContext`.
    - `hasCrmContext` es `true` solo cuando `crmStatus === 'ok'` Y `crmContext != null` Y `crmContext.trim().length > 0`.
    - `filteredData` se construye via `Object.fromEntries(Object.entries(existingData).filter(([k]) => !k.startsWith('_v3:')))`.
    - `dataSection` usa `JSON.stringify(filteredData, ...)` (NO `existingData`).
    - `crmSection` contiene literal `## CONTEXTO CRM DEL CLIENTE (precargado)` cuando hasCrmContext, `''` caso contrario.
    - El template `return \`...\`` incluye `${crmSection}` ANTES de `${dataSection}`.
    - El resto del template (CONTEXTO DE RECOMPRA, PRODUCTO, PRECIOS, REGLAS DE EXTRACCION, botContextSection, etc.) queda IDENTICO al original.
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(somnio-recompra): inject CRM context section + filter _v3 keys in comprehension-prompt`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Unit test del comprehension-prompt extendido + push a Vercel</name>
  <read_first>
    - src/lib/agents/somnio-recompra/comprehension-prompt.ts (post Task 1 — validar shape del output)
    - src/lib/agents/somnio/__tests__/block-composer.test.ts (analog de pure-function test)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts`.

    **Contenido completo:**

    ```typescript
    import { describe, it, expect } from 'vitest'
    import { buildSystemPrompt } from '../comprehension-prompt'

    describe('buildSystemPrompt — CRM context injection (standalone: somnio-recompra-crm-reader)', () => {
      describe('when _v3:crm_context_status === "ok"', () => {
        it('injects the CRM section BEFORE "DATOS YA CAPTURADOS"', () => {
          const prompt = buildSystemPrompt({
            nombre: 'Jose',
            direccion: 'Cra 10 #20-30',
            '_v3:crm_context':
              'Ultimo pedido entregado: 2x Somnio el 2026-04-10. Tags: VIP. 3 pedidos totales.',
            '_v3:crm_context_status': 'ok',
          })

          expect(prompt).toContain('## CONTEXTO CRM DEL CLIENTE (precargado)')
          expect(prompt).toContain('Ultimo pedido entregado: 2x Somnio el 2026-04-10. Tags: VIP. 3 pedidos totales.')
          expect(prompt).toContain('NO reinventes datos')

          const crmIdx = prompt.indexOf('## CONTEXTO CRM DEL CLIENTE')
          const datosIdx = prompt.indexOf('DATOS YA CAPTURADOS')
          expect(crmIdx).toBeGreaterThan(-1)
          expect(datosIdx).toBeGreaterThan(-1)
          expect(crmIdx).toBeLessThan(datosIdx)
        })

        it('filters _v3: keys from the JSON dump of DATOS YA CAPTURADOS', () => {
          const prompt = buildSystemPrompt({
            nombre: 'Jose',
            direccion: 'Cra 10 #20-30',
            '_v3:crm_context': 'Ultimo pedido: 2x Somnio...',
            '_v3:crm_context_status': 'ok',
          })

          // The JSON dump must NOT include _v3: keys. They should only appear in the
          // CONTEXTO CRM section (the raw text, which contains "crm_context" as a word —
          // but the LITERAL key '"_v3:crm_context"' should not appear twice as a JSON field).
          const datosBlock = prompt.split('DATOS YA CAPTURADOS')[1] ?? ''
          expect(datosBlock).not.toContain('"_v3:crm_context"')
          expect(datosBlock).not.toContain('"_v3:crm_context_status"')
          // Sanity: normal keys must still appear.
          expect(datosBlock).toContain('"nombre"')
          expect(datosBlock).toContain('"direccion"')
        })

        it('filters multiple _v3: keys (not just the two we introduced)', () => {
          const prompt = buildSystemPrompt({
            nombre: 'Jose',
            '_v3:crm_context': 'context text',
            '_v3:crm_context_status': 'ok',
            '_v3:some_future_meta': 'should also be filtered',
            '_v3:accionesEjecutadas': '[]',
          })
          const datosBlock = prompt.split('DATOS YA CAPTURADOS')[1] ?? ''
          expect(datosBlock).not.toContain('_v3:')
          expect(datosBlock).toContain('"nombre"')
        })
      })

      describe('when _v3:crm_context_status is NOT "ok"', () => {
        it('does NOT inject CRM section when status === "empty"', () => {
          const prompt = buildSystemPrompt({
            nombre: 'Jose',
            '_v3:crm_context': '',
            '_v3:crm_context_status': 'empty',
          })
          expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
        })

        it('does NOT inject CRM section when status === "error"', () => {
          const prompt = buildSystemPrompt({
            nombre: 'Jose',
            '_v3:crm_context': '',
            '_v3:crm_context_status': 'error',
          })
          expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
        })

        it('does NOT inject CRM section when status is absent entirely', () => {
          const prompt = buildSystemPrompt({
            nombre: 'Jose',
            direccion: 'Cra 10 #20-30',
          })
          expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
          // Backward-compat: behavior identical to pre-Plan 06 state when flag=false.
          expect(prompt).toContain('DATOS YA CAPTURADOS')
          expect(prompt).toContain('"nombre"')
        })

        it('does NOT inject CRM section when context is empty string even with status=ok', () => {
          // Defensive: if a bad write produced status=ok + empty text, skip injection.
          const prompt = buildSystemPrompt({
            nombre: 'Jose',
            '_v3:crm_context': '',
            '_v3:crm_context_status': 'ok',
          })
          expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
        })

        it('does NOT inject CRM section when context is whitespace-only even with status=ok', () => {
          const prompt = buildSystemPrompt({
            nombre: 'Jose',
            '_v3:crm_context': '   \n  ',
            '_v3:crm_context_status': 'ok',
          })
          expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
        })
      })

      describe('edge cases', () => {
        it('empty existingData produces "DATOS YA CAPTURADOS: Ninguno aun." + no CRM section', () => {
          const prompt = buildSystemPrompt({})
          expect(prompt).toContain('DATOS YA CAPTURADOS: Ninguno aun.')
          expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
        })

        it('preserves botContextSection concatenation order (CRM + Datos + BotContext)', () => {
          const prompt = buildSystemPrompt(
            {
              nombre: 'Jose',
              '_v3:crm_context': 'contexto rico',
              '_v3:crm_context_status': 'ok',
            },
            ['Hola que tal?', 'Deseas llevarlo?'],
          )
          const crmIdx = prompt.indexOf('## CONTEXTO CRM DEL CLIENTE')
          const datosIdx = prompt.indexOf('DATOS YA CAPTURADOS')
          const botIdx = prompt.indexOf('ULTIMOS MENSAJES DEL BOT')
          expect(crmIdx).toBeGreaterThan(-1)
          expect(datosIdx).toBeGreaterThan(crmIdx)
          expect(botIdx).toBeGreaterThan(datosIdx)
        })
      })
    })
    ```

    Correr:
    ```bash
    npm run test -- src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts
    ```

    Expected: 10 tests PASS.

    **Paso 2 — Push a Vercel (Regla 1):**

    ```bash
    git push origin main
    ```

    Esto deploya Plans 05+06. Recordatorio:
    - Flag sigue en `false` (por migracion Plan 01). Ningun cambio observable en produccion.
    - La poll helper del Plan 05 no impacta comportamiento porque el flag=false hace que la Inngest function no corra, el poll retorna status=timeout, `crm_context_used` NO se emite, y el prompt (aqui) NO inyecta nada (status != 'ok').
    - El deploy es seguro y Regla 6 sigue intacta.

    Verificar que Vercel deploy salga verde.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts 2>&1 | tee /tmp/test-p06t2.log; grep -qE "(10 passed|Tests\\s+10 passed)" /tmp/test-p06t2.log</automated>
    <automated>git log --oneline -5</automated>
  </verify>
  <acceptance_criteria>
    - Archivo de test existe con >=10 tests organizados en 3 `describe` blocks (status=ok, status!=ok, edge cases).
    - Tests verifican: inyeccion + orden, filtrado 2 keys introducidas, filtrado multiples _v3:, no inyecta status empty/error/ausente, no inyecta texto vacio aunque status=ok, orden CRM→Datos→Bot.
    - `npm run test` sale con 10/10 passed.
    - Git log muestra el commit del test + el commit del edit.
    - `git push origin main` ejecutado — Vercel deploy visible.
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `test(somnio-recompra): add unit test for comprehension-prompt CRM context injection`.
    - Push a Vercel ejecutado.
    - Deploy "ready" en Vercel dashboard (optional visual confirmation by user).
  </done>
</task>

</tasks>

<verification>
- `buildSystemPrompt` inyecta seccion dedicada cuando status=ok, filtra _v3: del dataSection.
- Orden del prompt: intro → crmSection → dataSection → botContextSection.
- Cuando status != 'ok' (empty/error/ausente/texto vacio), NO inyecta — comportamiento identico al actual.
- 10 unit tests pasan.
- TypeScript clean.
- Push a Vercel ejecutado.
- Regla 6 preservada: flag=false sigue dando comportamiento byte-identical al pre-fase.
</verification>

<success_criteria>
- El pipeline tecnico COMPLETO esta codificado y deployado. Cuando el usuario active el flag (Plan 07):
  - Plan 04 dispatch dispara `recompra/preload-context`.
  - Plan 03 Inngest function llama al reader, escribe `_v3:crm_context` + `_v3:crm_context_status='ok'` al session state.
  - Plan 05 poll (turno 1+) lee el state, merge a `input.datosCapturados`, emit `crm_context_used`.
  - Plan 06 (este plan) ve `_v3:crm_context_status='ok'` en `existingData`, inyecta seccion dedicada al prompt del analizador Haiku.
  - Haiku analiza el mensaje del cliente CON contexto CRM rico → mejores intents + mejor comprehension.
- Regla 6: flag=false sigue haciendo que NINGUN paso anterior escriba/inyecte nada. Produccion byte-identical.
- Plan 07 queda listo para QA/activacion.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-crm-reader/06-SUMMARY.md` documenting:
- Commit hashes (2 commits: edit + test)
- Snippet post-edit de `buildSystemPrompt` (primeras 20 lineas, para referencia)
- Output de `npm run test -- comprehension-prompt.test.ts` (10/10 passed verbatim)
- Rango de commits pusheados a Vercel
- Deploy URL / hash confirmation
- Nota: "Pipeline tecnico COMPLETO. Plan 07 es doc update (D-17) + QA checkpoint (Regla 6 rollout gradual)"
</output>
