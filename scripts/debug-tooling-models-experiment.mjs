#!/usr/bin/env node
// Experimento 2: testear OTROS modelos contra el combo tools + Output.object + schema iter 2.
// Variant A (gpt-4o-mini) ya falló 78.7%. Buscamos un modelo que no tenga el bug.

import 'dotenv/config'
import { generateText, Output, stepCountIs, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import fs from 'node:fs'

const envFile = fs.readFileSync('.env.local', 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const openaiApiKey = process.env.OPENAI_API_KEY_SALESV4 || process.env.OPENAI_API_KEY
const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
if (!openaiApiKey) { console.error('No OpenAI key'); process.exit(1) }
if (!googleApiKey) { console.error('No Google key — exp F/G/H skipped if missing'); }

const openai = createOpenAI({ apiKey: openaiApiKey })
const google = googleApiKey ? createGoogleGenerativeAI({ apiKey: googleApiKey }) : null

const USER_MESSAGE = 'me diagnosticaron apnea del sueño, me ayuda?'

const SchemaIter2 = z.object({
  should_handoff: z.boolean(),
  topic_seleccionado: z.union([z.string(), z.null()]),
  material_del_topic: z.union([
    z.object({
      hechos: z.string(),
      posicion: z.string(),
      debe_contener_aplicables: z.array(z.string()),
      nunca_decir: z.array(z.string()),
      cuando_escalar: z.array(z.string()),
    }),
    z.null(),
  ]),
  handoff_reason: z.union([z.string(), z.null()]),
})

function kbSearchToolMock() {
  return tool({
    description: 'Search the Somnio v4 KB. Returns top-3 hits with material.',
    inputSchema: z.object({ query: z.string() }),
    async execute({ query }) {
      return [
        {
          topic: 'insomnio_largo_plazo',
          similarity: 0.52,
          hechos: 'ELIXIR DEL SUEÑO es suplemento natural...',
          posicion: 'Casos con apnea requieren diagnóstico médico.',
          debe_contener: ['[SIEMPRE] empatía breve'],
          nunca_decir: ['Resuelve cualquier insomnio.'],
          cuando_escalar: ['cliente menciona apnea del sueño'],
        },
        {
          topic: 'contraindicaciones',
          similarity: 0.41,
          hechos: 'Formulado para personas adultas.',
          posicion: 'NO aprobamos uso en condiciones listadas.',
          debe_contener: ['[SI APLICA] derivar al médico'],
          nunca_decir: ['Es seguro en embarazo.'],
          cuando_escalar: ['embarazada insiste'],
        },
        {
          topic: 'efectividad',
          similarity: 0.38,
          hechos: 'Acompaña el ritmo del sueño.',
          posicion: 'Requiere constancia.',
          debe_contener: ['[SIEMPRE] uso consistente'],
          nunca_decir: ['Efecto 100% inmediato.'],
          cuando_escalar: ['sin mejora tras 2+ semanas'],
        },
      ]
    },
  })
}

const SYSTEM_PROMPT = `Eres el sub-loop de Somnio v4. Llamá kb_search 2 veces (verbatim + reformulada), elegí topic ganador, emití output schema.

REGLAS:
- 2 búsquedas obligatorias.
- topic_seleccionado: nombre del topic ganador (o null si ninguno aplica).
- material_del_topic: copiá verbatim del hit ganador (null si should_handoff).
- should_handoff: true si ningún hit aplica.
- handoff_reason: corta si should_handoff.`

async function runOne(model) {
  const t0 = performance.now()
  try {
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_MESSAGE }],
      tools: { kb_search: kbSearchToolMock() },
      toolChoice: 'auto',
      stopWhen: stepCountIs(4),
      output: Output.object({ schema: SchemaIter2 }),
    })
    const out = result.output
    const latency = performance.now() - t0
    return {
      success: !!out,
      stepCount: result.steps?.length ?? 0,
      finishReason: result.finishReason,
      latencyMs: latency,
      toolCallCount: result.steps?.reduce((s, st) => s + (st.toolCalls?.length ?? 0), 0) ?? 0,
    }
  } catch (e) {
    const latency = performance.now() - t0
    return {
      success: false,
      stepCount: 0,
      finishReason: 'error',
      latencyMs: latency,
      errorName: e.name ?? 'Error',
      errorMsg: (e.message ?? String(e)).slice(0, 250),
    }
  }
}

async function runVariant(name, model, n, concurrency = 5) {
  console.log(`\n=== Variant ${name} — ${n} runs ===`)
  const results = []
  let completed = 0
  for (let i = 0; i < n; i += concurrency) {
    const batch = []
    for (let j = 0; j < concurrency && i + j < n; j++) {
      batch.push(runOne(model))
    }
    const batchResults = await Promise.all(batch)
    results.push(...batchResults)
    completed += batchResults.length
    process.stdout.write(`\r  progress: ${completed}/${n}`)
  }
  console.log()
  return results
}

function summarize(results) {
  const total = results.length
  const successes = results.filter(r => r.success).length
  const failures = results.filter(r => !r.success).length
  const stepCount0 = results.filter(r => r.stepCount === 0 && !r.success).length
  const errorTypes = {}
  for (const r of results) {
    if (!r.success && r.errorName) {
      errorTypes[r.errorName] = (errorTypes[r.errorName] || 0) + 1
    }
  }
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b)
  const p50 = latencies[Math.floor(total * 0.5)]
  const p95 = latencies[Math.floor(total * 0.95)]
  const avgToolCalls = results.reduce((s, r) => s + (r.toolCallCount ?? 0), 0) / total
  return {
    total,
    successes,
    failures,
    failureRate: (failures / total * 100).toFixed(1) + '%',
    stepCount0,
    errorTypes,
    latencyMs: { p50: Math.round(p50), p95: Math.round(p95) },
    avgToolCalls: avgToolCalls.toFixed(2),
  }
}

async function main() {
  const N = 50
  const results = {}

  results.E_gpt4o = await runVariant('E (gpt-4o full)', openai('gpt-4o'), N)
  results.F_gpt41mini = await runVariant('F (gpt-4.1-mini)', openai('gpt-4.1-mini'), N)

  if (google) {
    results.G_gemini_flash_lite = await runVariant('G (gemini-2.5-flash-lite)', google('gemini-2.5-flash-lite'), N)
    results.H_gemini_flash = await runVariant('H (gemini-2.5-flash)', google('gemini-2.5-flash'), N)
  }

  console.log('\n\n=== SUMMARY ===\n')
  for (const [name, runs] of Object.entries(results)) {
    console.log(`--- Variant ${name} ---`)
    const sum = summarize(runs)
    console.log(JSON.stringify(sum, null, 2))
    console.log()
  }

  fs.writeFileSync('scripts/experiment-results-models.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    userMessage: USER_MESSAGE,
    results,
  }, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
