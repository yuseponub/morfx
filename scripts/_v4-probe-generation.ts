/**
 * READ-ONLY probe: corre runGenerationCall() real (Gemini 2.5 Flash, temp=0.3) con el
 * material VERBATIM del KB interaccion_alcohol, para distinguir:
 *   H1 (el modelo se equivoca solo) vs H2 (la query combinada contamina la generación).
 *
 * Reproduce el turno 73cb2b38 donde responseConfidence=0.4 + binary=FUERA_SCOPE pese a
 * que el KB de alcohol SÍ cubre la pregunta. NO toca DB. Run:
 *   npx tsx scripts/_v4-probe-generation.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

// Material VERBATIM del chunk src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md
// (igual al que tooling-call copia a material_del_topic cuando selecciona este topic).
const material = {
  hechos:
    'La melatonina puede potenciar el efecto sedante del alcohol y causar somnolencia excesiva o malestar al día siguiente. Esto es un mecanismo farmacológico documentado: ambos compuestos son depresores del sistema nervioso central (SNC). El ELIXIR DEL SUEÑO contiene melatonina (10mg) + citrato de magnesio (50mg) — no es un sedante adicional sino un acompañamiento al ritmo natural del sueño.',
  posicion:
    'NO recomendamos combinar el ELIXIR DEL SUEÑO con alcohol. La empresa prioriza seguridad sobre conveniencia. Si el cliente bebió en una ocasión social, la recomendación es saltarse la dosis esa noche y retomar al día siguiente.',
  debe_contener_aplicables: [
    '[SIEMPRE] Recomendación explícita de NO combinar el producto con alcohol',
    '[SIEMPRE] Mención breve del mecanismo (potencia sedación / depresor SNC) sin tecnicismos',
  ],
  nunca_decir: [
    'Combinar el producto con alcohol es seguro o recomendable.',
    'Una cerveza con el producto no representa ningún riesgo.',
    'usar palabras como "te derivo", "te paso", "asesor humano", "tomo nota"',
  ],
  cuando_escalar: [
    'cliente insiste en combinar tras la advertencia',
    'cliente reporta haber tomado dosis con alcohol y siente malestar',
  ],
}

const dump = (label: string, r: any) => {
  const o = r.output
  console.log(`\n=== ${label} ===`)
  console.log('binary             :', o.binary)
  console.log('responseConfidence :', o.responseConfidence)
  console.log('confidenceRationale:', o.confidenceRationale)
  console.log('responseText       :', o.responseText)
}

async function main() {
  const { buildGenerationPrompt } = await import('../src/lib/agents/somnio-v4/sub-loop/prompt')
  const { runGenerationCall } = await import('../src/lib/agents/somnio-v4/sub-loop/generation-call')

  const systemPrompt = buildGenerationPrompt(material as any)

  const combined = 'Lo puedo tomar si tomo alcohol? Cuanto demora en llegar a bucaramanga'
  const isolated = 'Lo puedo tomar si tomo alcohol?'

  // Corro cada caso 2x (temp=0.3 → algo de no-determinismo) para ver estabilidad.
  for (let i = 1; i <= 2; i++) {
    const rC = await runGenerationCall({ systemPrompt, userMessage: combined, recentMessages: [] })
    dump(`COMBINADA (alcohol + bucaramanga) — reproduce turno 73cb2b38 [run ${i}]`, rC)
  }
  for (let i = 1; i <= 2; i++) {
    const rI = await runGenerationCall({ systemPrompt, userMessage: isolated, recentMessages: [] })
    dump(`AISLADA (solo alcohol) [run ${i}]`, rI)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
