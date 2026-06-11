/**
 * Smoke LIVE del fallback Gemini→Haiku (pre-flip RAG) — gemini-fallback-haiku.
 *
 * Método: parchea globalThis.fetch para que SOLO el host de Gemini falle con
 * error de RED real (connection refused → APICallError statusCode=undefined,
 * isRetryable=true — el shape exacto del fix H-01). La llamada a Anthropic va
 * REAL (ANTHROPIC_API_KEY de .env.local). Ejercita: comprehend() real →
 * predicado H-01 → fallback → Haiku 4.5 vivo → schema saneado M-03/M-04 →
 * breaker (2ª llamada = circuito abierto).
 *
 * NO toca prod, NO toca env vars de Vercel (lección del incidente 2026-06-11).
 *
 * Run: npx tsx scripts/_smoke-fallback-live.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 1. Cargar .env.local (sin deps)
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('FALTA ANTHROPIC_API_KEY en .env.local — abortando')
  process.exit(1)
}

// 2. Parchear fetch: matar SOLO el host de Gemini con error de red real
const realFetch = globalThis.fetch
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input)
  if (url.includes('generativelanguage.googleapis.com')) {
    // conexión rehusada → TypeError fetch failed → APICallError isRetryable, sin statusCode (H-01)
    return realFetch('http://127.0.0.1:9/', init)
  }
  return realFetch(input, init)
}) as typeof fetch

// 3. Capturar eventos [gemini-fallback] de la consola
const seenEvents: string[] = []
const realLog = console.log
console.log = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[gemini-fallback]')) {
    seenEvents.push(args[0].replace('[gemini-fallback] ', ''))
  }
  realLog(...args)
}

async function main() {
  // Import DESPUÉS del patch
  const { comprehend } = await import('../src/lib/agents/somnio-v4/comprehension')

  realLog('\n=== LLAMADA 1: Gemini caído (red) → debe hacer fallback a Haiku ===')
  const t0 = Date.now()
  const r1 = await comprehend('¿el elixir es adictivo?', [], {}, [])
  realLog(`\n[RESULTADO 1] ${Date.now() - t0}ms`)
  realLog(`  intent: ${r1.analysis.message_analysis?.primary_intent ?? JSON.stringify(r1.analysis).slice(0, 200)}`)
  realLog(`  full analysis: ${JSON.stringify(r1.analysis, null, 2).slice(0, 1500)}`)
  realLog(`  tokens: ${r1.tokensUsed}`)

  realLog('\n=== LLAMADA 2: inmediata → breaker debe estar ABIERTO (directo Haiku) ===')
  const t1 = Date.now()
  const r2 = await comprehend('¿cuánto cuesta?', [], {}, [])
  realLog(`\n[RESULTADO 2] ${Date.now() - t1}ms`)
  realLog(`  full analysis: ${JSON.stringify(r2.analysis).slice(0, 400)}`)

  realLog('\n=== EVENTOS CAPTURADOS ===')
  seenEvents.forEach(e => realLog(`  • ${e}`))

  const hasFallback = seenEvents.some(e => e.startsWith('fallback_triggered'))
  const hasCircuitOpen = seenEvents.some(e => e.startsWith('circuit_opened'))
  realLog(`\n=== VEREDICTO ===`)
  realLog(`  fallback_triggered: ${hasFallback ? '✓' : '✗ FALTA'}`)
  realLog(`  circuit_opened:     ${hasCircuitOpen ? '✓' : '✗ FALTA'}`)
  realLog(`  respuestas Haiku:   ${r1 && r2 ? '✓ ambas llamadas resolvieron' : '✗'}`)
  realLog(hasFallback && hasCircuitOpen && r1 && r2 ? '\nSMOKE: PASS' : '\nSMOKE: FAIL')
  process.exit(hasFallback && hasCircuitOpen && r1 && r2 ? 0 : 1)
}

main().catch(err => {
  realLog('\nSMOKE: FAIL — error no manejado:')
  realLog(err?.name, err?.message?.slice(0, 500))
  process.exit(1)
})
