#!/usr/bin/env node
// Diagnostic experiment: aislar la causa de AI_NoOutputGeneratedError en tooling-call.
//
// Variantes:
//   A — tools + Output.object schema iter 2 (control = setup actual)
//   B — tools sin Output.object (modelo emite texto libre)
//   C — Output.object sin tools (hits pasados en prompt)
//   D — tools + Output.object con schema TRIVIAL (1 string field)
//
// Si A falla mientras B/C funcionan → confirma combo tools+Output.object.
// Si D también falla → schema NO es la causa principal.
// Si todas fallan → problema más profundo (key, account, modelo).

import 'dotenv/config'
import { generateText, Output, stepCountIs, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import fs from 'node:fs'

// Leer .env.local manualmente (dotenv lee .env por defecto)
const envFile = fs.readFileSync('.env.local', 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const apiKey = process.env.OPENAI_API_KEY_SALESV4 || process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('No OPENAI_API_KEY_SALESV4 ni OPENAI_API_KEY set en .env.local')
  process.exit(1)
}

const openai = createOpenAI({ apiKey })

// Mensaje real del cliente que disparó el bug en sandbox
const USER_MESSAGE = 'me diagnosticaron apnea del sueño, me ayuda?'

// Schema iter 2 (current production-shipped)
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

// Schema trivial
const SchemaTrivial = z.object({
  answer: z.string().describe('Short answer.'),
})

// Mock kb_search tool — devuelve hits canned (3 topics realistas)
function kbSearchToolMock() {
  return tool({
    description: 'Search the Somnio v4 KB. Returns top-3 hits with material.',
    inputSchema: z.object({
      query: z.string().describe('User message or sub-question to look up'),
    }),
    async execute({ query }) {
      // Hits canned como vendría del RPC pgvector
      return [
        {
          topic: 'insomnio_largo_plazo',
          similarity: 0.52,
          hechosDelProducto: 'ELIXIR DEL SUEÑO es suplemento natural para acompañar el sueño. NO reemplaza fármacos para insomnio crónico.',
          posicionDelNegocio: 'Casos con apnea u otras condiciones requieren diagnóstico médico — se escalan a humano.',
          debeContener: ['[SIEMPRE] Empezar con empatía breve'],
          nuncaDecirRules: ['El producto resuelve cualquier tipo de insomnio.'],
          cuandoEscalar: ['cliente menciona apnea del sueño u otra condición que requiere diagnóstico'],
        },
        {
          topic: 'contraindicaciones',
          similarity: 0.41,
          hechosDelProducto: 'ELIXIR DEL SUEÑO está formulado para personas adultas.',
          posicionDelNegocio: 'NO aprobamos uso en condiciones listadas.',
          debeContener: ['[SI APLICA] Si cliente menciona condición específica → derivar al médico'],
          nuncaDecirRules: ['El producto es seguro o aprobado para uso en embarazo, lactancia...'],
          cuandoEscalar: ['cliente embarazada o en lactancia insiste en comprar'],
        },
        {
          topic: 'efectividad',
          similarity: 0.38,
          hechosDelProducto: 'ELIXIR DEL SUEÑO acompaña el ritmo del sueño en uso constante.',
          posicionDelNegocio: 'La efectividad depende de constancia.',
          debeContener: ['[SIEMPRE] Mencionar que requiere uso consistente'],
          nuncaDecirRules: ['Garantiza efecto inmediato 100%.'],
          cuandoEscalar: ['cliente reporta NO haber visto mejora tras 2+ semanas'],
        },
      ]
    },
  })
}

// System prompt simplificado pero representativo del actual
const SYSTEM_PROMPT_FULL = `Eres el sub-loop de Somnio v4. Tu trabajo: buscar en KB con kb_search y emitir material parseado.

PROCEDIMIENTO:
1. PRIMERA búsqueda VERBATIM con la pregunta del cliente.
2. SEGUNDA búsqueda con reformulación.
3. Razoná sobre hits combinados.
4. Seleccioná topic ganador.
5. Emití output schema:
   - topic_seleccionado: nombre del topic ganador (o null si ninguno aplica)
   - material_del_topic: hechos/posicion/debe_contener_aplicables/nunca_decir/cuando_escalar verbatim del hit ganador (null si should_handoff)
   - should_handoff: true si ningún hit aplica
   - handoff_reason: corta si should_handoff

REGLAS:
- 2 búsquedas obligatorias.
- NO inventes contenido del material.
- NO emitas texto al cliente.
- Si no hay topic relevante → should_handoff=true.`

const SYSTEM_PROMPT_TRIVIAL = `Eres un agente Somnio. Llama kb_search con la pregunta del cliente. Después emite { answer: "tu respuesta corta" }.`

const SYSTEM_PROMPT_NOTOOLS = `Eres un agente Somnio. El cliente pregunta algo. Acá tenés 3 hits del KB. Emitir output schema:
- topic_seleccionado
- material_del_topic (verbatim del hit ganador)
- should_handoff
- handoff_reason

HITS DEL KB:
[Hit 1] topic: insomnio_largo_plazo, similarity: 0.52
  hechos: ELIXIR DEL SUEÑO es suplemento natural para acompañar el sueño. NO reemplaza fármacos para insomnio crónico.
  posicion: Casos con apnea u otras condiciones requieren diagnóstico médico — se escalan a humano.
  cuando_escalar: cliente menciona apnea del sueño u otra condición que requiere diagnóstico
[Hit 2] topic: contraindicaciones, similarity: 0.41
  hechos: ELIXIR DEL SUEÑO está formulado para personas adultas.
[Hit 3] topic: efectividad, similarity: 0.38
  hechos: ELIXIR DEL SUEÑO acompaña el ritmo del sueño.`

// ============ VARIANTS ============

async function variantA() {
  const t0 = performance.now()
  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT_FULL,
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
      errorMsg: (e.message ?? String(e)).slice(0, 200),
    }
  }
}

async function variantB() {
  // Tools sin Output.object — modelo emite texto libre
  const t0 = performance.now()
  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT_FULL + '\n\nNOTA: emití tu razonamiento + decisión en texto libre, NO en JSON.',
      messages: [{ role: 'user', content: USER_MESSAGE }],
      tools: { kb_search: kbSearchToolMock() },
      toolChoice: 'auto',
      stopWhen: stepCountIs(4),
    })
    const latency = performance.now() - t0
    return {
      success: !!result.text,
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
      errorMsg: (e.message ?? String(e)).slice(0, 200),
    }
  }
}

async function variantC() {
  // Output.object sin tools — hits inyectados en prompt
  const t0 = performance.now()
  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT_NOTOOLS,
      messages: [{ role: 'user', content: USER_MESSAGE }],
      output: Output.object({ schema: SchemaIter2 }),
    })
    const out = result.output
    const latency = performance.now() - t0
    return {
      success: !!out,
      stepCount: result.steps?.length ?? 0,
      finishReason: result.finishReason,
      latencyMs: latency,
      toolCallCount: 0,
    }
  } catch (e) {
    const latency = performance.now() - t0
    return {
      success: false,
      stepCount: 0,
      finishReason: 'error',
      latencyMs: latency,
      errorName: e.name ?? 'Error',
      errorMsg: (e.message ?? String(e)).slice(0, 200),
    }
  }
}

async function variantD() {
  // Tools + Output.object pero schema TRIVIAL
  const t0 = performance.now()
  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT_TRIVIAL,
      messages: [{ role: 'user', content: USER_MESSAGE }],
      tools: { kb_search: kbSearchToolMock() },
      toolChoice: 'auto',
      stopWhen: stepCountIs(4),
      output: Output.object({ schema: SchemaTrivial }),
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
      errorMsg: (e.message ?? String(e)).slice(0, 200),
    }
  }
}

// ============ RUNNER ============

async function runVariant(name, fn, n, concurrency = 5) {
  console.log(`\n=== Variant ${name} — ${n} runs (concurrency ${concurrency}) ===`)
  const results = []
  let completed = 0
  // Run in batches to respect rate limits
  for (let i = 0; i < n; i += concurrency) {
    const batch = []
    for (let j = 0; j < concurrency && i + j < n; j++) {
      batch.push(fn())
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
  console.log('=== TOOLING-CALL DIAGNOSTIC EXPERIMENT ===')
  console.log(`Message: "${USER_MESSAGE}"`)
  console.log(`Hypothesis: tools + Output.object combo causes stepCount=0 + AI_NoOutputGeneratedError`)
  console.log()

  const N_CONTROL = 150
  const N_VARIANT = 50
  const CONCURRENCY = 5

  const results = {
    A: await runVariant('A (control: tools + Output.object iter 2 schema)', variantA, N_CONTROL, CONCURRENCY),
    B: await runVariant('B (tools only, no Output.object)', variantB, N_VARIANT, CONCURRENCY),
    C: await runVariant('C (Output.object only, no tools)', variantC, N_VARIANT, CONCURRENCY),
    D: await runVariant('D (tools + Output.object + trivial schema)', variantD, N_VARIANT, CONCURRENCY),
  }

  console.log('\n\n=== SUMMARY ===\n')
  for (const [name, runs] of Object.entries(results)) {
    console.log(`--- Variant ${name} ---`)
    const sum = summarize(runs)
    console.log(JSON.stringify(sum, null, 2))
    console.log()
  }

  // Save raw
  const outPath = 'scripts/experiment-results-tooling-call.json'
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    userMessage: USER_MESSAGE,
    results,
  }, null, 2))
  console.log(`\nRaw results: ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
