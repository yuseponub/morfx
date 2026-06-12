/**
 * Campaña Prima Promoción GoDentist — WA template + SMS Onurix (jun 2026)
 *
 * Scope: Envía template `godentist_prima_promocion` (MARKETING, header IMAGE, body sin
 * variables) + SMS con link wa.me a 5.350 pacientes únicos del Excel
 * "VALORACIONES ASISTIDAS JUN 2025 - MAY 2026". TODOS reciben WA + SMS (sin A/B).
 *
 * Cadencia: lun-vie 10:30 + 14:30 Bogotá, 900 contactos/run × 2 runs/día = 1.800/día
 * (mismo régimen que blast experiment 2026-04/05), tasa interna ~60/min.
 *
 * SMS via domain layer (sendSMS) — billing al workspace GoDentist.
 * source='campaign' activa marketing window guard (8AM-9PM Colombia).
 * Texto SMS: 89 chars GSM-7 = 1 segmento (sin ñ ni tildes — doble billing si UCS-2).
 *
 * Tracking en JSON local:
 *   - godentist/pacientes-data/prima-promocion-state.json (offset + history)
 *   - godentist/pacientes-data/prima-promocion/sent.json (append-only)
 *   - godentist/pacientes-data/prima-promocion/skipped.csv
 *   - godentist/pacientes-data/prima-promocion/logs/
 *
 * Usage: npx tsx scripts/godentist-prima-promocion-campaign.ts [--limit N]
 *        --limit N = canary (procesa solo N contactos y avanza offset N)
 *        (en producción: invocado por scripts/godentist-prima-promocion-cron.sh via crontab)
 */

import dotenv from 'dotenv'
dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

import { sendSMS } from '@/lib/domain/sms'
import { calculateSMSSegments } from '@/lib/sms/utils'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// CONFIG
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WORKSPACE_ID = '36a74890-aad6-4804-838c-57904b1c9328'  // GoDentist
const TEMPLATE_NAME = 'godentist_prima_promocion'
const TEMPLATE_LANGUAGE = 'es'
// Header IMAGE del template (mismo asset subido al crear el template — URL pública Supabase)
const HEADER_IMAGE_URL = 'https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/templates/36a74890-aad6-4804-838c-57904b1c9328/1781209065172_WhatsApp_Image_2026-06-05_at_9.18.40_AM.jpeg'
const BATCH_SIZE = 900               // 900/run × 2 runs/día = 1.800/día
const DELAY_MS = 1000                // ~60/min interna (1 op/sec)
const SMS_INTRA_DELAY_MS = 500       // ~500ms entre WA y SMS del mismo paciente
const D360_BASE_URL = 'https://waba-v2.360dialog.io'

// SMS: 89 chars, GSM-7 puro (1 segmento). NO agregar ñ/tildes sin recalcular segmentos.
const SMS_TEXT = 'GoDentist: A un paso de la sonrisa de tus suenos, escribenos a https://wa.me/573016262603'

// Body del template renderizado (sin variables) — para messages.content.body (UI inbox)
const RENDERED_BODY = '¡Ya llegó la prima! godentist®️ te espera.\n\nEmpieza este semestre dando un paso más hacia la sonrisa de tus sueños. Agenda tu cita hoy, valoración GRATIS 3016262603.'

const DATA_DIR = '/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data'
// Overrides por env para retry-runs (dataset + state propios, sin tocar el offset principal)
const PATIENTS_FILE = process.env.CAMPAIGN_PATIENTS_FILE || path.join(DATA_DIR, 'prima-promocion-2026.json')
const STATE_FILE = process.env.CAMPAIGN_STATE_FILE || path.join(DATA_DIR, 'prima-promocion-state.json')
const CAMPAIGN_DIR = path.join(DATA_DIR, 'prima-promocion')
const SENT_FILE = path.join(CAMPAIGN_DIR, 'sent.json')
const SKIPPED_CSV_FILE = path.join(CAMPAIGN_DIR, 'skipped.csv')
const LOG_DIR = path.join(CAMPAIGN_DIR, 'logs')

// ============================================================================
// SUPABASE + 360DIALOG
// ============================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `+57${digits}`
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`
  return null
}

async function send360Template(
  apiKey: string, to: string, templateName: string, languageCode: string,
  components?: Array<{ type: string; parameters?: Array<{ type: string; text?: string; image?: { link: string } }> }>
) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  }
  const response = await fetch(`${D360_BASE_URL}/messages`, {
    method: 'POST',
    headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || `API error: ${response.status}`)
  return data
}

// ============================================================================
// STATE FILE
// ============================================================================

interface CampaignState {
  nextOffset: number
  totalPatients: number
  history: Array<{
    date: string
    offset: number
    count: number
    sent_wa: number
    errors_wa: number
    sent_sms: number
    errors_sms: number
  }>
}

function loadState(): CampaignState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  }
  return { nextOffset: 0, totalPatients: 0, history: [] }
}

function saveState(state: CampaignState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// ============================================================================
// SENT JSON + SKIPPED CSV
// ============================================================================

interface SentEntry {
  phone: string
  nombre: string
  date: string
  sent_wa_at: string | null
  sent_sms_at: string | null
  wa_error: string | null
  sms_error: string | null
}

function loadSent(): SentEntry[] {
  if (!fs.existsSync(SENT_FILE)) return []
  return JSON.parse(fs.readFileSync(SENT_FILE, 'utf-8'))
}

function saveSent(arr: SentEntry[]): void {
  fs.mkdirSync(CAMPAIGN_DIR, { recursive: true })
  fs.writeFileSync(SENT_FILE, JSON.stringify(arr, null, 2))
}

function appendSkipped(numero: string, nombre: string, razon: string): void {
  fs.mkdirSync(CAMPAIGN_DIR, { recursive: true })
  const isFirst = !fs.existsSync(SKIPPED_CSV_FILE)
  if (isFirst) fs.writeFileSync(SKIPPED_CSV_FILE, 'numero,nombre,razon_skip\n')
  const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
  fs.appendFileSync(SKIPPED_CSV_FILE, `${escape(numero)},${escape(nombre)},${escape(razon)}\n`)
}

// ============================================================================
// MAIN
// ============================================================================

interface PatientRaw {
  nombre: string
  apellido: string
  celular: string
  email: string
}

async function main() {
  const limitArg = process.argv.indexOf('--limit')
  const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : null
  const batchSize = limit && limit > 0 ? limit : BATCH_SIZE

  const now = new Date()
  const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const dayOfWeek = colombiaTime.getDay()
  const colombiaHour = colombiaTime.getHours()
  const timeStr = colombiaTime.toLocaleTimeString('es-CO', { hour12: false })
  const dateStr = colombiaTime.toISOString().split('T')[0]

  console.log(`=== GoDentist Prima Promoción Campaign ===`)
  console.log(`Colombia time: ${dateStr} ${timeStr} (day ${dayOfWeek}, hour ${colombiaHour})`)
  if (limit) console.log(`MODO CANARY: limit=${limit}`)

  // Skip fin de semana — defense-in-depth (el cron filter es primario)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('Fin de semana — no se envía. Saliendo.')
    return
  }

  // Hard-abort fuera de 8AM-9PM (marketing window — source='campaign' rechazaría los SMS)
  if (colombiaHour < 8 || colombiaHour >= 21) {
    console.error(`Hora ${colombiaHour}h fuera de ventana 8AM-9PM Colombia. Abortando.`)
    return
  }

  const state = loadState()
  if (!fs.existsSync(PATIENTS_FILE)) {
    console.error(`ERROR: ${PATIENTS_FILE} no existe.`)
    process.exit(1)
  }
  const allPatients: PatientRaw[] = JSON.parse(fs.readFileSync(PATIENTS_FILE, 'utf-8'))
  state.totalPatients = allPatients.length

  console.log(`Offset actual: ${state.nextOffset} / ${state.totalPatients}`)

  if (state.nextOffset >= allPatients.length) {
    console.log('Todos los pacientes ya fueron enviados. Saliendo.')
    return
  }

  const sliceStart = state.nextOffset
  const sliceEnd = Math.min(state.nextOffset + batchSize, allPatients.length)
  const slice = allPatients.slice(sliceStart, sliceEnd)
  console.log(`Slice: ${slice.length} pacientes (quedan ${allPatients.length - state.nextOffset})`)

  // Sanity SMS: debe ser 1 segmento GSM-7
  const segs = calculateSMSSegments(SMS_TEXT)
  if (segs > 1) {
    console.error(`SMS_TEXT calcula ${segs} segmentos (esperado 1). Abortando — revisar texto.`)
    process.exit(1)
  }

  // API key 360dialog
  const { data: workspace } = await supabase
    .from('workspaces').select('settings').eq('id', WORKSPACE_ID).single()
  const apiKey = (workspace?.settings as Record<string, string>)?.whatsapp_api_key
  if (!apiKey) {
    console.error('No API key for workspace GoDentist!')
    process.exit(1)
  }

  const results = { sent_wa: 0, errors_wa: 0, sent_sms: 0, errors_sms: 0, skipped: 0 }
  const errorLog: string[] = []
  const ctx: DomainContext = { workspaceId: WORKSPACE_ID, source: 'script' }
  const sentEntries = loadSent()

  for (let i = 0; i < slice.length; i++) {
    const p = slice[i]
    const fullName = `${p.nombre} ${p.apellido}`.trim()
    const phone = normalizePhone(p.celular)
    if (!phone) {
      appendSkipped(p.celular || '(empty)', fullName, 'phone_invalid')
      results.skipped++
      continue
    }

    const entry: SentEntry = {
      phone, nombre: fullName, date: dateStr,
      sent_wa_at: null, sent_sms_at: null, wa_error: null, sms_error: null,
    }
    sentEntries.push(entry)

    try {
      // === Contacto + conversación (upsert tolerante a 23505) ===
      let contactId: string | null = null
      const { data: existing } = await supabase
        .from('contacts').select('id').eq('workspace_id', WORKSPACE_ID).eq('phone', phone).single()

      if (existing) {
        contactId = existing.id
      } else {
        const { data: newContact, error: cErr } = await supabase
          .from('contacts')
          .insert({ workspace_id: WORKSPACE_ID, name: fullName, phone, email: p.email || null })
          .select('id').single()
        if (cErr?.code === '23505') {
          const { data: retry } = await supabase
            .from('contacts').select('id').eq('workspace_id', WORKSPACE_ID).eq('phone', phone).single()
          contactId = retry?.id || null
        } else {
          contactId = newContact?.id || null
        }
      }

      let conversationId: string | null = null
      const { data: existingConv } = await supabase
        .from('conversations').select('id')
        .eq('workspace_id', WORKSPACE_ID).eq('phone', phone).eq('channel', 'whatsapp').single()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({ workspace_id: WORKSPACE_ID, phone, phone_number_id: '', profile_name: fullName, contact_id: contactId, channel: 'whatsapp' })
          .select('id').single()
        if (convErr?.code === '23505') {
          const { data: retry } = await supabase
            .from('conversations').select('id')
            .eq('workspace_id', WORKSPACE_ID).eq('phone', phone).eq('channel', 'whatsapp').single()
          conversationId = retry?.id || null
        } else {
          conversationId = newConv?.id || null
        }
      }

      // === WA template (header IMAGE obligatorio en payload) ===
      const components = [
        { type: 'header', parameters: [{ type: 'image', image: { link: HEADER_IMAGE_URL } }] },
      ]
      const sendResult = await send360Template(apiKey, phone, TEMPLATE_NAME, TEMPLATE_LANGUAGE, components)
      const wamid = sendResult?.messages?.[0]?.id

      if (conversationId && wamid) {
        await supabase.from('messages').insert({
          conversation_id: conversationId, workspace_id: WORKSPACE_ID, wamid,
          direction: 'outbound', type: 'template',
          content: { body: RENDERED_BODY }, template_name: TEMPLATE_NAME,
          status: 'sent', timestamp: new Date().toISOString(),
        })
        await supabase.from('conversations').update({
          status: 'active', last_message_at: new Date().toISOString(),
          last_message_preview: `[Template] ${TEMPLATE_NAME}`,
        }).eq('id', conversationId)
      }

      results.sent_wa++
      entry.sent_wa_at = new Date().toISOString()

      // === SMS (todos) ===
      await new Promise(r => setTimeout(r, SMS_INTRA_DELAY_MS))
      const smsResult = await sendSMS(ctx, {
        phone,
        message: SMS_TEXT,
        source: 'campaign',
        contactName: fullName,
      })

      if (smsResult.success) {
        results.sent_sms++
        entry.sent_sms_at = new Date().toISOString()
        if (smsResult.data!.segmentsUsed > 1) {
          console.warn(`[${i}] ${phone} Onurix reportó ${smsResult.data!.segmentsUsed} segs (esperado 1)`)
        }
      } else {
        results.errors_sms++
        entry.sms_error = smsResult.error || 'unknown'
        appendSkipped(phone, fullName, 'sms_send_failed')
      }

      if (i % 100 === 0) console.log(`[${sliceStart + i}] WA=${results.sent_wa} SMS=${results.sent_sms}...`)
      if (i < slice.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errorLog.push(`[${sliceStart + i}] ${fullName} (${phone}): ${msg}`)
      results.errors_wa++
      entry.wa_error = msg
      appendSkipped(phone, fullName, 'wa_send_failed')
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  saveSent(sentEntries)

  state.nextOffset = sliceEnd
  state.history.push({
    date: `${dateStr} ${timeStr}`,
    offset: sliceStart,
    count: slice.length,
    sent_wa: results.sent_wa,
    errors_wa: results.errors_wa,
    sent_sms: results.sent_sms,
    errors_sms: results.errors_sms,
  })
  saveState(state)

  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  const logFile = path.join(LOG_DIR, `${dateStr}_${timeStr.replace(/:/g, '')}.log`)
  fs.writeFileSync(logFile, [
    `Date: ${dateStr} ${timeStr}`,
    `Slice: ${sliceStart}-${sliceEnd} (${slice.length} pacientes)`,
    `WA sent: ${results.sent_wa}, errors: ${results.errors_wa}`,
    `SMS sent: ${results.sent_sms}, errors: ${results.errors_sms}`,
    `Skipped: ${results.skipped}`,
    `Remaining: ${allPatients.length - state.nextOffset}`,
    ...(errorLog.length > 0 ? ['\nErrors:', ...errorLog] : []),
  ].join('\n'))

  console.log(`\n=== DONE ===`)
  console.log(`WA: ${results.sent_wa} sent, ${results.errors_wa} errors`)
  console.log(`SMS: ${results.sent_sms} sent, ${results.errors_sms} errors`)
  console.log(`Next offset: ${state.nextOffset} / ${allPatients.length}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
