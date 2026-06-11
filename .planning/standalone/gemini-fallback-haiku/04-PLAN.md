---
phase: standalone
slug: gemini-fallback-haiku
plan: 04
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/media/image-classifier.ts
  - src/lib/agents/media/__tests__/image-classifier-fallback.test.ts
autonomous: true
requirements: [D-01, D-02, D-03, D-05, D-06, D-09]
user_setup: []

must_haves:
  truths:
    - "classifyImage intenta Gemini Vision con maxRetries:0 + AbortSignal.timeout y cae a Haiku 4.5 con vision (D-03) ante saturacion"
    - "El branch Anthropic recibe el MISMO content (image part + text part) sin providerOptions.google (Pitfall #7)"
    - "El fail-safe handoff (categoria:ambiguo, decision:handoff) queda como ULTIMO recurso si AMBOS providers fallan (D-03/D-07) — el cliente no recibe handoff innecesario por una sola saturacion de Gemini"
    - "La firma publica classifyImage(imageUrl, mimeType, caption?) NO cambia"
  artifacts:
    - path: "src/lib/agents/media/image-classifier.ts"
      provides: "vision classifier con fallback Gemini→Haiku 4.5 con vision"
      contains: "callWithGeminiFallback"
  key_links:
    - from: "src/lib/agents/media/image-classifier.ts"
      to: "src/lib/agents/somnio-v4/llm-fallback"
      via: "callWithGeminiFallback con callSite:'vision'"
      pattern: "callSite: 'vision'"
---

<objective>
Wirear el fallback en `image-classifier.ts` (callSite 'vision'). El schema usa enums/strings → Pitfall #1 NO aplica. Pero hay dos particularidades: (a) el archivo vive en `src/lib/agents/media/` no en `somnio-v4/` → import path relativo distinto; (b) usa `rawResult.experimental_output` en vez de `safeAccessOutput` → migrar a `safeAccessOutput` para paridad (Pitfall #11); (c) el fail-safe handoff existente (D-07) debe quedar como ultimo recurso DESPUES del fallback Anthropic, no antes.

Purpose: La vision es v4-gated (media-gate). El fallback a Haiku 4.5 con vision (D-03) evita handoffs innecesarios cuando Gemini se satura. Paralelo con Plan 02 (sub-loop) y Plan 03 (comprehension) — files_modified disjuntos.
Output: image-classifier.ts con fallback + safeAccessOutput + 1 suite.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/gemini-fallback-haiku/RESEARCH.md
@.planning/standalone/gemini-fallback-haiku/PATTERNS.md

<interfaces>
<!-- VERBATIM del archivo leido. -->

`src/lib/agents/media/image-classifier.ts` (estado actual):
- `export async function classifyImage(imageUrl: string, mimeType: string, caption?: string): Promise<ImageClassification>`
- `ClassificationSchema = z.object({ categoria: z.enum([6 valores]), descripcion: z.string() })` — enum/string, SIN min/max → Pitfall #1 NO aplica.
- `FAIL_SAFE: ImageClassification = { categoria:'ambiguo', descripcion:'', decision:'handoff' }`
- Estructura actual: `try { base64 = fetchAsBase64(url); rawResult = await generateText({ model: google('gemini-2.5-flash'), messages:[{role:'user', content:[{type:'image', image:base64Data, mediaType:mimeType},{type:'text', text:promptText}]}], output: Output.object({ schema: ClassificationSchema }), providerOptions:{google:{safetySettings:[...]}} }); const output = rawResult.experimental_output as ...; if(!output||...) return FAIL_SAFE; ... return { categoria, descripcion, decision } } catch(err) { return FAIL_SAFE }`
- `computeDecision(categoria)`: 'producto'|'pagina' → 'responder'; else 'handoff' (Pitfall 4 — derivado en codigo, NUNCA del LLM).

De `src/lib/agents/somnio-v4/llm-fallback` (Plan 01): `callWithGeminiFallback<T>`, `CallSite`. Import path desde media/: `../somnio-v4/llm-fallback`.
De `src/lib/agents/somnio-v4/sub-loop/safe-output`: `safeAccessOutput(result, schema)`. Import path desde media/: `../somnio-v4/sub-loop/safe-output`.
De `@ai-sdk/anthropic`: `anthropic('claude-haiku-4-5')` (Haiku 4.5 tiene vision — RESEARCH Q3/D-03).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wirear classifyImage con fallback + migrar a safeAccessOutput (Pitfall #11)</name>
  <read_first>
    - src/lib/agents/media/image-classifier.ts (archivo a modificar — completo)
    - src/lib/agents/somnio-v4/sub-loop/safe-output.ts (safeAccessOutput a reusar)
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Pitfall #11 + Q2 (vision parity, Assumption A1) + Q3 (Haiku 4.5 tiene vision)
    - .planning/standalone/gemini-fallback-haiku/PATTERNS.md seccion image-classifier.ts
  </read_first>
  <action>
Agregar imports (OJO el path relativo desde `media/`):
```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { callWithGeminiFallback } from '../somnio-v4/llm-fallback'
import { safeAccessOutput } from '../somnio-v4/sub-loop/safe-output'
```

Reestructurar el cuerpo de `classifyImage`. El `try/catch` externo (fail-safe D-07) PERMANECE como ultimo recurso. Dentro del try, factorizar el `content` (image part + text part) a una const y construir ambos closures:

```typescript
try {
  const base64Data = await fetchAsBase64(imageUrl)
  const promptText = caption
    ? `${CLASSIFICATION_PROMPT}\n\nTexto del cliente junto a la imagen: "${caption}"`
    : CLASSIFICATION_PROMPT

  // MISMO content para ambos providers — AI SDK normaliza el image part por provider (A1).
  const visionContent = [
    { type: 'image' as const, image: base64Data, mediaType: mimeType },
    { type: 'text' as const, text: promptText },
  ]

  const rawResult = await callWithGeminiFallback({
    callSite: 'vision',
    gemini: (signal) =>
      generateText({
        model: google('gemini-2.5-flash'),
        maxRetries: 0,        // D-05
        abortSignal: signal,  // D-06
        messages: [{ role: 'user', content: visionContent }],
        output: Output.object({ schema: ClassificationSchema }),
        providerOptions: {
          google: {
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          },
        },
      }),
    anthropic: () =>
      generateText({
        model: anthropic('claude-haiku-4-5'), // D-02/D-03 — Haiku 4.5 con vision
        messages: [{ role: 'user', content: visionContent }],
        output: Output.object({ schema: ClassificationSchema }),
        // SIN providerOptions.google — Pitfall #7
      }),
  })

  // Pitfall #11: migrar de rawResult.experimental_output a safeAccessOutput para paridad
  // entre providers (experimental_output puede no existir igual con Anthropic).
  let output: z.infer<typeof ClassificationSchema>
  try {
    output = safeAccessOutput(rawResult, ClassificationSchema)
  } catch {
    console.warn('[image-classifier] Unexpected output shape — using fail-safe')
    return FAIL_SAFE
  }
  if (!output || typeof output.categoria !== 'string') {
    console.warn('[image-classifier] Unexpected output shape from vision — using fail-safe')
    return FAIL_SAFE
  }

  const categoria = output.categoria as ImageCategoria
  const descripcion = typeof output.descripcion === 'string' ? output.descripcion : ''
  const decision = computeDecision(categoria) // Pitfall 4 — derivado en codigo
  return { categoria, descripcion, decision }
} catch (err) {
  // D-07: ULTIMO recurso — cualquier fallo (fetch, AMBOS providers caidos, parse) → handoff.
  // El fallback Anthropic ya se intento dentro de callWithGeminiFallback; si tambien fallo,
  // el helper emitio fallback_failed y propago → aterriza aqui (D-03: handoff solo si AMBOS caen).
  console.warn('[image-classifier] Classification failed — using fail-safe handoff:', err)
  return FAIL_SAFE
}
```

NOTA: el `z` ya esta importado en el archivo (linea 19). Verificar que `safeAccessOutput` no rompe con el shape de Anthropic; si `experimental_output` era load-bearing por algun motivo, el fallback documentado es mantener `experimental_output` para gemini y `result.output` para anthropic — pero `safeAccessOutput` (que lee `.output` con fallback a `.text` parse) es el camino recomendado (Pitfall #11) y unifica ambos.

La firma `classifyImage(imageUrl, mimeType, caption?)` NO cambia.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/media/__tests__/image-classifier-fallback.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "callSite: 'vision'" src/lib/agents/media/image-classifier.ts` == 1
    - `grep -c "from '../somnio-v4/llm-fallback'" src/lib/agents/media/image-classifier.ts` == 1
    - `grep -c "anthropic('claude-haiku-4-5')" src/lib/agents/media/image-classifier.ts` == 1
    - `grep -c "maxRetries: 0" src/lib/agents/media/image-classifier.ts` == 1
    - `grep -c "abortSignal: signal" src/lib/agents/media/image-classifier.ts` == 1
    - `grep -c "safeAccessOutput" src/lib/agents/media/image-classifier.ts` >= 1 (Pitfall #11 migrado)
    - `grep -c "experimental_output" src/lib/agents/media/image-classifier.ts` == 0 (migrado fuera)
    - `grep -c "claude-client" src/lib/agents/media/image-classifier.ts` == 0
    - El fail-safe se preserva: `grep -c "return FAIL_SAFE" src/lib/agents/media/image-classifier.ts` >= 2 (handoff de ultimo recurso)
    - `grep -c "export async function classifyImage(" src/lib/agents/media/image-classifier.ts` == 1 (firma intacta)
    - El branch anthropic NO lleva providerOptions: `grep -A6 "anthropic: () =>" image-classifier.ts | grep -c "providerOptions"` == 0
    - `npx tsc --noEmit` sin errores nuevos en image-classifier.ts
  </acceptance_criteria>
  <done>classifyImage usa callWithGeminiFallback callSite 'vision'; gemini con maxRetries:0+abortSignal+safetySettings; anthropic con Haiku 4.5 vision sin providerOptions; experimental_output migrado a safeAccessOutput; fail-safe handoff de ultimo recurso preservado; firma intacta.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Suite de fallback vision (fail-safe solo si ambos caen)</name>
  <read_first>
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Q9 + Pitfall #8 (doble fallo)
    - src/lib/agents/media/image-classifier.ts (post-Task 1)
    - src/lib/agents/media/__tests__/media-gate-v4.test.ts (patron de test de media existente — referencia de mocking)
  </read_first>
  <behavior>
    - Saturacion en gemini → fallback a anthropic → si anthropic clasifica OK, classifyImage devuelve la categoria de Anthropic (NO fail-safe handoff)
    - Doble fallo (gemini saturado + anthropic falla) → fail-safe handoff { categoria:'ambiguo', decision:'handoff' }
    - decision SIEMPRE derivada en codigo de categoria (Pitfall 4) — incluso desde el branch Anthropic
  </behavior>
  <action>
Crear `src/lib/agents/media/__tests__/image-classifier-fallback.test.ts`. Tests deterministas.

Mockear `@ai-sdk/google` y `@ai-sdk/anthropic` con factories que devuelven modelos cuyo `doGenerate` se controla por test (o mockear `generateText` de `ai` via vi.mock). Y mockear `global.fetch` para `fetchAsBase64` (devolver un ArrayBuffer dummy con `res.ok=true`).

Casos:
1. **Saturacion → fallback OK:** google model arroja `APICallError(503,'high demand')`; anthropic model resuelve output `{ categoria:'producto', descripcion:'frasco' }` → `classifyImage(url, 'image/jpeg')` devuelve `{ categoria:'producto', descripcion:'frasco', decision:'responder' }` (decision derivada en codigo). Assert que NO es el FAIL_SAFE.
2. **Doble fallo → fail-safe:** google arroja 503; anthropic arroja Error → `classifyImage` devuelve `{ categoria:'ambiguo', descripcion:'', decision:'handoff' }` (FAIL_SAFE).
3. **Happy path:** google resuelve `{ categoria:'pagina', descripcion:'web' }` → decision='responder', anthropic NUNCA invocado.

`__resetBreakers()` en afterEach. Si el mocking de los providers inline resulta complejo, una alternativa valida: extraer la verificacion del flujo de decision (fallback OK vs doble fallo→fail-safe) probando que classifyImage NO retorna FAIL_SAFE cuando el segundo provider responde — el punto critico es D-03 (handoff solo si AMBOS caen).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/media/__tests__/image-classifier-fallback.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/media/__tests__/image-classifier-fallback.test.ts` → PASS
    - El test cubre fallback-OK (NO fail-safe) y doble-fallo (fail-safe): `grep -c "ambiguo\|handoff\|producto\|pagina" image-classifier-fallback.test.ts` >= 2
    - `grep -c "503\|high demand" src/lib/agents/media/__tests__/image-classifier-fallback.test.ts` >= 1
    - `grep -c "__resetBreakers" src/lib/agents/media/__tests__/image-classifier-fallback.test.ts` >= 1
  </acceptance_criteria>
  <done>Suite verde: saturacion→fallback Anthropic devuelve clasificacion real (no handoff); doble fallo→fail-safe handoff; decision derivada en codigo.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Imagen del cliente → vision model | base64 de imagen cruza a ambos providers; mismo shape de content |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-07 | Tampering | decision derivada del LLM | mitigate | computeDecision SIEMPRE deriva en codigo de categoria (Pitfall 4 preservado); el branch Anthropic no introduce decision desde el modelo |
| T-fb-08 | Denial of Service | imagen grande / fetch lento | accept | fetchAsBase64 + AbortSignal.timeout(15s) acotan; fail-safe handoff garantiza respuesta acotada ante cualquier fallo |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/media/` verde (incluye image-classifier-fallback + media-gate-v4 existente).
- `npx tsc --noEmit` sin errores nuevos.
- Firma `classifyImage` intacta (consumidores: media/index.ts, media-gate.ts).
</verification>

<success_criteria>
- image-classifier.ts con fallback Gemini→Haiku 4.5 con vision (D-03).
- experimental_output migrado a safeAccessOutput (Pitfall #11).
- Branch Anthropic sin providerOptions.google.
- Fail-safe handoff SOLO como ultimo recurso (cliente no recibe handoff por una saturacion).
</success_criteria>

<output>
After completion, create `.planning/standalone/gemini-fallback-haiku/04-SUMMARY.md`
</output>
