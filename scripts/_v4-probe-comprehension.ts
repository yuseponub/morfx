/**
 * READ-ONLY probe: corre comprehend() real (Gemini 2.5 Flash, temp=0) sobre el
 * mensaje del turno 44204b79 para verificar SI secondary_confidence se mide y con
 * qué valor. NO toca DB, NO toca env de Vercel. Run: npx tsx scripts/_v4-probe-comprehension.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const dump = (label: string, intent: any) => {
  console.log(`\n=== ${label} ===`)
  console.log('primary             :', intent.primary)
  console.log('intent_confidence   :', intent.intent_confidence)
  console.log('  reasoning         :', intent.intent_confidence_reasoning)
  console.log('secondary           :', intent.secondary)
  console.log('secondary_confidence:', intent.secondary_confidence)
  console.log('  reasoning         :', intent.secondary_confidence_reasoning)
  console.log('secondary_query     :', intent.secondary_query)
}

async function main() {
  const { comprehend } = await import('../src/lib/agents/somnio-v4/comprehension')

  // 1) Mensaje combinado real del turno (Path A combinó los 2 inbound)
  const combined = 'Lo puedo tomar si tomo alcohol? Cuanto demora en llegar a bucaramanga'
  const r1 = await comprehend(combined, [], {}, [])
  dump('COMBINADO (alcohol + entrega) — reproduce turno 44204b79', r1.analysis.intent)

  // 2) Solo la pregunta de entrega (para ver tiempo_entrega como PRIMARY aislado)
  const r2 = await comprehend('Cuanto demora en llegar a bucaramanga', [], {}, [])
  dump('SOLO ENTREGA (aislada)', r2.analysis.intent)

  // 3) Solo alcohol (para ver contraindicaciones aislado)
  const r3 = await comprehend('Lo puedo tomar si tomo alcohol?', [], {}, [])
  dump('SOLO ALCOHOL (aislada)', r3.analysis.intent)
}

main().then(() => process.exit(0))
