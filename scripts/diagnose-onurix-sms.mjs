// Diagnóstico puntual — consulta el estado REAL que Onurix tiene para un dispatch_id.
// Run: node --env-file=.env.local scripts/diagnose-onurix-sms.mjs <dispatch_id>

const DISPATCH_ID = process.argv[2] || '5a6dcf7f-effe-4a94-96db-067f386b2738'
const ONURIX_BASE_URL = 'https://www.onurix.com/api/v1'

const clientId = process.env.ONURIX_CLIENT_ID
const apiKey = process.env.ONURIX_API_KEY

if (!clientId || !apiKey) {
  console.error('Faltan ONURIX_CLIENT_ID u ONURIX_API_KEY')
  process.exit(1)
}

console.log(`\n=== Onurix messages-state para dispatch_id=${DISPATCH_ID} ===\n`)

const url = new URL(`${ONURIX_BASE_URL}/messages-state`)
url.searchParams.set('client', clientId)
url.searchParams.set('key', apiKey)
url.searchParams.set('id', DISPATCH_ID)

const t0 = Date.now()
const res = await fetch(url.toString())
const elapsed = Date.now() - t0
const text = await res.text()

console.log(`HTTP ${res.status} ${res.statusText} (${elapsed}ms)`)
console.log(`Headers:`)
for (const [k, v] of res.headers.entries()) console.log(`  ${k}: ${v}`)
console.log(`\nRaw body:\n${text}\n`)

try {
  const data = JSON.parse(text)
  console.log('Parsed:')
  console.log(JSON.stringify(data, null, 2))
  const item = Array.isArray(data) ? data[0] : data
  if (item) {
    console.log(`\n--- Resumen ---`)
    console.log(`state:     ${item.state}`)
    console.log(`phone:     ${item.phone}`)
    console.log(`credits:   ${item.credits}`)
    if (item.reason || item.error || item.message) {
      console.log(`reason:    ${item.reason || item.error || item.message}`)
    }
    console.log(`Campos disponibles: ${Object.keys(item).join(', ')}`)
  }
} catch {
  console.log('(respuesta no es JSON)')
}
