/**
 * Research test (D-8): LoopOutcome discriminated union with Gemini Flash-Lite.
 *
 * Validates whether @ai-sdk/google can emit each variant of the discriminated
 * union schema correctly when explicitly prompted. This is the highest-risk
 * schema in v4 because it has 3 variants with different required fields.
 *
 * Run:
 *   GOOGLE_GENERATIVE_AI_API_KEY=... ANTHROPIC_API_KEY=... npx tsx \
 *     .planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-loopoutcome.ts
 */

import { generateObject, generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { LoopOutcomeSchema } from '../../../../src/lib/agents/somnio-v4/sub-loop/output-schema'

interface TestCase {
  name: string
  prompt: string
  expectedStatus: 'template' | 'canonical' | 'no_match'
}

const TEST_CASES: TestCase[] = [
  {
    name: 'template variant — explicit',
    prompt:
      'El cliente preguntó: "cuánto cuesta el producto?". Debes responder con un LoopOutcome con status="template", responseTemplate="precio", requiresHuman=false, reason explicando por qué. Sin extraContext.',
    expectedStatus: 'template',
  },
  {
    name: 'canonical variant — explicit',
    prompt:
      'El cliente preguntó: "tiene contraindicaciones?". El KB doc topic="contraindicaciones" tiene la sección "## Respuesta canónica" con texto: "ELIXIR DEL SUEÑO está contraindicado en menores de 14, embarazo, lactancia, autoinmunes y anticoagulantes." y la sección "## NUNCA decir" con: "minimizar contraindicaciones; afirmar que es seguro para todos". Devuelve un LoopOutcome con status="canonical", canonicalText (verbatim del texto canónico), sourceTopic="contraindicaciones", nuncaDecirRules con las 2 reglas, requiresHuman=false, reason explicando por qué.',
    expectedStatus: 'canonical',
  },
  {
    name: 'no_match variant — explicit',
    prompt:
      'El cliente preguntó: "tienes para vender bitcoin?". Es completamente off-topic. No hay nada en KB que aplique. Devuelve un LoopOutcome con status="no_match", responseTemplate="handoff_humano", requiresHuman=true, reason explicando por qué, knowledgeQueried con los topics consultados que no aplicaron (ej: ["formula", "contraindicaciones", "alternativas_naturales"]).',
    expectedStatus: 'no_match',
  },
]

async function callModel(label: string, model: any, prompt: string): Promise<{
  ok: boolean
  output?: any
  error?: string
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
}> {
  const start = Date.now()
  try {
    const result = await generateObject({
      model,
      schema: LoopOutcomeSchema,
      prompt,
    })
    return {
      ok: true,
      output: result.object,
      latencyMs: Date.now() - start,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? String(err),
      latencyMs: Date.now() - start,
    }
  }
}

async function main() {
  const haikuModel = anthropic('claude-haiku-4-5-20251001')
  const geminiModel = google('gemini-2.5-flash-lite')

  console.log('=== LoopOutcome discriminated union test ===\n')

  for (const tc of TEST_CASES) {
    console.log(`--- Test: ${tc.name} ---`)
    console.log(`Expected status: ${tc.expectedStatus}`)
    console.log(`Prompt preview: ${tc.prompt.slice(0, 80)}...\n`)

    const [haikuResult, geminiResult] = await Promise.all([
      callModel('Haiku', haikuModel, tc.prompt),
      callModel('Gemini', geminiModel, tc.prompt),
    ])

    console.log('  Haiku:', JSON.stringify({
      ok: haikuResult.ok,
      status: haikuResult.output?.status,
      statusMatchesExpected: haikuResult.output?.status === tc.expectedStatus,
      latencyMs: haikuResult.latencyMs,
      inputTokens: haikuResult.inputTokens,
      outputTokens: haikuResult.outputTokens,
      error: haikuResult.error?.slice(0, 200),
    }))

    console.log('  Gemini:', JSON.stringify({
      ok: geminiResult.ok,
      status: geminiResult.output?.status,
      statusMatchesExpected: geminiResult.output?.status === tc.expectedStatus,
      latencyMs: geminiResult.latencyMs,
      inputTokens: geminiResult.inputTokens,
      outputTokens: geminiResult.outputTokens,
      error: geminiResult.error?.slice(0, 200),
    }))

    if (haikuResult.ok && haikuResult.output) {
      console.log('  Haiku output:', JSON.stringify(haikuResult.output, null, 2).slice(0, 400))
    }
    if (geminiResult.ok && geminiResult.output) {
      console.log('  Gemini output:', JSON.stringify(geminiResult.output, null, 2).slice(0, 400))
    }

    console.log()
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
