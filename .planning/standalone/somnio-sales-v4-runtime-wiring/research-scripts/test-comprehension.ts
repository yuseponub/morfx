/**
 * Research test: comprehension schema with real Plan 12.1 inputs.
 */

import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { MessageAnalysisSchema } from '../../../../src/lib/agents/somnio-v4/comprehension-schema'

const TEST_CASES = [
  { msg: 'hola', expectedIntent: 'saludo', expectedConfMin: 0.85 },
  { msg: 'qué tan adictivo es vs zolpidem?', expectedIntent: 'contraindicaciones', expectedConfMax: 0.50 },
  { msg: 'funciona si tengo apnea?', expectedIntent: 'contraindicaciones', expectedConfMax: 0.50 },
  { msg: 'lo quiero comprar', expectedIntent: 'quiero_comprar', expectedConfMin: 0.85 },
  { msg: 'ok', expectedIntent: 'acknowledgment', expectedConfMax: 0.70 },
]

const SYSTEM_PROMPT = `Eres un analizador de mensajes para un agente de ventas de Somnio (suplemento natural para dormir).

REGLAS:
- Solo extrae datos EXPLÍCITAMENTE presentes
- intent.intent_confidence: 0..1 self-reported. 0.85+ = universal-claro. 0.50-0.70 = context-dependent. <0.40 = sumidero/fallback.
- NUNCA des >=0.85 cuando el mensaje pregunte por: condición médica específica no listada (apnea, fibromialgia, hipertensión), comparación con otros fármacos (zolpidem, melatoxina), embarazo/lactancia/menores 14, opinión subjetiva, mensaje vago/off-topic.

EJEMPLOS:
- "hola" → saludo, 0.95
- "qué tan adictivo es vs zolpidem?" → contraindicaciones, 0.25
- "funciona si tengo apnea?" → contraindicaciones, 0.30
- "lo quiero comprar" → quiero_comprar, 0.92
- "ok" → acknowledgment, 0.55`

async function callModel(model: any, msg: string) {
  const start = Date.now()
  try {
    const result: any = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `Mensaje del cliente: "${msg}"`,
      output: Output.object({ schema: MessageAnalysisSchema }),
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

  console.log('=== Comprehension schema test ===\n')

  for (const tc of TEST_CASES) {
    console.log(`--- "${tc.msg}" ---`)
    const [hk, gm] = await Promise.all([callModel(haiku, tc.msg), callModel(gemini, tc.msg)])

    const haikuConf = hk.output?.intent?.intent_confidence
    const geminiConf = gm.output?.intent?.intent_confidence

    console.log('  Haiku:', JSON.stringify({
      ok: hk.ok,
      intent: hk.output?.intent?.primary,
      conf: haikuConf,
      lat: hk.latencyMs,
      tIn: hk.tokensIn,
      tOut: hk.tokensOut,
      err: hk.error?.slice(0, 150),
    }))
    console.log('  Gemini:', JSON.stringify({
      ok: gm.ok,
      intent: gm.output?.intent?.primary,
      conf: geminiConf,
      lat: gm.latencyMs,
      tIn: gm.tokensIn,
      tOut: gm.tokensOut,
      err: gm.error?.slice(0, 150),
    }))
    console.log()
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
