/**
 * Smoke LIVE del fallback en el call-site VISION (image-classifier → Haiku 4.5).
 * Cierra el último [ASSUMED] del RESEARCH: shape de image-parts del AI SDK es
 * provider-agnóstico (Gemini ↔ Anthropic sin cambiar el content).
 *
 * Run: npx tsx scripts/_smoke-fallback-vision.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

// Matar SOLO Gemini con error de red (H-01 shape)
const realFetch = globalThis.fetch
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input)
  if (url.includes('generativelanguage.googleapis.com')) {
    return realFetch('http://127.0.0.1:9/', init)
  }
  return realFetch(input, init)
}) as typeof fetch

const seenEvents: string[] = []
const realLog = console.log
console.log = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[gemini-fallback]')) {
    seenEvents.push(args[0].replace('[gemini-fallback] ', ''))
  }
  realLog(...args)
}

async function main() {
  const { classifyImage } = await import('../src/lib/agents/media/image-classifier')

  // PNG local → data URL (fetch de undici soporta data:)
  const png = readFileSync(resolve(process.cwd(), '.planning/standalone/whatsapp-inbox-reliability/robot/case1-iter1.png'))
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  realLog(`imagen de prueba: ${Math.round(png.length / 1024)}KB`)

  realLog('\n=== VISION: Gemini caído (red) → Haiku 4.5 con image part ===')
  const t0 = Date.now()
  const result = await classifyImage(dataUrl, 'image/png', 'mira esto')
  realLog(`\n[RESULTADO] ${Date.now() - t0}ms`)
  realLog(JSON.stringify(result, null, 2).slice(0, 800))

  realLog('\n=== EVENTOS ===')
  seenEvents.forEach(e => realLog(`  • ${e}`))

  const hasFallback = seenEvents.some(e => e.startsWith('fallback_triggered'))
  const validShape = result && typeof result === 'object' && 'categoria' in result
  realLog(`\nfallback_triggered: ${hasFallback ? '✓' : '✗'}`)
  realLog(`clasificación válida de Haiku: ${validShape ? '✓ (' + (result as any).categoria + ')' : '✗'}`)
  realLog(hasFallback && validShape ? '\nSMOKE VISION: PASS' : '\nSMOKE VISION: FAIL')
  process.exit(hasFallback && validShape ? 0 : 1)
}

main().catch(err => {
  realLog('\nSMOKE VISION: FAIL — error:', err?.name, err?.message?.slice(0, 400))
  process.exit(1)
})
