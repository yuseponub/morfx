// ============================================================================
// E2E test: LoopOutcomeSchema flat contra GPT-4o mini REAL (Plan 03 refactor).
//
// Standalone: somnio-v4-rag-generative / Plan 03.
//
// Plan 03 RAG-generative refactor del schema:
// - status 'canonical' ELIMINADO → 'generated' nuevo.
// - canonicalText ELIMINADO → responseText.
// - responseConfidence + confidenceRationale agregados.
//
// El schema FLAT sigue compatible con todos los providers (OpenAI strict + Gemini +
// Anthropic) — los E2E tests validan eso contra GPT-4o mini real.
//
// Skipea cuando OPENAI_API_KEY_SALESV4 no está seteada (CI sin secret leak).
// Para correr local:
//   export OPENAI_API_KEY_SALESV4=sk-... && \
//     npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest'
import { generateText, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { LoopOutcomeSchema, validateLoopOutcomeInvariants } from '../output-schema'

// ----------------------------------------------------------------------------
// E2E block — gated por OPENAI_API_KEY_SALESV4 (D-30 env var custom name).
// ----------------------------------------------------------------------------
describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4)(
  'sub-loop E2E (real GPT-4o mini — Plan 03 schema acceptance)',
  () => {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })

    it('schema flat is accepted by GPT-4o mini (no oneOf/literal/record rejection)', async () => {
      const { output } = await generateText({
        model: openai('gpt-4o-mini'),
        system:
          'Eres un agente comercial. Devuelve un objeto LoopOutcome. Si el cliente saluda, devuelve status="template" con responseTemplate="saludo", requiresHuman=false, y todos los demás campos como null. Devuelve SIEMPRE el campo reason.',
        messages: [{ role: 'user', content: 'hola, como estas?' }],
        output: Output.object({ schema: LoopOutcomeSchema }),
      })

      // Schema validation passed if we got here without throw.
      expect(output.status).toMatch(/^(generated|template|no_match)$/)
      expect(typeof output.requiresHuman).toBe('boolean')
      expect(typeof output.reason).toBe('string')

      // Invariants pass post-hoc.
      const invariantCheck = validateLoopOutcomeInvariants(output)
      expect(invariantCheck.ok).toBe(true)
    }, 60000) // 60s timeout — first call cold

    it('handles off-topic / razonamiento_libre returning a valid LoopOutcome', async () => {
      const { output } = await generateText({
        model: openai('gpt-4o-mini'),
        system:
          'Eres un agente comercial de un suplemento natural para dormir. Si el cliente pregunta algo filosófico u off-topic, devuelve status="no_match" con responseTemplate="handoff_humano", requiresHuman=true, knowledgeQueried=["sentido_vida"], responseText=null, sourceTopic=null, responseConfidence=null, confidenceRationale=null, nuncaDecirRules=null. De lo contrario, devuelve template/generated apropiado. SIEMPRE incluye reason.',
        messages: [
          { role: 'user', content: 'cual es el sentido de la vida?' },
        ],
        output: Output.object({ schema: LoopOutcomeSchema }),
      })

      expect(output.status).toMatch(/^(generated|template|no_match)$/)
      expect(typeof output.requiresHuman).toBe('boolean')
      // Schema acepta cualquier outcome válido — el invariant check valida la
      // coherencia interna del output.
      const invariantCheck = validateLoopOutcomeInvariants(output)
      expect(invariantCheck.ok).toBe(true)
    }, 60000)
  },
)

// ----------------------------------------------------------------------------
// Syntactic block — corre SIEMPRE (sin API key) para sanity check del schema.
// ----------------------------------------------------------------------------
describe('LoopOutcomeSchema syntactic validation (no API)', () => {
  it('accepts flat shape without discriminatedUnion / literal / record', () => {
    const valid = {
      status: 'template' as const,
      responseTemplate: 'saludo',
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'OK',
    }
    const result = LoopOutcomeSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('rejects unknown status (sanity check enum enforcement)', () => {
    const invalid = {
      status: 'unknown_status',
      responseTemplate: null,
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'invalid',
    }
    expect(LoopOutcomeSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects legacy "canonical" status (Plan 03 schema eliminated this value — D-24)', () => {
    const invalid = {
      status: 'canonical',
      responseText: 'text',
      sourceTopic: 'topic',
      responseConfidence: 0.9,
      confidenceRationale: 'r',
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    expect(LoopOutcomeSchema.safeParse(invalid).success).toBe(false)
  })

  it('accepts generated status with all required RAG fields', () => {
    const valid = {
      status: 'generated' as const,
      responseText: 'Texto redactado por Gemini Flash.',
      sourceTopic: 'producto_ingredientes',
      responseConfidence: 0.80,
      confidenceRationale: 'Material cubre la pregunta.',
      nuncaDecirRules: ['no inventar dosis'],
      responseTemplate: null,
      knowledgeQueried: ['producto_ingredientes'],
      requiresHuman: false,
      reason: 'rag_generated',
    }
    const result = LoopOutcomeSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      const inv = validateLoopOutcomeInvariants(result.data)
      expect(inv.ok).toBe(true)
    }
  })
})
