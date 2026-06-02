import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { MessageAnalysisSchema } from '../../../../src/lib/agents/somnio-v4/comprehension-schema'

const TEST_CASES = [
  { msg: 'hola', expectedIntent: 'saludo', expectedConfMin: 0.85 },
  { msg: 'qué tan adictivo es vs zolpidem?', expectedConfMax: 0.50 },
  { msg: 'funciona si tengo apnea?', expectedConfMax: 0.50 },
  { msg: 'lo quiero comprar', expectedIntent: 'quiero_comprar', expectedConfMin: 0.85 },
  { msg: 'ok', expectedIntent: 'acknowledgment', expectedConfMax: 0.70 },
]

const SYSTEM_PROMPT = `Eres un analizador de mensajes para un agente de ventas de Somnio.
- intent.intent_confidence: 0..1. 0.85+ = universal-claro. 0.50-0.70 = context-dependent. <0.40 = sumidero.
- NUNCA des >=0.85 cuando el mensaje pregunte por: condición médica específica (apnea, hipertensión), comparación con fármacos (zolpidem), embarazo/menores 14, opinión subjetiva.
EJEMPLOS:
- "hola" → saludo, 0.95
- "qué tan adictivo es vs zolpidem?" → contraindicaciones, 0.25
- "funciona si tengo apnea?" → contraindicaciones, 0.30
- "lo quiero comprar" → quiero_comprar, 0.92
- "ok" → acknowledgment, 0.55`

async function callModel(label: string, model: any, msg: string) {
  const start = Date.now()
  try {
    const result: any = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `Mensaje: "${msg}"`,
      output: Output.object({ schema: MessageAnalysisSchema }),
    })
    return { ok: true, output: result.output, lat: Date.now() - start, tIn: result.usage?.inputTokens, tOut: result.usage?.outputTokens }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), lat: Date.now() - start }
  }
}

async function main() {
  const gemini = google('gemini-2.5-flash-lite')
  const gpt = openai('gpt-4o-mini')

  console.log('=== Comprehension: Gemini Flash-Lite vs GPT-4o mini ===\n')

  for (const tc of TEST_CASES) {
    console.log(`--- "${tc.msg}" ---`)
    const [gm, oa] = await Promise.all([callModel('Gemini', gemini, tc.msg), callModel('GPT', gpt, tc.msg)])
    console.log('  Gemini:', JSON.stringify({ ok: gm.ok, intent: gm.output?.intent?.primary, conf: gm.output?.intent?.intent_confidence, lat: gm.lat, tIn: gm.tIn, tOut: gm.tOut, err: gm.error?.slice(0, 100) }))
    console.log('  GPT-4o-mini:', JSON.stringify({ ok: oa.ok, intent: oa.output?.intent?.primary, conf: oa.output?.intent?.intent_confidence, lat: oa.lat, tIn: oa.tIn, tOut: oa.tOut, err: oa.error?.slice(0, 100) }))
    console.log()
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
