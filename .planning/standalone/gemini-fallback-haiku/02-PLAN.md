---
phase: standalone
slug: gemini-fallback-haiku
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/generation-call.ts
  - src/lib/agents/somnio-v4/sub-loop/compliance-check.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts
autonomous: true
requirements: [D-01, D-02, D-05, D-06, D-09]
user_setup: []

must_haves:
  truths:
    - "runGenerationCall y checkCompliance intentan Gemini con maxRetries:0 + AbortSignal.timeout y caen a Haiku 4.5 (via @ai-sdk/anthropic directo) ante saturacion, transparente al resto del pipeline"
    - "El branch Anthropic produce el MISMO shape de salida (GenerationOutputSchema / ComplianceCheckSchema) que Gemini — el resto del pipeline no se entera del provider"
    - "El branch Anthropic NO envia providerOptions.google.safetySettings (Pitfall #7)"
    - "Las firmas publicas runGenerationCall(args) y checkCompliance(args) NO cambian — consumidores intactos"
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/generation-call.ts"
      provides: "generation RAG con fallback Gemini→Haiku 4.5"
      contains: "callWithGeminiFallback"
    - path: "src/lib/agents/somnio-v4/sub-loop/compliance-check.ts"
      provides: "compliance check con fallback Gemini→Haiku 4.5"
      contains: "callWithGeminiFallback"
  key_links:
    - from: "src/lib/agents/somnio-v4/sub-loop/generation-call.ts"
      to: "src/lib/agents/somnio-v4/llm-fallback"
      via: "callWithGeminiFallback con callSite:'generation'"
      pattern: "callSite: 'generation'"
    - from: "src/lib/agents/somnio-v4/sub-loop/compliance-check.ts"
      to: "src/lib/agents/somnio-v4/llm-fallback"
      via: "callWithGeminiFallback con callSite:'compliance'"
      pattern: "callSite: 'compliance'"
---

<objective>
Wirear el fallback en los 2 call-sites del sub-loop: `generation-call.ts` (callSite 'generation') y `compliance-check.ts` (callSite 'compliance'). Ambos usan `Output.object` con schemas sin min/max (no aplica Pitfall #1) → wiring directo.

Purpose: El generador RAG es el call-site mas critico (redacta la respuesta al cliente); el compliance check es el verifier. Ambos comparten patron identico → un plan. Paralelo con Plan 03 (comprehension) y Plan 04 (vision) — files_modified disjuntos.
Output: 2 call-sites con fallback + 1 suite de paridad (MockLanguageModelV3).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/gemini-fallback-haiku/RESEARCH.md
@.planning/standalone/gemini-fallback-haiku/PATTERNS.md

<interfaces>
<!-- Firmas y schemas VERBATIM de los archivos a modificar (leidos). -->

`src/lib/agents/somnio-v4/sub-loop/generation-call.ts` (estado actual):
- `export const GenerationOutputSchema = z.object({ responseText: z.string(), responseConfidence: z.number(), confidenceRationale: z.string(), binary: z.enum(['RESPONDE_BIEN','FALTA_INFO','FUERA_SCOPE']) })` — todos number()/string()/enum, SIN min/max → Pitfall #1 NO aplica.
- `export async function runGenerationCall(args: { systemPrompt: string; userMessage: string; recentMessages: Array<{role:'user'|'assistant';content:string}> }): Promise<GenerationCallResult>`
- Hoy: `const rawResult = await runWithPurpose('subloop_generation', () => generateText({ model: google('gemini-2.5-flash'), system, messages, temperature: 0.3, output: Output.object({ schema: GenerationOutputSchema }), providerOptions: { google: { safetySettings: [...4 BLOCK_NONE...] } } }))` luego `safeAccessOutput(rawResult, GenerationOutputSchema)`.

`src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` (estado actual):
- `export const ComplianceCheckSchema = z.object({ violatesNuncaDecir: z.boolean(), violatedRule: z.string().optional(), shouldEscalate: z.boolean(), matchedTrigger: z.string().optional() })` — booleans/strings, SIN min/max → Pitfall #1 NO aplica.
- `export async function checkCompliance(args: { userMessage; candidateText; nuncaDecirRules: string[]; cuandoEscalar: string[] }): Promise<ComplianceCheckResult>`
- Early-return cuando ambos arrays vacios (NO toca LLM — preservar).
- Hoy: `const { output } = await runWithPurpose('subloop_compliance', () => generateText({ model: google('gemini-2.5-flash'), system, messages, output: Output.object({ schema: ComplianceCheckSchema }), providerOptions: { google: { safetySettings: [...] } } }))` — desestructura `{ output }` directo del result.

De `src/lib/agents/somnio-v4/llm-fallback` (Plan 01): `callWithGeminiFallback<T>({ callSite, gemini, anthropic })`, `CallSite`.
De `@ai-sdk/anthropic`: `anthropic('claude-haiku-4-5')` — patron probado en `somnio-pw-confirmation/comprehension.ts:88`.
De `ai/test`: `MockLanguageModelV3`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wirear generation-call.ts (callSite 'generation')</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/generation-call.ts (archivo a modificar — completo)
    - src/lib/agents/somnio-v4/sub-loop/safe-output.ts (safeAccessOutput — se reusa para ambos branches)
    - .planning/standalone/gemini-fallback-haiku/PATTERNS.md seccion generation-call.ts
    - src/lib/agents/somnio-pw-confirmation/comprehension.ts (referencia anthropic('claude-haiku-4-5') en prod)
  </read_first>
  <action>
Modificar `runGenerationCall` para envolver la llamada con `callWithGeminiFallback`. La firma publica NO cambia.

Agregar imports:
```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { callWithGeminiFallback } from '../llm-fallback'
```

Reemplazar el bloque `const rawResult = await runWithPurpose(...)` por:
```typescript
const rawResult = await callWithGeminiFallback({
  callSite: 'generation',
  gemini: (signal) =>
    runWithPurpose('subloop_generation', () =>
      generateText({
        model: google('gemini-2.5-flash'),
        maxRetries: 0,          // D-05 — N=1, error crudo (Pitfall #2)
        abortSignal: signal,    // D-06 — timeout guard
        system: args.systemPrompt,
        messages: [
          ...args.recentMessages.slice(-4),
          { role: 'user' as const, content: args.userMessage },
        ],
        temperature: 0.3, // D-10
        output: Output.object({ schema: GenerationOutputSchema }),
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
    runWithPurpose('subloop_generation', () =>
      generateText({
        model: anthropic('claude-haiku-4-5'), // D-02 — via @ai-sdk/anthropic, NO claude-client.ts
        // MISMO prompt + MISMO schema — paridad D-09
        system: args.systemPrompt,
        messages: [
          ...args.recentMessages.slice(-4),
          { role: 'user' as const, content: args.userMessage },
        ],
        temperature: 0.3,
        output: Output.object({ schema: GenerationOutputSchema }),
        // SIN providerOptions.google — Pitfall #7 (safetySettings es google-only)
      })
    ),
})
```
El `safeAccessOutput(rawResult, GenerationOutputSchema)` posterior queda intacto (funciona con ambos providers). `latencyMs` se sigue calculando con `performance.now() - t0` envolviendo el `callWithGeminiFallback`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "callSite: 'generation'" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1
    - `grep -c "from '@ai-sdk/anthropic'" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1
    - `grep -c "anthropic('claude-haiku-4-5')" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1
    - `grep -c "maxRetries: 0" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1
    - `grep -c "abortSignal: signal" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1
    - `grep -c "claude-client" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 0 (Pitfall #10)
    - El branch anthropic NO lleva providerOptions: en el closure anthropic `grep -A20 "anthropic: () =>" generation-call.ts | grep -c "providerOptions"` == 0
    - `grep -c "export async function runGenerationCall(args: {" src/lib/agents/somnio-v4/sub-loop/generation-call.ts` == 1 (firma intacta)
    - `npx tsc --noEmit` sin errores nuevos en generation-call.ts
  </acceptance_criteria>
  <done>runGenerationCall envuelve con callWithGeminiFallback; gemini con maxRetries:0+abortSignal+safetySettings; anthropic con Haiku 4.5 sin providerOptions; firma intacta.</done>
</task>

<task type="auto">
  <name>Task 2: Wirear compliance-check.ts (callSite 'compliance')</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/compliance-check.ts (archivo a modificar — completo, ojo el early-return y la desestructuracion `{ output }`)
    - .planning/standalone/gemini-fallback-haiku/PATTERNS.md seccion compliance-check.ts
  </read_first>
  <action>
Modificar `checkCompliance`. El early-return cuando ambos arrays estan vacios (lineas 73-78) se PRESERVA intacto (no toca LLM). El system prompt largo y los messages se preservan verbatim.

Agregar imports:
```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { callWithGeminiFallback } from '../llm-fallback'
```

El patron actual desestructura `const { output } = await runWithPurpose(...)`. Para uniformidad con generation-call, capturar el `rawResult` completo en ambos branches y desestructurar despues. Reemplazar el bloque `const { output } = await runWithPurpose('subloop_compliance', () => generateText({...}))` por:
```typescript
const rawResult = await callWithGeminiFallback({
  callSite: 'compliance',
  gemini: (signal) =>
    runWithPurpose('subloop_compliance', () =>
      generateText({
        model: google('gemini-2.5-flash'),
        maxRetries: 0,        // D-05
        abortSignal: signal,  // D-06
        system: [ /* ...system prompt largo VERBATIM... */ ].join('\n'),
        messages: [ /* ...user message VERBATIM... */ ],
        output: Output.object({ schema: ComplianceCheckSchema }),
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
    runWithPurpose('subloop_compliance', () =>
      generateText({
        model: anthropic('claude-haiku-4-5'), // D-02
        system: [ /* ...MISMO system prompt VERBATIM... */ ].join('\n'),
        messages: [ /* ...MISMO user message VERBATIM... */ ],
        output: Output.object({ schema: ComplianceCheckSchema }),
        // SIN providerOptions.google — Pitfall #7
      })
    ),
})
const output = rawResult.output
```
IMPORTANTE: el system prompt largo y los messages son IDENTICOS en ambos closures (D-09). Para evitar duplicar las ~150 lineas del system prompt, extraer el array del system a una const local antes del `callWithGeminiFallback` (ej: `const systemLines = [...]` y `const userMessages = [...]`) y referenciarla en ambos closures. El `const output = rawResult.output` reemplaza la desestructuracion previa; el resto de la funcion (`const ok = !output.violatesNuncaDecir && ...`) queda intacto.

Si surge fricción con `Output.object` en Anthropic (Assumption A3 RESEARCH), el fallback documentado es `generateObject + result.object` — pero intentar `Output.object` primero (el codebase ya lo usa con google y pw-confirmation usa generateObject con anthropic, ambos validados).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "callSite: 'compliance'" src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` == 1
    - `grep -c "anthropic('claude-haiku-4-5')" src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` == 1
    - `grep -c "maxRetries: 0" src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` == 1
    - `grep -c "claude-client" src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` == 0
    - El early-return temprano se preserva: `grep -c "args.nuncaDecirRules.length === 0 && args.cuandoEscalar.length === 0" src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` == 1
    - `grep -c "export async function checkCompliance(args: {" src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` == 1 (firma intacta)
    - safetySettings aparece SOLO en el closure gemini (no en el anthropic): el system prompt debe estar factorizado, verificar 1 sola ocurrencia de providerOptions en el archivo
    - `npx tsc --noEmit` sin errores nuevos en compliance-check.ts
  </acceptance_criteria>
  <done>checkCompliance envuelve con callWithGeminiFallback callSite 'compliance'; early-return preservado; system prompt factorizado y compartido entre branches; anthropic sin providerOptions; firma intacta.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Suite de paridad sub-loop (MockLanguageModelV3)</name>
  <read_first>
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Q9 test 3 (contract parity con MockLanguageModelV3)
    - .planning/standalone/gemini-fallback-haiku/PATTERNS.md seccion "LLM mock"
    - src/lib/agents/somnio-v4/sub-loop/generation-call.ts + compliance-check.ts (post-Task 1/2)
  </read_first>
  <behavior>
    - Paridad de shape: mockear el provider Gemini que arroja saturacion (APICallError 503) y el branch Anthropic que devuelve un objeto valido del schema → assert que runGenerationCall devuelve un GenerationOutput valido (responseText/responseConfidence/binary presentes) PROVENIENTE del fallback
    - Mismo para checkCompliance: saturacion en gemini → fallback devuelve ComplianceCheckOutput valido (violatesNuncaDecir/shouldEscalate booleans)
    - Happy path: gemini OK → resultado de gemini, anthropic nunca invocado
  </behavior>
  <action>
Crear `src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts`.

Estrategia de mock: como `runGenerationCall`/`checkCompliance` construyen `google(...)` y `anthropic(...)` inline, mockear los providers a nivel de modulo con `vi.mock('@ai-sdk/google', ...)` y `vi.mock('@ai-sdk/anthropic', ...)` devolviendo factories que retornan instancias de `MockLanguageModelV3`. El mock de google arroja `APICallError(503,"high demand")` desde `doGenerate`; el mock de anthropic resuelve un `doGenerate` con el `text`/structured-output del shape esperado.

Alternativamente (mas simple y robusto): testear via el helper — importar `callWithGeminiFallback` y verificar la paridad de shape pasando closures `gemini` (arroja APICallError 503) y `anthropic` (resuelve el objeto del schema), asertando que el resultado validado por `GenerationOutputSchema.parse(...)` y `ComplianceCheckSchema.parse(...)` pasa. Esto cubre D-09 (mismo shape) sin acoplarse al inline-provider-construction. Documentar en el test que MockLanguageModelV3 esta disponible para un smoke E2E mas profundo (primer uso en el proyecto — anotar en LEARNINGS).

Casos minimos:
1. generation: gemini closure arroja `new APICallError({statusCode:503, message:'high demand', url:'x', requestBodyValues:{}})` → anthropic closure resuelve `{ output: { responseText:'Hola', responseConfidence:0.9, confidenceRationale:'x', binary:'RESPONDE_BIEN' } }` → `GenerationOutputSchema.parse(result.output)` no lanza.
2. compliance: idem con `{ output: { violatesNuncaDecir:false, shouldEscalate:false } }` → `ComplianceCheckSchema.parse` no lanza.
3. happy path: gemini closure resuelve el objeto → anthropic spy NUNCA llamado.

`__resetBreakers()` en afterEach.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts` → PASS
    - `grep -c "GenerationOutputSchema.parse\|ComplianceCheckSchema.parse" src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts` >= 1 (asserta paridad de shape)
    - `grep -c "__resetBreakers" src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts` >= 1
    - El test cubre un caso de saturacion→fallback y un happy-path: `grep -c "503\|high demand" fallback-parity.test.ts` >= 1
  </acceptance_criteria>
  <done>Suite de paridad verde: saturacion→fallback produce shape valido para ambos schemas; happy path no invoca anthropic.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Gemini/Anthropic provider → sub-loop output | structured output cruza al pipeline; el shape debe ser identico independiente del provider |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-03 | Tampering | branch Anthropic shape divergente | mitigate | Ambos branches usan el MISMO Zod schema (GenerationOutputSchema/ComplianceCheckSchema); test de paridad asserta GenerationOutputSchema.parse no lanza desde el fallback |
| T-fb-04 | Information Disclosure | system prompt + user message a Anthropic | accept | El prompt ya va a Gemini hoy; cambiar de provider no aumenta superficie (ANTHROPIC_API_KEY ya en uso en prod) |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/sub-loop/` verde (incluye fallback-parity + tests existentes del sub-loop).
- `npx tsc --noEmit` sin errores nuevos.
- Firmas publicas `runGenerationCall`/`checkCompliance` intactas (consumidores en sub-loop/index.ts + core/checkpoint-gate.ts + somnio-v4-agent.ts no requieren cambios).
</verification>

<success_criteria>
- generation-call.ts y compliance-check.ts con fallback Gemini→Haiku 4.5.
- Branch Anthropic sin providerOptions.google, mismo schema, maxRetries:0 + abortSignal en branch Gemini.
- Suite de paridad verde.
- Cero referencias a claude-client.ts.
</success_criteria>

<output>
After completion, create `.planning/standalone/gemini-fallback-haiku/02-SUMMARY.md`
</output>
