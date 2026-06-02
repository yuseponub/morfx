/**
 * Research test: nunca-decir simple schema + GPT-4o mini fallback comparison.
 */

import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const NuncaDecirSchema = z.object({
  violates: z.boolean(),
  violatedRule: z.string().optional(),
})

const TEST_CASES = [
  {
    name: 'violation true',
    candidateText: 'Es seguro para todos, incluyendo mujeres embarazadas y niños menores de 14',
    rules: ['NUNCA decir que es seguro en embarazo', 'NUNCA aprobar uso en menores de 14'],
    expectedViolation: true,
  },
  {
    name: 'violation false',
    candidateText: 'ELIXIR DEL SUEÑO ayuda a conciliar el sueño en adultos sanos.',
    rules: ['NUNCA decir que es seguro en embarazo', 'NUNCA aprobar uso en menores de 14'],
    expectedViolation: false,
  },
]

async function callNunca(model: any, candidateText: string, rules: string[]) {
  const start = Date.now()
  try {
    const result: any = await generateText({
      model,
      system: 'You are a content compliance checker.',
      prompt: `Candidate: "${candidateText}"\nForbidden rules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\nReturn { violates: bool, violatedRule?: string }.`,
      output: Output.object({ schema: NuncaDecirSchema }),
    })
    return { ok: true, output: result.output, latencyMs: Date.now() - start, tIn: result.usage?.inputTokens, tOut: result.usage?.outputTokens }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), latencyMs: Date.now() - start }
  }
}

// LoopOutcome flat — to test on GPT-4o mini as fallback
const LoopOutcomeFlatSchema = z.object({
  status: z.enum(['template', 'canonical', 'no_match']),
  reason: z.string(),
  requiresHuman: z.boolean(),
  responseTemplate: z.string().nullable(),
  canonicalText: z.string().nullable(),
  sourceTopic: z.string().nullable(),
  nuncaDecirRules: z.array(z.string()).nullable(),
  knowledgeQueried: z.array(z.string()).nullable(),
})

async function callLoop(model: any, prompt: string) {
  const start = Date.now()
  try {
    const result: any = await generateText({
      model,
      prompt,
      output: Output.object({ schema: LoopOutcomeFlatSchema }),
    })
    return { ok: true, output: result.output, latencyMs: Date.now() - start, tIn: result.usage?.inputTokens, tOut: result.usage?.outputTokens }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), latencyMs: Date.now() - start }
  }
}

async function main() {
  const haiku = anthropic('claude-haiku-4-5-20251001')
  const gemini = google('gemini-2.5-flash-lite')
  const gpt4oMini = openai('gpt-4o-mini')

  console.log('=== Nunca-decir CheckSchema (simple) ===\n')

  for (const tc of TEST_CASES) {
    console.log(`--- ${tc.name} ---`)
    const [hk, gm, oa] = await Promise.all([
      callNunca(haiku, tc.candidateText, tc.rules),
      callNunca(gemini, tc.candidateText, tc.rules),
      callNunca(gpt4oMini, tc.candidateText, tc.rules),
    ])
    console.log('  Haiku:', JSON.stringify({ ok: hk.ok, violates: hk.output?.violates, match: hk.output?.violates === tc.expectedViolation, lat: hk.latencyMs, tIn: hk.tIn, tOut: hk.tOut, err: hk.error?.slice(0, 100) }))
    console.log('  Gemini:', JSON.stringify({ ok: gm.ok, violates: gm.output?.violates, match: gm.output?.violates === tc.expectedViolation, lat: gm.latencyMs, tIn: gm.tIn, tOut: gm.tOut, err: gm.error?.slice(0, 100) }))
    console.log('  GPT-4o-mini:', JSON.stringify({ ok: oa.ok, violates: oa.output?.violates, match: oa.output?.violates === tc.expectedViolation, lat: oa.latencyMs, tIn: oa.tIn, tOut: oa.tOut, err: oa.error?.slice(0, 100) }))
    console.log()
  }

  console.log('=== LoopOutcome FLAT — GPT-4o mini fallback test ===\n')
  const loopCases = [
    { name: 'template', prompt: 'Cliente: "cuánto cuesta?". Status="template", responseTemplate="precio", requiresHuman=false. Resto null.', expected: 'template' },
    { name: 'canonical', prompt: 'Cliente: "tiene contraindicaciones?". KB topic="contraindicaciones": "## Respuesta canónica: contraindicado en embarazo y menores de 14." Status="canonical", canonicalText verbatim, sourceTopic="contraindicaciones", requiresHuman=false. Otros null.', expected: 'canonical' },
    { name: 'no_match', prompt: 'Cliente: "tienes bitcoin?". Off-topic. Status="no_match", responseTemplate="handoff_humano", requiresHuman=true, knowledgeQueried=["formula"]. Otros null.', expected: 'no_match' },
  ]

  for (const tc of loopCases) {
    console.log(`--- ${tc.name} (expected: ${tc.expected}) ---`)
    const oa = await callLoop(gpt4oMini, tc.prompt)
    console.log('  GPT-4o-mini:', JSON.stringify({ ok: oa.ok, status: oa.output?.status, match: oa.output?.status === tc.expected, lat: oa.latencyMs, tIn: oa.tIn, tOut: oa.tOut, err: oa.error?.slice(0, 100) }))
    console.log()
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
