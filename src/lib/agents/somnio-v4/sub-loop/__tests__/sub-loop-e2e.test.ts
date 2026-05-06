// ============================================================================
// E2E test: LoopOutcomeSchema flat contra GPT-4o mini REAL.
//
// Standalone: somnio-sales-v4-runtime-wiring / Plan 02 / Task 3.
//
// RESEARCH H-1: el schema previo (z.discriminatedUnion + z.literal + z.record)
// NUNCA corrió contra API real — los unit tests del v4 sub-loop eran mocks. Tras
// D-29 RE-SHAPE (Task 1), este test prueba que el schema flat ES aceptado por
// GPT-4o mini (modelo target del sub-loop por D-30 — única option viable para
// tools+Output.object combinados; Gemini API no soporta esa combinación).
//
// H-2: GPT-4o mini es el provider target del sub-loop. H-3: schema flat-nullable
// debe ser portable a OpenAI strict mode (no .optional(), no boolean literals).
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
  'sub-loop E2E (real GPT-4o mini — D-29 schema flat acceptance)',
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
      expect(output.status).toMatch(/^(template|canonical|no_match)$/)
      expect(typeof output.requiresHuman).toBe('boolean')
      expect(typeof output.reason).toBe('string')

      // Invariants pass post-hoc (D-29).
      const invariantCheck = validateLoopOutcomeInvariants(output)
      expect(invariantCheck.ok).toBe(true)
    }, 60000) // 60s timeout — first call cold

    it('handles off-topic / razonamiento_libre returning a valid LoopOutcome', async () => {
      const { output } = await generateText({
        model: openai('gpt-4o-mini'),
        system:
          'Eres un agente comercial de un suplemento natural para dormir. Si el cliente pregunta algo filosófico u off-topic, devuelve status="no_match" con responseTemplate="handoff_humano", requiresHuman=true, knowledgeQueried=["sentido_vida"], canonicalText=null, sourceTopic=null, nuncaDecirRules=null. De lo contrario, devuelve template/canonical apropiado. SIEMPRE incluye reason.',
        messages: [
          { role: 'user', content: 'cual es el sentido de la vida?' },
        ],
        output: Output.object({ schema: LoopOutcomeSchema }),
      })

      expect(output.status).toMatch(/^(template|canonical|no_match)$/)
      expect(typeof output.requiresHuman).toBe('boolean')
      // Schema acepta cualquier outcome válido — el invariant check valida la
      // coherencia interna del output.
      const invariantCheck = validateLoopOutcomeInvariants(output)
      expect(invariantCheck.ok).toBe(true)
    }, 60000)
  }
)

// ----------------------------------------------------------------------------
// Syntactic block — corre SIEMPRE (sin API key) para sanity check del schema.
// ----------------------------------------------------------------------------
describe('LoopOutcomeSchema syntactic validation (no API)', () => {
  it('accepts flat shape without discriminatedUnion / literal / record', () => {
    const valid = {
      status: 'template' as const,
      responseTemplate: 'saludo',
      canonicalText: null,
      sourceTopic: null,
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
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'invalid',
    }
    expect(LoopOutcomeSchema.safeParse(invalid).success).toBe(false)
  })
})
