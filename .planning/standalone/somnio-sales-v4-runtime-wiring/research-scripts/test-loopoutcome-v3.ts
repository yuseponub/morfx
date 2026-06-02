/**
 * Research test (D-8) v3: LoopOutcome with EXACT API as v4 sub-loop/index.ts:54.
 *
 * Uses `output:` (not `experimental_output:`) because v6.0.86 API.
 */

import { generateText, Output } from 'ai'
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
    name: 'template variant',
    prompt:
      'Cliente preguntó: "cuánto cuesta el producto?". Responde con LoopOutcome status="template", responseTemplate="precio", requiresHuman=false, reason explicando.',
    expectedStatus: 'template',
  },
  {
    name: 'canonical variant',
    prompt:
      'Cliente preguntó: "tiene contraindicaciones?". KB doc topic="contraindicaciones" tiene "## Respuesta canónica: ELIXIR DEL SUEÑO está contraindicado en menores de 14, embarazo, lactancia, autoinmunes y anticoagulantes." y "## NUNCA decir: minimizar contraindicaciones; afirmar que es seguro para todos". Devuelve LoopOutcome status="canonical", canonicalText (verbatim), sourceTopic="contraindicaciones", nuncaDecirRules con las 2 reglas, requiresHuman=false, reason.',
    expectedStatus: 'canonical',
  },
  {
    name: 'no_match variant',
    prompt:
      'Cliente preguntó: "tienes para vender bitcoin?". Off-topic completo. Devuelve LoopOutcome status="no_match", responseTemplate="handoff_humano", requiresHuman=true, reason, knowledgeQueried=["formula", "contraindicaciones", "alternativas_naturales"].',
    expectedStatus: 'no_match',
  },
]

async function callModel(model: any, prompt: string) {
  const start = Date.now()
  try {
    const result: any = await generateText({
      model,
      prompt,
      output: Output.object({ schema: LoopOutcomeSchema }),
    })
    return {
      ok: true,
      output: result.output,
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

  console.log('=== LoopOutcome test v3 (output: Output.object) ===\n')

  for (const tc of TEST_CASES) {
    console.log(`--- ${tc.name} (expected: ${tc.expectedStatus}) ---`)

    const [haikuResult, geminiResult] = await Promise.all([
      callModel(haikuModel, tc.prompt),
      callModel(geminiModel, tc.prompt),
    ])

    console.log('  Haiku:', JSON.stringify({
      ok: haikuResult.ok,
      status: haikuResult.output?.status,
      match: haikuResult.output?.status === tc.expectedStatus,
      latencyMs: haikuResult.latencyMs,
      tokensIn: haikuResult.inputTokens,
      tokensOut: haikuResult.outputTokens,
      error: haikuResult.error?.slice(0, 200),
    }))

    console.log('  Gemini:', JSON.stringify({
      ok: geminiResult.ok,
      status: geminiResult.output?.status,
      match: geminiResult.output?.status === tc.expectedStatus,
      latencyMs: geminiResult.latencyMs,
      tokensIn: geminiResult.inputTokens,
      tokensOut: geminiResult.outputTokens,
      error: geminiResult.error?.slice(0, 200),
    }))

    if (haikuResult.ok && haikuResult.output) {
      console.log('  Haiku output:', JSON.stringify(haikuResult.output).slice(0, 300))
    }
    if (geminiResult.ok && geminiResult.output) {
      console.log('  Gemini output:', JSON.stringify(geminiResult.output).slice(0, 300))
    }

    console.log()
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
