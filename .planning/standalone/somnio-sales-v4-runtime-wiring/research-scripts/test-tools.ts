/**
 * Research test: tool calls + Output.object (sub-loop pattern real).
 *
 * Tests if each model can:
 * 1. Recognize when to call kb_search tool
 * 2. Process tool result
 * 3. Emit final LoopOutcome via Output.object
 *
 * Uses generateText with tools + stopWhen + Output.object — exactly like
 * v4 sub-loop/index.ts:54.
 */

import { generateText, Output, tool, stepCountIs } from 'ai'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

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

const KB_FIXTURE: Record<string, { canonical: string; nunca_decir: string[] }> = {
  contraindicaciones: {
    canonical:
      'ELIXIR DEL SUEÑO está contraindicado en menores de 14, embarazo, lactancia, autoinmunes y anticoagulantes.',
    nunca_decir: [
      'minimizar contraindicaciones',
      'afirmar que es seguro para todos',
    ],
  },
  formula: {
    canonical:
      'ELIXIR DEL SUEÑO contiene melatonina 10mg + citrato de magnesio 50mg. 90 comprimidos por frasco.',
    nunca_decir: ['mencionar valeriana', 'inventar otros activos'],
  },
}

const SYSTEM_PROMPT = `Eres un sub-loop de Somnio. Tu trabajo:
1. Si necesitas info del KB, llama tool "kb_search" con el topic
2. Si encuentras match → status="canonical" con canonicalText verbatim del KB doc
3. Si nada matches después de buscar → status="no_match" con responseTemplate="handoff_humano", requiresHuman=true
4. Si la respuesta puede mapearse a un template estándar (saludo, precio, etc) → status="template" con responseTemplate=intent

Después de máximo 2 búsquedas, debes emitir el LoopOutcome final.`

interface TestCase {
  name: string
  userMessage: string
  expectedStatus: 'canonical' | 'no_match' | 'template'
  shouldUseTools: boolean
}

const TEST_CASES: TestCase[] = [
  {
    name: 'should use tool + emit canonical',
    userMessage: 'puedo tomar si soy hipertenso?',
    expectedStatus: 'canonical', // hits contraindicaciones doc
    shouldUseTools: true,
  },
  {
    name: 'should use tool + emit no_match (off-topic)',
    userMessage: 'tienes para vender bitcoin o dogecoin?',
    expectedStatus: 'no_match',
    shouldUseTools: true,
  },
  {
    name: 'should not use tools + emit template',
    userMessage: 'cuánto cuesta?',
    expectedStatus: 'template',
    shouldUseTools: false,
  },
]

async function runTest(modelName: string, model: any, tc: TestCase) {
  const start = Date.now()
  const toolCallsObserved: string[] = []

  try {
    const tools = {
      kb_search: tool({
        description: 'Busca documento en KB por topic. Topics disponibles: contraindicaciones, formula, dependencia.',
        inputSchema: z.object({ topic: z.string() }),
        execute: async ({ topic }: { topic: string }) => {
          toolCallsObserved.push(topic)
          if (KB_FIXTURE[topic]) {
            return {
              found: true,
              canonical: KB_FIXTURE[topic].canonical,
              nuncaDecirRules: KB_FIXTURE[topic].nunca_decir,
              topic,
            }
          }
          return { found: false, topic }
        },
      }),
    }

    const result: any = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: tc.userMessage,
      tools,
      toolChoice: 'auto',
      stopWhen: stepCountIs(4),
      output: Output.object({ schema: LoopOutcomeFlatSchema }),
    })

    return {
      ok: true,
      output: result.output,
      toolCalls: toolCallsObserved,
      latencyMs: Date.now() - start,
      tokensIn: result.usage?.inputTokens,
      tokensOut: result.usage?.outputTokens,
      steps: result.steps?.length,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? String(err),
      toolCalls: toolCallsObserved,
      latencyMs: Date.now() - start,
    }
  }
}

async function main() {
  const flashLite = google('gemini-2.5-flash-lite')
  const flash = google('gemini-2.5-flash')
  const gpt4oMini = openai('gpt-4o-mini')

  const models: Array<[string, any]> = [
    ['Gemini Flash-Lite', flashLite],
    ['Gemini Flash 2.5', flash],
    ['GPT-4o mini', gpt4oMini],
  ]

  console.log('=== Tool calls + Output.object (sub-loop pattern) ===\n')

  for (const tc of TEST_CASES) {
    console.log(`========== ${tc.name} ==========`)
    console.log(`User: "${tc.userMessage}"`)
    console.log(`Expected status: ${tc.expectedStatus}, should use tools: ${tc.shouldUseTools}\n`)

    for (const [modelName, model] of models) {
      const result = await runTest(modelName, model, tc)
      console.log(`  ${modelName}:`)
      console.log(`    ok: ${result.ok}`)
      console.log(`    status: ${result.output?.status} ${result.output?.status === tc.expectedStatus ? '✓' : '✗'}`)
      console.log(`    toolCalls: ${JSON.stringify(result.toolCalls)}`)
      console.log(`    latency: ${result.latencyMs}ms`)
      console.log(`    tokens: in=${result.tokensIn}, out=${result.tokensOut}`)
      console.log(`    steps: ${result.steps ?? 'n/a'}`)
      if (result.error) {
        console.log(`    error: ${result.error.slice(0, 200)}`)
      }
      if (result.ok && result.output) {
        const outputPreview = JSON.stringify(result.output).slice(0, 200)
        console.log(`    output: ${outputPreview}`)
      }
      console.log()
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
