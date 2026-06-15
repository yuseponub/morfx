/**
 * Repro DIRECTO: ¿la API de Gemini hoy acepta o rechaza el MessageAnalysisSchema real?
 *
 * Manda el schema EXACTO de comprehension (17 nullables → 17 anyOf) a
 * google('gemini-2.5-flash') igual que comprehension.ts. Sin inferencias:
 * o pasa (Gemini lo acepta) o devuelve el error de union types (lo rechaza).
 *
 * Corre N veces para medir determinista vs intermitente con un hecho.
 *
 * NO toca prod, NO toca env de Vercel. Run: npx tsx scripts/_repro-gemini-schema.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 1. Cargar .env.local
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error('FALTA GOOGLE_GENERATIVE_AI_API_KEY en .env.local — abortando')
  process.exit(1)
}

async function main() {
  const { generateText, Output } = await import('ai')
  const { google } = await import('@ai-sdk/google')
  const { MessageAnalysisSchema } = await import(
    '../src/lib/agents/somnio-v4/comprehension-schema'
  )

  const RUNS = 5
  let ok = 0
  let unionErr = 0
  let otherErr = 0

  console.log(`\n=== Repro: ${RUNS} llamadas a gemini-2.5-flash con MessageAnalysisSchema real ===\n`)

  for (let i = 1; i <= RUNS; i++) {
    try {
      const res = await generateText({
        model: google('gemini-2.5-flash'),
        maxRetries: 0,
        system: 'Clasificá el mensaje del cliente. Devolvé el objeto del schema.',
        messages: [{ role: 'user', content: 'hola' }],
        output: Output.object({ schema: MessageAnalysisSchema }),
        providerOptions: {
          google: {
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          },
        },
      })
      // Forzar acceso al output (algunos errores saltan aquí)
      void (res as { output?: unknown }).output
      ok++
      console.log(`  [${i}/${RUNS}] ✅ OK — Gemini ACEPTÓ el schema`)
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      const isUnion = /too many parameters with union types|union type|anyOf/i.test(msg)
      const isCredits = /prepayment credits are depleted|billing|insufficient.*credit|RESOURCE_EXHAUSTED[^]*quota/i.test(msg)
      if (isUnion) {
        unionErr++
        console.log(`  [${i}/${RUNS}] ❌ RECHAZADO (union types): ${msg.slice(0, 160)}`)
      } else if (isCredits) {
        otherErr++
        console.log(`  [${i}/${RUNS}] 💳 KEY SIN SALDO — la key de Gemini no tiene créditos. Recargá y reintentá.`)
        console.log(`     (Este repro NO prueba el límite del schema mientras la key esté sin saldo — D-08.)`)
      } else {
        otherErr++
        console.log(`  [${i}/${RUNS}] ⚠️  Otro error: ${msg.slice(0, 200)}`)
      }
    }
  }

  console.log(`\n=== RESULTADO ===`)
  console.log(`  OK (Gemini acepta):        ${ok}/${RUNS}`)
  console.log(`  Rechazado (union types):   ${unionErr}/${RUNS}`)
  console.log(`  Otro error:                ${otherErr}/${RUNS}`)
  if (unionErr === RUNS) console.log(`\n  → DETERMINISTA: Gemini rechaza el schema SIEMPRE (hoy).`)
  else if (unionErr > 0) console.log(`\n  → INTERMITENTE: Gemini lo rechaza a veces.`)
  else if (ok === RUNS) console.log(`\n  → Gemini lo ACEPTA siempre (el fallo NO se reproduce ahora).`)
}

main().catch((e) => {
  console.error('Repro crashed:', e)
  process.exit(1)
})
