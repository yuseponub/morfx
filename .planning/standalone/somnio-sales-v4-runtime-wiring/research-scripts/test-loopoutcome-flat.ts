/**
 * Research test (D-8) v4: LoopOutcome FLAT (no discriminated union, no literals).
 *
 * Tests if Anthropic + Gemini accept a flat schema where status is z.enum
 * and per-variant fields are optional. Post-generation validation enforces
 * the cross-field invariants (e.g., status='canonical' => canonicalText present).
 */

import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

const LoopOutcomeFlatSchema = z.object({
  status: z.enum(['template', 'canonical', 'no_match']),
  reason: z.string(),
  requiresHuman: z.boolean(),
  responseTemplate: z.string().nullable().describe(
    'Required when status="template" or status="no_match" (use "handoff_humano" for no_match). null otherwise.'
  ),
  canonicalText: z.string().nullable().describe(
    'Required when status="canonical". Verbatim from KB doc Respuesta canónica section. null otherwise.'
  ),
  sourceTopic: z.string().nullable().describe(
    'Required when status="canonical". KB doc topic. null otherwise.'
  ),
  nuncaDecirRules: z.array(z.string()).nullable().describe(
    'Optional NUNCA decir rules from KB doc. null if none.'
  ),
  knowledgeQueried: z.array(z.string()).nullable().describe(
    'Required when status="no_match". List of KB topics consulted that did not resolve.'
  ),
  extraContext: z.record(z.string(), z.string()).nullable().describe(
    'Optional extra template context. null if none.'
  ),
})

interface TestCase {
  name: string
  prompt: string
  expectedStatus: 'template' | 'canonical' | 'no_match'
}

const TEST_CASES: TestCase[] = [
  {
    name: 'template variant',
    prompt:
      'Cliente preguntó: "cuánto cuesta el producto?". Devuelve LoopOutcome status="template", responseTemplate="precio", requiresHuman=false, reason explicando. Resto de campos null.',
    expectedStatus: 'template',
  },
  {
    name: 'canonical variant',
    prompt:
      'Cliente preguntó: "tiene contraindicaciones?". KB doc topic="contraindicaciones" sección "## Respuesta canónica": "ELIXIR DEL SUEÑO está contraindicado en menores de 14, embarazo, lactancia, autoinmunes y anticoagulantes." sección "## NUNCA decir": "minimizar contraindicaciones; afirmar que es seguro para todos". Devuelve status="canonical", canonicalText (verbatim), sourceTopic="contraindicaciones", nuncaDecirRules con las 2 reglas, requiresHuman=false, reason. responseTemplate, knowledgeQueried y extraContext null.',
    expectedStatus: 'canonical',
  },
  {
    name: 'no_match variant',
    prompt:
      'Cliente preguntó: "tienes para vender bitcoin?". Off-topic completo. Devuelve status="no_match", responseTemplate="handoff_humano", requiresHuman=true, reason, knowledgeQueried=["formula", "contraindicaciones", "alternativas_naturales"]. canonicalText, sourceTopic, nuncaDecirRules y extraContext null.',
    expectedStatus: 'no_match',
  },
]

async function callModel(model: any, prompt: string) {
  const start = Date.now()
  try {
    const result: any = await generateText({
      model,
      prompt,
      output: Output.object({ schema: LoopOutcomeFlatSchema }),
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

  console.log('=== LoopOutcome FLAT test (no discriminated union) ===\n')

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
      console.log('  Haiku output:', JSON.stringify(haikuResult.output).slice(0, 350))
    }
    if (geminiResult.ok && geminiResult.output) {
      console.log('  Gemini output:', JSON.stringify(geminiResult.output).slice(0, 350))
    }

    console.log()
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
