/**
 * Test SMS pre-blast — 5 SMS reales a número del equipo morfx (jose-only mode).
 * Cumple D-13.4 del standalone godentist-blast-sms-experiment.
 *
 * IMPORTANTE: Este script DEBITA $485 COP del workspace GoDentist.
 * NO ejecutar más de una vez sin razón.
 *
 * Mode: jose-only — los 5 sends van al mismo phone (+573137549286) con 5 nombres
 * distintos (incluyendo 1 con acento) para validar end-to-end:
 *   - Sender ID Onurix renderiza OK
 *   - Texto llega 1 segmento (GSM-7)
 *   - Link wa.me/573016262603 es tappable
 *   - {nombre} se reemplaza correctamente
 *   - Acentos del nombre se quitan en el SMS (José → Jose)
 *
 * Usage: npx tsx scripts/test-blast-sms-5-team.ts
 */
import dotenv from 'dotenv'
dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })

import { sendSMS } from '@/lib/domain/sms'
import { calculateSMSSegments } from '@/lib/sms/utils'
import type { DomainContext } from '@/lib/domain/types'

const WORKSPACE_ID = '36a74890-aad6-4804-838c-57904b1c9328'

const TEST_RECIPIENTS: Array<{ phone: string; nombre: string }> = [
  { phone: '+573137549286', nombre: 'Jose' },
  { phone: '+573137549286', nombre: 'José' },     // ← acento intencional para validar strip
  { phone: '+573137549286', nombre: 'María' },    // ← acento intencional
  { phone: '+573137549286', nombre: 'Andrés' },   // ← acento intencional
  { phone: '+573137549286', nombre: 'Carlos' },
]

// === IDÉNTICO al buildSMSText de Plan 04 (Pattern 3 RESEARCH.md) ===
// CRITICAL: Use Unicode escape ̀-ͯ (combining diacritical marks block)
// instead of literal combining-mark bytes — copy-paste of literal bytes can be
// silently normalized away, producing a regex that matches NOTHING. (RESEARCH.md Pitfall 1)
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function isGSM7(s: string): boolean {
  return /^[\x20-\x7E\n\r]*$/.test(s)
}

function buildSMSText(rawName: string): string {
  const safeName = stripAccents(rawName).trim().split(/\s+/)[0]
  const personalized = `Hola ${safeName}, GoDentist cambio de numero. Para agendar tu cita odontologica escribenos por WhatsApp https://wa.me/573016262603`
  const fallback = `Hola, GoDentist cambio de numero. Para agendar tu cita odontologica escribenos por WhatsApp https://wa.me/573016262603`

  if (!isGSM7(personalized) || personalized.length > 160) {
    return fallback
  }
  return personalized
}

async function main() {
  if (TEST_RECIPIENTS.length !== 5) {
    console.error(`[test-sms] ERROR: TEST_RECIPIENTS debe tener 5 entries, tiene ${TEST_RECIPIENTS.length}.`)
    process.exit(1)
  }

  // Hard guard hora — defensive (Pitfall 3 RESEARCH.md)
  const colombiaHour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'America/Bogota', hour: 'numeric', hour12: false,
  }))
  if (colombiaHour < 8 || colombiaHour >= 21) {
    console.error(`[test-sms] Hora ${colombiaHour}h fuera de ventana 8AM-9PM Colombia. Abortando.`)
    process.exit(1)
  }

  console.log(`[test-sms] Enviando 5 SMS reales (costo: $485 COP @ workspace GoDentist)`)
  console.log(`[test-sms] Hora Colombia: ${colombiaHour}h ✓`)
  console.log()

  const ctx: DomainContext = { workspaceId: WORKSPACE_ID, source: 'script' }

  for (let i = 0; i < TEST_RECIPIENTS.length; i++) {
    const r = TEST_RECIPIENTS[i]
    const text = buildSMSText(r.nombre)
    const expectedSegs = calculateSMSSegments(text)

    console.log(`[${i + 1}/5] To: ${r.phone} | Name: ${r.nombre}`)
    console.log(`       Text (${text.length} chars, ~${expectedSegs} seg): ${text}`)

    if (expectedSegs > 1) {
      console.error(`       ⚠ ABORT: ${expectedSegs} segmentos esperados (debe ser 1).`)
      console.error(`       Revisar lógica buildSMSText antes de continuar.`)
      process.exit(1)
    }

    const result = await sendSMS(ctx, {
      phone: r.phone,
      message: text,
      source: 'campaign',  // D-12: regulatory marketing
      contactName: r.nombre,
    })

    if (!result.success) {
      console.error(`       ✗ ERROR: ${result.error}`)
      console.error(`       Abortando — investigar antes de blast masivo.`)
      process.exit(1)
    }

    console.log(`       ✓ Sent — segmentsUsed=${result.data!.segmentsUsed}, costCop=${result.data!.costCop}, dispatchId=${result.data!.dispatchId}`)

    if (result.data!.segmentsUsed > 1) {
      console.warn(`       ⚠ WARNING: Onurix reportó ${result.data!.segmentsUsed} segmentos. Strip de acentos podría no estar funcionando.`)
    }

    // Sleep 1.5s entre tests (no spam Onurix)
    if (i < TEST_RECIPIENTS.length - 1) {
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  console.log()
  console.log(`[test-sms] DONE. 5 SMS enviados al mismo número. Revisa el celular y confirma:`)
  console.log(`  1. Llegaron los 5 mensajes (vs delivery delay normal Onurix ~10s).`)
  console.log(`  2. Cada SMS muestra un nombre distinto: Jose, Jose (era José), Maria (era María), Andres (era Andrés), Carlos.`)
  console.log(`  3. Todos los acentos quitados (mensajes 2-4).`)
  console.log(`  4. Link wa.me/573016262603 es tappable y abre WhatsApp.`)
  console.log(`  5. Sender ID Onurix se ve OK.`)
  console.log(`  6. Texto completo, no truncado.`)
}

main().catch(err => {
  console.error('[test-sms] Fatal:', err)
  process.exit(1)
})
