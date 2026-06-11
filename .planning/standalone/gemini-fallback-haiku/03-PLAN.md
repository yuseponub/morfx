---
phase: standalone
slug: gemini-fallback-haiku
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-v4/comprehension.ts
  - src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts
autonomous: true
requirements: [D-01, D-02, D-05, D-06, D-09]
user_setup: []

must_haves:
  truths:
    - "comprehend() intenta Gemini con maxRetries:0 + AbortSignal.timeout y cae a Haiku 4.5 ante saturacion"
    - "El branch Anthropic usa un schema saneado (sin min/max/int) porque Anthropic rechaza con 400 los keywords minimum/maximum (Pitfall #1)"
    - "El rango 0..1 de intent_confidence/secondary_confidence se valida en post-parse (parseAnalysis)"
    - "El re-throw diagnostico (Comprehension-v4 generateText) NO envuelve el closure gemini — el error de saturacion llega crudo al helper (Pitfall #5)"
    - "La firma publica comprehend(message, history, existingData, recentBotMessages) NO cambia"
  artifacts:
    - path: "src/lib/agents/somnio-v4/comprehension.ts"
      provides: "comprehension v4 con fallback Gemini→Haiku 4.5 + schema saneado para Anthropic"
      contains: "callWithGeminiFallback"
  key_links:
    - from: "src/lib/agents/somnio-v4/comprehension.ts"
      to: "src/lib/agents/somnio-v4/llm-fallback"
      via: "callWithGeminiFallback con callSite:'comprehension'"
      pattern: "callSite: 'comprehension'"
    - from: "src/lib/agents/somnio-v4/comprehension.ts"
      to: "MessageAnalysisSchema saneado"
      via: "schema sin min/max para el branch Anthropic (Pitfall #1)"
      pattern: "Sanitized"
---

<objective>
Wirear el fallback en `comprehension.ts` (callSite 'comprehension'). Este call-site es el unico con DOS complicaciones del RESEARCH: Pitfall #1 (Anthropic rechaza min/max → schema saneado) y Pitfall #5 (el re-throw diagnostico destruye la instancia APICallError → el closure gemini debe hacer el generateText limpio).

Purpose: comprehension es invocada SOLO por `somnio-v4-agent.ts` (RESEARCH Q8) → aislamiento Regla 6 automatico (v3/godentist/recompra/pw-confirmation tienen su propia comprehension). Plan separado por la complejidad del schema saneado. Paralelo con Plan 02 (sub-loop) y Plan 04 (vision) — files_modified disjuntos.
Output: comprehension.ts con fallback + schema saneado + 1 suite de paridad.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/gemini-fallback-haiku/RESEARCH.md
@.planning/standalone/gemini-fallback-haiku/PATTERNS.md

<interfaces>
<!-- VERBATIM de los archivos leidos. -->

`src/lib/agents/somnio-v4/comprehension.ts` (estado actual):
- `export async function comprehend(message: string, history: {role:'user'|'assistant';content:string}[], existingData: Record<string,string>, recentBotMessages: string[] = []): Promise<ComprehensionResult>`
- Hoy: `try { result = await runWithPurpose('comprehension', () => generateText({ model: google('gemini-2.5-flash'), system: buildSystemPrompt(existingData, recentBotMessages), messages, output: Output.object({ schema: MessageAnalysisSchema }), providerOptions: { google: { safetySettings:[...] } } })) } catch (genErr) { ...re-throw new Error("[Comprehension-v4 generateText] ...") }`
- Luego: `parsedOutput = result.output as MessageAnalysis` → `analysis = parseAnalysis(JSON.stringify(parsedOutput))` → emite `comprehension_completed` → return.
- `parseAnalysis(rawText)` ya tiene sanitizacion resiliente (strict parse → sanitize intents fuera de enum → re-parse → throw con issues). Lineas 169-203.

`src/lib/agents/somnio-v4/comprehension-schema.ts`:
- `MessageAnalysisSchema = z.object({ intent: z.object({ ..., confidence: z.number(), intent_confidence: z.number().min(0).max(1), intent_confidence_reasoning: z.string().optional(), secondary_confidence: z.number().min(0).max(1).nullable(), secondary_confidence_reasoning: z.string().nullable(), secondary_query: z.string().nullable() }), extracted_fields: {...}, classification: {...}, negations: {...} })`
- **Pitfall #1 ACTIVO:** `intent_confidence` y `secondary_confidence` usan `.min(0).max(1)` → Anthropic devuelve 400.

De `src/lib/agents/somnio-v4/llm-fallback` (Plan 01): `callWithGeminiFallback<T>`, `CallSite`.
De `@ai-sdk/anthropic`: `anthropic('claude-haiku-4-5')`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema saneado + wiring de comprehend con fallback (Pitfall #1 + #5)</name>
  <read_first>
    - src/lib/agents/somnio-v4/comprehension.ts (archivo a modificar — completo; ojo lineas 82-120 re-throw diagnostico + 169-203 parseAnalysis)
    - src/lib/agents/somnio-v4/comprehension-schema.ts (MessageAnalysisSchema — ubicacion exacta de .min(0).max(1))
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Pitfall #1 + #5
    - .planning/standalone/gemini-fallback-haiku/PATTERNS.md seccion comprehension.ts
  </read_first>
  <action>
**Paso A — schema saneado para el branch Anthropic** (Pitfall #1). En `comprehension.ts` (NO modificar `comprehension-schema.ts` — D-25 lo lockea), crear una version saneada local del schema sin min/max:
```typescript
import { MessageAnalysisSchema, type MessageAnalysis } from './comprehension-schema'
import { z } from 'zod'

// Pitfall #1 (RESEARCH): Anthropic via AI SDK devuelve 400 si el JSON Schema lleva
// minimum/maximum/exclusiveMinimum (issues vercel/ai #14342, #13355). MessageAnalysisSchema
// usa z.number().min(0).max(1) en intent_confidence/secondary_confidence → el branch
// Anthropic DEBE usar un schema sin esos bounds. El rango 0..1 se valida en post-parse.
// Gemini ignora los keywords → su branch usa MessageAnalysisSchema intacto.
const MessageAnalysisSchemaSanitized = MessageAnalysisSchema.extend({
  intent: MessageAnalysisSchema.shape.intent.extend({
    intent_confidence: z.number().describe('0..1 self-reported confidence'),
    secondary_confidence: z.number().nullable().describe('0..1 o null'),
  }),
})
```
(Verificar que `MessageAnalysisSchema.shape.intent` es accesible — es un `z.object`, `.shape` expone los sub-schemas. Si `.extend` sobre el sub-object da fricción de tipos, reconstruir el intent object explicitamente sin min/max copiando los demas campos verbatim.)

**Paso B — wiring con Pitfall #5.** El re-throw diagnostico (`new Error("[Comprehension-v4 generateText] ...")`) debe quedar FUERA del closure gemini. El closure gemini hace el `generateText` LIMPIO (sin try/catch interno) para que un error de saturacion llegue como `APICallError` crudo al helper. Reestructurar:

```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { callWithGeminiFallback } from './llm-fallback'

// ...dentro de comprehend, reemplazar el bloque try/catch de generateText:
let result: Awaited<ReturnType<typeof generateText>>
try {
  result = await callWithGeminiFallback({
    callSite: 'comprehension',
    gemini: (signal) =>
      runWithPurpose('comprehension', () =>
        generateText({
          model: google('gemini-2.5-flash'),
          maxRetries: 0,        // D-05
          abortSignal: signal,  // D-06
          system: buildSystemPrompt(existingData, recentBotMessages),
          messages,
          output: Output.object({ schema: MessageAnalysisSchema }),
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
        })
      ),
    anthropic: () =>
      runWithPurpose('comprehension', () =>
        generateText({
          model: anthropic('claude-haiku-4-5'), // D-02
          system: buildSystemPrompt(existingData, recentBotMessages),
          messages,
          output: Output.object({ schema: MessageAnalysisSchemaSanitized }), // Pitfall #1
          // SIN providerOptions.google — Pitfall #7
        })
      ),
  })
} catch (genErr) {
  // El re-throw diagnostico se preserva SOLO para errores NO-saturacion (parse/schema)
  // y para el caso de doble fallo (el helper ya emitio fallback_failed). Cuerpo VERBATIM
  // del catch actual (lineas 102-120).
  const e = genErr as Record<string, unknown>
  // ... (cuerpo del catch existente, sin cambios)
  throw new Error(`[Comprehension-v4 generateText] ...`)
}
```

**Paso C — post-parse del rango 0..1.** En `parseAnalysis` (o justo despues del strict parse), agregar clamp/validacion para el branch Anthropic que pudo devolver valores fuera de 0..1 (el schema saneado no los acota). El `parseAnalysis` ya re-parsea contra `MessageAnalysisSchema` (que SI tiene min/max) en el paso strict → si el valor saneado de Anthropic viene en rango, pasa; si viene fuera de rango (improbable, el modelo auto-reporta confidence), el clamp lo corrige. Agregar antes del strict parse en parseAnalysis:
```typescript
// Branch Anthropic uso schema saneado (sin min/max) → clamp 0..1 defensivo (Pitfall #1).
const intentObj = (raw.intent as Record<string, unknown>) | undefined
if (intentObj && typeof intentObj.intent_confidence === 'number') {
  intentObj.intent_confidence = Math.max(0, Math.min(1, intentObj.intent_confidence as number))
}
if (intentObj && typeof intentObj.secondary_confidence === 'number') {
  intentObj.secondary_confidence = Math.max(0, Math.min(1, intentObj.secondary_confidence as number))
}
```
(Ajustar la sintaxis — `| undefined` es typo; usar `as Record<string,unknown> | undefined`.)

La firma `comprehend(...)` NO cambia. El emit de `comprehension_completed` y el `return { analysis, tokensUsed }` quedan intactos.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "callSite: 'comprehension'" src/lib/agents/somnio-v4/comprehension.ts` == 1
    - `grep -c "anthropic('claude-haiku-4-5')" src/lib/agents/somnio-v4/comprehension.ts` == 1
    - `grep -c "MessageAnalysisSchemaSanitized" src/lib/agents/somnio-v4/comprehension.ts` >= 2 (definicion + uso en branch anthropic)
    - `grep -c "maxRetries: 0" src/lib/agents/somnio-v4/comprehension.ts` == 1
    - `grep -c "abortSignal: signal" src/lib/agents/somnio-v4/comprehension.ts` == 1
    - `grep -c "claude-client" src/lib/agents/somnio-v4/comprehension.ts` == 0
    - El re-throw diagnostico se preserva: `grep -c "\[Comprehension-v4 generateText\]" src/lib/agents/somnio-v4/comprehension.ts` >= 1
    - El branch anthropic usa el schema saneado: `grep -A8 "anthropic: () =>" comprehension.ts | grep -c "MessageAnalysisSchemaSanitized"` == 1
    - El branch gemini usa el schema original: `grep -A12 "gemini: (signal) =>" comprehension.ts | grep -c "schema: MessageAnalysisSchema }"` == 1
    - `grep -c "export async function comprehend(" src/lib/agents/somnio-v4/comprehension.ts` == 1 (firma intacta)
    - `comprehension-schema.ts` NO modificado: `git diff --stat src/lib/agents/somnio-v4/comprehension-schema.ts` vacio (D-25)
    - `npx tsc --noEmit` sin errores nuevos en comprehension.ts
  </acceptance_criteria>
  <done>comprehend usa callWithGeminiFallback; branch gemini con schema original + safetySettings + maxRetries:0; branch anthropic con schema saneado sin min/max y sin providerOptions; re-throw diagnostico fuera del closure gemini; clamp 0..1 post-parse; comprehension-schema.ts intacto.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Suite de paridad comprehension (schema saneado + no-fallback en parse error)</name>
  <read_first>
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Q9 test 3 + test 5
    - src/lib/agents/somnio-v4/comprehension.ts (post-Task 1)
    - src/lib/agents/somnio-v4/comprehension-schema.ts (shape para construir el mock)
    - src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts (patron skipIf E2E existente — referencia, NO copiar el E2E real)
  </read_first>
  <behavior>
    - El schema saneado para Anthropic NO contiene min/max: assert via JSON Schema introspection o validando que un objeto con intent_confidence=0.9 parsea
    - Paridad: un MessageAnalysis valido pasa MessageAnalysisSchema.parse (gemini) Y MessageAnalysisSchemaSanitized.parse (anthropic) con el mismo shape
    - clamp 0..1: si Anthropic devuelve intent_confidence=1.5, parseAnalysis lo clampa a 1.0 antes del strict parse contra MessageAnalysisSchema (que tiene max(1))
  </behavior>
  <action>
Crear `src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts`. Tests deterministas (sin LLM real):

1. **Schema saneado sin bounds:** importar el schema saneado si se exporta, o testear via `comprehend` con mocks. Mas simple: testear el clamp directamente — construir un raw object con `intent.intent_confidence = 1.5` y `secondary_confidence = -0.3`, pasar por la logica de clamp + `MessageAnalysisSchema.safeParse` → assert success con valores clampados a 1.0 y 0.0. (Si el clamp vive inline en parseAnalysis y parseAnalysis no se exporta, exportarla o extraer una funcion `clampConfidence(raw)` exportada para testear — minimal change.)

2. **Paridad de shape:** construir un `MessageAnalysis` completo valido → assert `MessageAnalysisSchema.parse(obj)` no lanza (branch gemini) Y la version sin min/max tambien lo acepta (branch anthropic produce el mismo shape).

3. **No-fallback en parse error** (Pitfall #4 — ya cubierto en index.test.ts del Plan 01, aqui un check de integracion): mockear `@ai-sdk/google` para que `comprehend` reciba un `NoObjectGeneratedError` → assert que el error se propaga (re-throw diagnostico) y que `@ai-sdk/anthropic` NO fue invocado. Usar `vi.mock` de los providers o, si el setup es complejo, dejar este caso cubierto por index.test.ts (Plan 01) y documentarlo.

`__resetBreakers()` en afterEach.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` → PASS
    - El test cubre el clamp 0..1: `grep -c "1.5\|clamp\|Math.min" src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` >= 1
    - El test asserta MessageAnalysisSchema.parse: `grep -c "MessageAnalysisSchema" src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` >= 1
    - `grep -c "__resetBreakers" src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` >= 1
  </acceptance_criteria>
  <done>Suite verde: schema saneado acepta confidences 0..1; clamp corrige valores fuera de rango; paridad de shape verificada.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Anthropic structured output → comprehension pipeline | El schema saneado (sin bounds) permite valores fuera de 0..1; el clamp post-parse es el guard |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-05 | Tampering | intent_confidence fuera de rango desde branch Anthropic | mitigate | Clamp 0..1 en parseAnalysis antes del strict parse contra MessageAnalysisSchema (que conserva min/max); test asserta el clamp |
| T-fb-06 | Repudiation | error de saturacion enmascarado por re-throw diagnostico | mitigate | Pitfall #5: el closure gemini hace generateText limpio → APICallError crudo llega al helper; el re-throw diagnostico solo envuelve errores NO-saturacion |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` verde.
- `git diff --stat src/lib/agents/somnio-v4/comprehension-schema.ts` vacio (D-25 — schema original intacto).
- `npx tsc --noEmit` sin errores nuevos.
- Firma `comprehend(...)` intacta (consumidor unico: somnio-v4-agent.ts).
</verification>

<success_criteria>
- comprehension.ts con fallback Gemini→Haiku 4.5.
- Schema saneado (sin min/max) SOLO para el branch Anthropic; schema original para Gemini.
- Clamp 0..1 post-parse defensivo.
- Re-throw diagnostico fuera del closure gemini (Pitfall #5).
- comprehension-schema.ts byte-identico (D-25).
</success_criteria>

<output>
After completion, create `.planning/standalone/gemini-fallback-haiku/03-SUMMARY.md`
</output>
