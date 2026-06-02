/**
 * Research test (D-8) v5: LoopOutcome FLAT sin z.record (Anthropic compat).
 */

import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

// Schema flat without z.record (which generates propertyNames not supported by Anthropic).
// extraContext replaced with pre-defined optional fields (most common ones).
const LoopOutcomeFlatSchema = z.object({
  status: z.enum(['template', 'canonical', 'no_match']),
  reason: z.string(),
  requiresHuman: z.boolean(),
  responseTemplate: z.string().nullable(),
  canonicalText: z.string().nullable(),
  sourceTopic: z.string().nullable(),
  nuncaDecirRules: z.array(z.string()).nullable(),
  knowledgeQueried: z.array(z.string()).nullable(),
  // extraContext flattened into common pre-defined fields:
  extraNombre: z.string().nullable(),
  extraDireccion: z.string().nullable(),
  extraTelefono: z.string().nullable(),
})

const TEST_CASES = [
  {
    name: 'template',
    prompt: 'Cliente preguntó: "cuánto cuesta?". Status="template", responseTemplate="precio", requiresHuman=false. Resto null.',
    expected: 'template',
  },
  {
    name: 'canonical',
    prompt: 'Cliente: "tiene contraindicaciones?". KB topic="contraindicaciones": "## Respuesta canónica: ELIXIR DEL SUEÑO está contraindicado en menores de 14, embarazo, lactancia, autoinmunes y anticoagulantes." "## NUNCA decir: minimizar contraindicaciones; afirmar que es seguro para todos". Status="canonical", canonicalText verbatim, sourceTopic="contraindicaciones", nuncaDecirRules con las 2, requiresHuman=false. Otros null.',
    expected: 'canonical',
  },
  {
    name: 'no_match',
    prompt: 'Cliente: "tienes para vender bitcoin?". Off-topic. Status="no_match", responseTemplate="handoff_humano", requiresHuman=true, knowledgeQueried=["formula","contraindicaciones","alternativas_naturales"]. Otros null.',
    expected: 'no_match',
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
      tokensIn: result.usage?.inputTokens,
      tokensOut: result.usage?.outputTokens,
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), latencyMs: Date.now() - start }
  }
}

async function main() {
  const haiku = anthropic('claude-haiku-4-5-20251001')
  const gemini = google('gemini-2.5-flash-lite')

  console.log('=== LoopOutcome FLAT (no z.record) — Anthropic + Gemini ===\n')

  for (const tc of TEST_CASES) {
    console.log(`--- ${tc.name} (expected: ${tc.expected}) ---`)
    const [hk, gm] = await Promise.all([callModel(haiku, tc.prompt), callModel(gemini, tc.prompt)])
    console.log('  Haiku:', JSON.stringify({
      ok: hk.ok, status: hk.output?.status, match: hk.output?.status === tc.expected,
      lat: hk.latencyMs, tIn: hk.tokensIn, tOut: hk.tokensOut, err: hk.error?.slice(0, 150),
    }))
    console.log('  Gemini:', JSON.stringify({
      ok: gm.ok, status: gm.output?.status, match: gm.output?.status === tc.expected,
      lat: gm.latencyMs, tIn: gm.tokensIn, tOut: gm.tokensOut, err: gm.error?.slice(0, 150),
    }))
    console.log()
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
