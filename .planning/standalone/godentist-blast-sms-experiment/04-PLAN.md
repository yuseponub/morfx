---
phase: godentist-blast-sms-experiment
plan: 04
type: execute
wave: 3
depends_on: [01, 02, 03]
files_modified:
  - scripts/godentist-blast-experiment.ts
  - scripts/godentist-blast-experiment-cron.sh
autonomous: true
requirements:
  - D-04
  - D-05
  - D-06
  - D-08
  - D-09
  - D-10
  - D-11
  - D-12
  - D-14
  - D-16
  - D-17

must_haves:
  truths:
    - "scripts/godentist-blast-experiment.ts existe y es un clon ESTRUCTURAL de godentist-send-scheduled.ts (NO toca el original — D-17)"
    - "El script implementa A/B split determinista hash(phone) → 50/50 dentro del slice diario (D-05)"
    - "El script aplica accent strip ANTES de interpolar el SMS (CRITICAL finding RESEARCH.md)"
    - "El script llama sendSMS(ctx, params) con params.source='campaign' para grupo B (D-09 + D-12)"
    - "El script usa BATCH_SIZE=1800 y DELAY_MS=1000 (D-16)"
    - "El script skipea Saturday Y Sunday (D-14 lun-vie + Pitfall 8 defense-in-depth)"
    - "El script tiene early-exit si colombiaHour < 8 || >= 21 (Pitfall 3 defensive)"
    - "El script escribe blast-experiment-assignments.json append-only con shape AssignmentEntry"
    - "El script escribe blast-experiment-skipped.csv append-only con header numero,nombre,razon_skip"
    - "scripts/godentist-blast-experiment-cron.sh existe, es ejecutable, apunta al nuevo .ts y usa LOG_DIR distinto"
  artifacts:
    - path: "scripts/godentist-blast-experiment.ts"
      provides: "Script principal del blast con A/B + sendSMS integration"
      min_lines: 250
    - path: "scripts/godentist-blast-experiment-cron.sh"
      provides: "Wrapper bash para crontab (clon de godentist-send-cron.sh con paths nuevos)"
      min_lines: 18
  key_links:
    - from: "scripts/godentist-blast-experiment.ts"
      to: "src/lib/domain/sms.ts:sendSMS"
      via: "import + invocación con source='campaign'"
      pattern: "sendSMS\\(ctx,"
    - from: "scripts/godentist-blast-experiment.ts"
      to: "godentist/pacientes-data/pacientes-2019-2022.json"
      via: "fs.readFileSync + JSON.parse"
      pattern: "pacientes-2019-2022\\.json"
    - from: "scripts/godentist-blast-experiment.ts"
      to: "godentist/pacientes-data/blast-experiment/assignments.json"
      via: "fs.writeFileSync append-pattern"
      pattern: "assignments\\.json"
    - from: "scripts/godentist-blast-experiment-cron.sh"
      to: "scripts/godentist-blast-experiment.ts"
      via: "npx tsx invocation"
      pattern: "godentist-blast-experiment\\.ts"
---

<objective>
Implementar el script principal del experimento `scripts/godentist-blast-experiment.ts` (clon estructural de `godentist-send-scheduled.ts` con A/B split + sendSMS integration) y su wrapper bash `godentist-blast-experiment-cron.sh`. Después de Plan 05 (crontab swap), este script correrá automáticamente lun-vie 10:30 Bogotá.

Purpose: Materializar la lógica del experimento — todas las decisiones D-04..D-17 viven aquí. NO toca el script existente (D-17). Es el corazón ejecutable del standalone.

Output:
- `scripts/godentist-blast-experiment.ts` (~280 LoC esperadas)
  - Parser xlsx idempotente NO incluido (vive en Plan 01)
  - Lee `pacientes-2019-2022.json`
  - Slice diario 1.800 contactos (días 1-4) o 1.084 (día 5 — split 542/542)
  - A/B split determinista hash(phone) — 50/50
  - Loop: WA template (clon scheduled.ts:175-237) → sleep 500ms → SMS si grupo B (sendSMS) → sleep 500ms
  - State file `blast-experiment-state.json` con `experiment_progress` extendido
  - Append assignments JSON + skipped CSV por batch
  - Logs en `godentist/pacientes-data/blast-experiment/logs/`
- `scripts/godentist-blast-experiment-cron.sh` (~22 LoC) ejecutable

Cumple D-04 (CSV bounces), D-05 (hash A/B 50/50), D-06 (JSON tracking), D-08 (SMS simultáneo), D-09 (sendSMS domain), D-10 (texto opción B), D-11 (fallback nombre largo), D-12 (source='campaign'), D-14 (lun-vie), D-16 (DELAY_MS=1000), D-17 (script aislado).

NO ejecuta el script — solo lo crea. La ejecución es Plan 05+ (crontab) o manual single-batch test (Plan 05 Task 1).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-blast-sms-experiment/CONTEXT.md
@.planning/standalone/godentist-blast-sms-experiment/RESEARCH.md
@scripts/godentist-send-scheduled.ts
@scripts/godentist-send-cron.sh
@src/lib/domain/sms.ts
@src/lib/sms/utils.ts
@src/lib/sms/constants.ts
@CLAUDE.md
</context>

<interfaces>
<!-- Reuse map (cite-by-line from godentist-send-scheduled.ts) -->

```typescript
// Lines 16-17: dotenv ABSOLUTE path (CRITICAL for cron context — Pitfall 5)
import dotenv from 'dotenv'
dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })

// Lines 47-53: normalizePhone — clone verbatim (E.164 with +)
function normalizePhone(input: string): string | null { /* ... */ }

// Lines 55-78: send360Template — clone verbatim
async function send360Template(apiKey, to, templateName, languageCode, components) { /* ... */ }

// Lines 175-194: contact upsert with 23505 race handling — clone verbatim
// Lines 196-217: conversation upsert with 23505 race handling — clone verbatim
// Lines 219-237: send template + INSERT message + UPDATE conversation — clone verbatim
```

```typescript
// New imports from src/lib/domain/sms.ts (D-09)
import { sendSMS } from '@/lib/domain/sms'
import type { DomainContext } from '@/lib/domain/types'

// New built-in import for hash A/B (D-05)
import crypto from 'crypto'

// xlsx import — NOT here (parser is Plan 01 separate script)
```

**AssignmentEntry shape (D-06 — RESEARCH.md Pattern 5):**
```typescript
interface AssignmentEntry {
  phone: string                  // +57XXXXXXXXXX
  nombre: string                 // raw with accents
  group: 'A' | 'B'
  day: number                    // 1, 2, 3...
  date: string                   // YYYY-MM-DD Bogotá
  sent_wa_at: string | null
  sent_sms_at: string | null     // null if group A or SMS failed
  wa_error: string | null
  sms_error: string | null
}
```

**State file shape (extends scheduled.ts:84-94):**
```typescript
interface BlastState {
  nextOffset: number
  totalPatients: number
  history: Array<{
    date: string
    offset: number
    count: number
    sent: number
    errors: number
  }>
  experiment_progress: {
    grupo_a_sent: number
    grupo_b_sent: number
    total_sms_sent: number
    total_sms_failed: number
    total_sms_unpersisted: number  // sendSMS returned smsMessageId='unpersisted' (Pitfall 6)
  }
}
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear scripts/godentist-blast-experiment.ts</name>
  <read_first>
    - scripts/godentist-send-scheduled.ts (líneas 1-281 — clone source completo)
    - src/lib/domain/sms.ts:75-78 (sendSMS signature)
    - src/lib/sms/utils.ts:49-54 (calculateSMSSegments para fallback validation)
    - .planning/standalone/godentist-blast-sms-experiment/CONTEXT.md (D-04..D-17 todas)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (Patterns 1-7, Pitfalls 1-10, Examples 1-6)
  </read_first>
  <files>scripts/godentist-blast-experiment.ts</files>
  <action>
Crear el archivo NUEVO `scripts/godentist-blast-experiment.ts` (NO modificar `scripts/godentist-send-scheduled.ts` — D-17). Estructura exacta:

```typescript
/**
 * Blast Experiment GoDentist 2019-2022 — A/B WhatsApp + SMS
 *
 * Scope: Re-envía template `nuevo_numerov2` a 8.284 pacientes únicos GoDentist 2019-2022,
 * con split A/B 50/50 determinista por hash(phone). Grupo A = solo WA, Grupo B = WA + SMS Onurix.
 *
 * Cadencia: lun-vie 10:30 Bogotá, 1.800 contactos/día (días 1-4) + 1.084 día 5 (542/542),
 * tasa interna 60/min (DELAY_MS=1000, SMS dentro de loop ~+500ms).
 *
 * D-09: SMS via domain layer (sendSMS) — billing al workspace GoDentist a $97 COP/seg.
 * D-12: source='campaign' activa marketing window guard (8AM-9PM Colombia).
 *
 * Tracking en JSON local borrable post-estudio (D-06):
 *   - blast-experiment-state.json (offset + history + experiment_progress)
 *   - blast-experiment/assignments.json (append-only AssignmentEntry[])
 *   - blast-experiment/skipped.csv (append-only bounces)
 *   - blast-experiment/logs/cron_YYYY-MM-DD_HHMM.log
 *
 * NO contamina godentist-send-scheduled.ts (D-17 — script aparte).
 *
 * Usage: npx tsx scripts/godentist-blast-experiment.ts
 *        (en producción: invocado por scripts/godentist-blast-experiment-cron.sh via crontab)
 */

import dotenv from 'dotenv'
dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

import { sendSMS } from '@/lib/domain/sms'
import { calculateSMSSegments } from '@/lib/sms/utils'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// CONFIG
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WORKSPACE_ID = '36a74890-aad6-4804-838c-57904b1c9328'  // GoDentist
const TEMPLATE_NAME = 'nuevo_numerov2'
const TEMPLATE_LANGUAGE = 'es'
const BATCH_SIZE = 1800              // D-16: 1.800 contactos/día
const DELAY_MS = 1000                // D-16: 60/min interna (1 op/sec)
const SMS_INTRA_DELAY_MS = 500       // ~500ms entre WA y SMS del mismo paciente
const D360_BASE_URL = 'https://waba-v2.360dialog.io'

const DATA_DIR = '/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data'
const PATIENTS_FILE = path.join(DATA_DIR, 'pacientes-2019-2022.json')   // Generated by Plan 01
const STATE_FILE = path.join(DATA_DIR, 'blast-experiment-state.json')
const EXP_DIR = path.join(DATA_DIR, 'blast-experiment')
const ASSIGNMENTS_FILE = path.join(EXP_DIR, 'assignments.json')
const SKIPPED_CSV_FILE = path.join(EXP_DIR, 'skipped.csv')
const LOG_DIR = path.join(EXP_DIR, 'logs')

// ============================================================================
// SUPABASE + 360DIALOG
// ============================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// CLONE VERBATIM from godentist-send-scheduled.ts:47-53
function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `+57${digits}`
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`
  return null
}

// CLONE VERBATIM from godentist-send-scheduled.ts:55-78
async function send360Template(
  apiKey: string, to: string, templateName: string, languageCode: string,
  components?: Array<{ type: string; parameters?: Array<{ type: string; text?: string }> }>
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
// SMS RENDER (D-10, D-11, accent strip — RESEARCH.md Pattern 3)
// ============================================================================

// CRITICAL: Use Unicode escape ̀-ͯ (combining diacritical marks block U+0300..U+036F)
// instead of literal combining-mark bytes. Literal bytes in markdown can be silently
// normalized away during copy-paste, producing a regex matching NOTHING → accent strip
// silently no-ops → SMS becomes UCS-2 → 2 segments → DOUBLE BILLING. (RESEARCH.md Pitfall 1)
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function isGSM7(s: string): boolean {
  return /^[\x20-\x7E\n\r]*$/.test(s)
}

function buildSMSText(rawName: string): string {
  const safeName = stripAccents(rawName).trim().split(/\s+/)[0]
  const personalized = `Hola ${safeName}, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603`
  const fallback = `Hola, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603`
  // Two-gate fallback: encoding (defense vs missed-strip) OR length (defensive — won't trigger on this dataset)
  if (!isGSM7(personalized) || personalized.length > 160) {
    return fallback
  }
  return personalized
}

// ============================================================================
// A/B HASH SPLIT (D-05 — RESEARCH.md Pattern 2)
// ============================================================================

interface NormalizedPatient {
  phone: string         // +57XXXXXXXXXX
  nombre: string
  apellido: string
  email: string
}

function assignAB(slice: NormalizedPatient[]): {
  groupA: NormalizedPatient[]
  groupB: NormalizedPatient[]
  groupBPhones: Set<string>
} {
  const sorted = slice
    .map(p => ({ p, h: crypto.createHash('sha256').update(p.phone).digest('hex') }))
    .sort((a, b) => a.h.localeCompare(b.h))
    .map(x => x.p)
  const half = Math.floor(sorted.length / 2)
  const groupA = sorted.slice(0, half)
  const groupB = sorted.slice(half)
  return { groupA, groupB, groupBPhones: new Set(groupB.map(p => p.phone)) }
}

// ============================================================================
// STATE FILE (extends scheduled.ts:84-105)
// ============================================================================

interface BlastState {
  nextOffset: number
  totalPatients: number
  history: Array<{
    date: string
    offset: number
    count: number
    sent: number
    errors: number
  }>
  experiment_progress: {
    grupo_a_sent: number
    grupo_b_sent: number
    total_sms_sent: number
    total_sms_failed: number
    total_sms_unpersisted: number
  }
}

function loadState(): BlastState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  }
  return {
    nextOffset: 0,
    totalPatients: 0,
    history: [],
    experiment_progress: {
      grupo_a_sent: 0,
      grupo_b_sent: 0,
      total_sms_sent: 0,
      total_sms_failed: 0,
      total_sms_unpersisted: 0,
    },
  }
}

function saveState(state: BlastState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// ============================================================================
// ASSIGNMENTS JSON (D-06 — RESEARCH.md Example 5)
// ============================================================================

interface AssignmentEntry {
  phone: string
  nombre: string
  group: 'A' | 'B'
  day: number
  date: string
  sent_wa_at: string | null
  sent_sms_at: string | null
  wa_error: string | null
  sms_error: string | null
}

function loadAssignments(): AssignmentEntry[] {
  if (!fs.existsSync(ASSIGNMENTS_FILE)) return []
  return JSON.parse(fs.readFileSync(ASSIGNMENTS_FILE, 'utf-8'))
}

function saveAssignments(arr: AssignmentEntry[]): void {
  fs.mkdirSync(EXP_DIR, { recursive: true })
  fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(arr, null, 2))
}

// ============================================================================
// SKIPPED CSV (D-04 — RESEARCH.md Example 6)
// ============================================================================

function appendSkipped(numero: string, nombre: string, razon: string): void {
  fs.mkdirSync(EXP_DIR, { recursive: true })
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
  fecha_creacion: string
}

async function main() {
  const now = new Date()
  const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const dayOfWeek = colombiaTime.getDay() // 0=Sun, 6=Sat
  const colombiaHour = colombiaTime.getHours()
  const timeStr = colombiaTime.toLocaleTimeString('es-CO', { hour12: false })
  const dateStr = colombiaTime.toISOString().split('T')[0]

  console.log(`=== GoDentist Blast Experiment ===`)
  console.log(`Colombia time: ${dateStr} ${timeStr} (day ${dayOfWeek}, hour ${colombiaHour})`)

  // D-14: Skip Saturday and Sunday — defense-in-depth (cron filter is primary)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('Fin de semana — no se envía. Saliendo.')
    return
  }

  // Pitfall 3: Hard-abort if outside 8AM-9PM (D-12 source='campaign' would reject all SMS)
  if (colombiaHour < 8 || colombiaHour >= 21) {
    console.error(`Hora ${colombiaHour}h fuera de ventana 8AM-9PM Colombia. Abortando para integridad del experimento.`)
    console.error(`(Si el cron se atrasó, espera al próximo día hábil — NO retry tarde.)`)
    return
  }

  // Load state
  const state = loadState()
  if (!fs.existsSync(PATIENTS_FILE)) {
    console.error(`ERROR: ${PATIENTS_FILE} no existe. Ejecutar Plan 01 (parser xlsx) primero.`)
    process.exit(1)
  }
  const allPatients: PatientRaw[] = JSON.parse(fs.readFileSync(PATIENTS_FILE, 'utf-8'))
  state.totalPatients = allPatients.length

  console.log(`Offset actual: ${state.nextOffset} / ${state.totalPatients}`)

  if (state.nextOffset >= allPatients.length) {
    console.log('Todos los pacientes ya fueron enviados. Saliendo.')
    return
  }

  // Get today's slice
  const sliceStart = state.nextOffset
  const sliceEnd = Math.min(state.nextOffset + BATCH_SIZE, allPatients.length)
  const slice = allPatients.slice(sliceStart, sliceEnd)
  const remaining = allPatients.length - state.nextOffset
  console.log(`Slice: ${slice.length} pacientes (quedan ${remaining})`)

  // Determine "day number" — count distinct dates in history + 1
  const dayNumber = state.history.length + 1
  console.log(`Día del experimento: ${dayNumber}`)

  // Normalize phones in slice (skip invalid)
  const normalizedSlice: NormalizedPatient[] = []
  for (const p of slice) {
    const phone = normalizePhone(p.celular)
    if (!phone) {
      appendSkipped(p.celular || '(empty)', `${p.nombre} ${p.apellido}`.trim(), 'phone_invalid')
      continue
    }
    normalizedSlice.push({
      phone,
      nombre: p.nombre,
      apellido: p.apellido,
      email: p.email,
    })
  }

  console.log(`Normalizables en slice: ${normalizedSlice.length} / ${slice.length}`)

  // D-05: A/B split determinista hash(phone)
  const { groupA, groupB, groupBPhones } = assignAB(normalizedSlice)
  console.log(`Grupo A (solo WA): ${groupA.length}`)
  console.log(`Grupo B (WA + SMS): ${groupB.length}`)

  // Append assignments BEFORE sending (recover from crash)
  const newAssignments: AssignmentEntry[] = normalizedSlice.map(p => ({
    phone: p.phone,
    nombre: p.nombre,
    group: groupBPhones.has(p.phone) ? 'B' : 'A',
    day: dayNumber,
    date: dateStr,
    sent_wa_at: null,
    sent_sms_at: null,
    wa_error: null,
    sms_error: null,
  }))
  const allAssignments = [...loadAssignments(), ...newAssignments]
  saveAssignments(allAssignments)

  // Track current-batch indices in allAssignments for fast in-place update
  const baseIdx = allAssignments.length - newAssignments.length
  const phoneToIdx = new Map<string, number>()
  for (let i = 0; i < newAssignments.length; i++) {
    phoneToIdx.set(newAssignments[i].phone, baseIdx + i)
  }

  // Get API key
  const { data: workspace } = await supabase
    .from('workspaces').select('settings').eq('id', WORKSPACE_ID).single()
  const apiKey = (workspace?.settings as Record<string, string>)?.whatsapp_api_key
  if (!apiKey) {
    console.error('No API key for workspace GoDentist!')
    process.exit(1)
  }

  // Process loop
  const results = {
    sent_wa: 0, skipped: 0, errors_wa: 0,
    sent_sms: 0, errors_sms: 0, unpersisted_sms: 0,
  }
  const errorLog: string[] = []
  // Two source levels (RESEARCH.md File Reuse Map):
  //   ctx.source = 'script' (operational taxonomy — used by RPC for audit)
  //   params.source = 'campaign' (regulatory taxonomy — activates 8AM-9PM marketing window)
  const ctx: DomainContext = { workspaceId: WORKSPACE_ID, source: 'script' }

  for (let i = 0; i < normalizedSlice.length; i++) {
    const p = normalizedSlice[i]
    const fullName = `${p.nombre} ${p.apellido}`.trim()
    const isGroupB = groupBPhones.has(p.phone)
    const assignmentIdx = phoneToIdx.get(p.phone)!

    try {
      // === WA send (both groups) — CLONE scheduled.ts:175-237 ===
      let contactId: string | null = null
      const { data: existing } = await supabase
        .from('contacts').select('id').eq('workspace_id', WORKSPACE_ID).eq('phone', p.phone).single()

      if (existing) {
        contactId = existing.id
      } else {
        const { data: newContact, error: cErr } = await supabase
          .from('contacts')
          .insert({ workspace_id: WORKSPACE_ID, name: fullName, phone: p.phone, email: p.email || null })
          .select('id').single()
        if (cErr?.code === '23505') {
          const { data: retry } = await supabase
            .from('contacts').select('id').eq('workspace_id', WORKSPACE_ID).eq('phone', p.phone).single()
          contactId = retry?.id || null
        } else {
          contactId = newContact?.id || null
        }
      }

      let conversationId: string | null = null
      const { data: existingConv } = await supabase
        .from('conversations').select('id')
        .eq('workspace_id', WORKSPACE_ID).eq('phone', p.phone).eq('channel', 'whatsapp').single()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({ workspace_id: WORKSPACE_ID, phone: p.phone, phone_number_id: '', profile_name: fullName, contact_id: contactId, channel: 'whatsapp' })
          .select('id').single()
        if (convErr?.code === '23505') {
          const { data: retry } = await supabase
            .from('conversations').select('id')
            .eq('workspace_id', WORKSPACE_ID).eq('phone', p.phone).eq('channel', 'whatsapp').single()
          conversationId = retry?.id || null
        } else {
          conversationId = newConv?.id || null
        }
      }

      // Send WA template (D-10 keep accents in WA — only SMS strips)
      const components = [{ type: 'body', parameters: [{ type: 'text', text: p.nombre || fullName }] }]
      const renderedText = `Hola ${p.nombre} 👋🏻 Te saluda Clínicas Odontológicas GoDentist®️.\n\nNuestro número de WhatsApp cambió.\nESTE es nuestro numero 📲 3016262603\n\nDesde ahora, si deseas agendar cita o tienes alguna duda, escribenos a este numero😊`

      const sendResult = await send360Template(apiKey, p.phone, TEMPLATE_NAME, TEMPLATE_LANGUAGE, components)
      const wamid = sendResult?.messages?.[0]?.id

      if (conversationId && wamid) {
        await supabase.from('messages').insert({
          conversation_id: conversationId, workspace_id: WORKSPACE_ID, wamid,
          direction: 'outbound', type: 'template',
          content: { body: renderedText }, template_name: TEMPLATE_NAME,
          status: 'sent', timestamp: new Date().toISOString(),
        })
        await supabase.from('conversations').update({
          status: 'active', last_message_at: new Date().toISOString(),
          last_message_preview: `[Template] ${TEMPLATE_NAME}`,
        }).eq('id', conversationId)
      }

      results.sent_wa++
      const waSentAt = new Date().toISOString()
      allAssignments[assignmentIdx].sent_wa_at = waSentAt

      // === SMS send (group B only) — D-08 ~2s después ===
      if (isGroupB) {
        await new Promise(r => setTimeout(r, SMS_INTRA_DELAY_MS))

        const smsText = buildSMSText(p.nombre)
        const expectedSegs = calculateSMSSegments(smsText)
        if (expectedSegs > 1) {
          // Defensive — should never happen post-strip, but log if does
          console.warn(`[${i}] ${p.phone} expected ${expectedSegs} seg pre-send for "${p.nombre}"`)
        }

        const smsResult = await sendSMS(ctx, {
          phone: p.phone,
          message: smsText,
          source: 'campaign',  // D-12 — regulatory
          contactName: fullName,
        })

        if (smsResult.success) {
          results.sent_sms++
          allAssignments[assignmentIdx].sent_sms_at = new Date().toISOString()
          if (smsResult.data!.smsMessageId === 'unpersisted') {
            results.unpersisted_sms++  // Pitfall 6
          }
          if (smsResult.data!.segmentsUsed > 1) {
            console.warn(`[${i}] ${p.phone} Onurix reported ${smsResult.data!.segmentsUsed} segs (expected 1)`)
          }
        } else {
          results.errors_sms++
          allAssignments[assignmentIdx].sms_error = smsResult.error || 'unknown'
          appendSkipped(p.phone, fullName, 'sms_send_failed')
        }
      }

      // Progress
      if (i % 100 === 0) console.log(`[${sliceStart + i}] WA=${results.sent_wa} SMS=${results.sent_sms} (B=${results.sent_sms + results.errors_sms})...`)

      if (i < normalizedSlice.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errorLog.push(`[${sliceStart + i}] ${fullName} (${p.phone}): ${msg}`)
      results.errors_wa++
      allAssignments[assignmentIdx].wa_error = msg
      appendSkipped(p.phone, fullName, 'wa_send_failed')
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  // Persist final assignments state
  saveAssignments(allAssignments)

  // Update state
  state.nextOffset = sliceEnd
  state.history.push({
    date: `${dateStr} ${timeStr}`,
    offset: sliceStart,
    count: slice.length,
    sent: results.sent_wa,
    errors: results.errors_wa,
  })
  state.experiment_progress.grupo_a_sent += groupA.length
  state.experiment_progress.grupo_b_sent += groupB.length
  state.experiment_progress.total_sms_sent += results.sent_sms
  state.experiment_progress.total_sms_failed += results.errors_sms
  state.experiment_progress.total_sms_unpersisted += results.unpersisted_sms
  saveState(state)

  // Save log
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  const logFile = path.join(LOG_DIR, `${dateStr}_${timeStr.replace(/:/g, '')}.log`)
  const logContent = [
    `Date: ${dateStr} ${timeStr}`,
    `Day: ${dayNumber}`,
    `Slice: ${sliceStart}-${sliceEnd} (${slice.length} pacientes raw, ${normalizedSlice.length} normalizables)`,
    `Group A: ${groupA.length} | Group B: ${groupB.length}`,
    `WA sent: ${results.sent_wa}, errors: ${results.errors_wa}`,
    `SMS sent: ${results.sent_sms}, errors: ${results.errors_sms}, unpersisted: ${results.unpersisted_sms}`,
    `Skipped (invalid phones in slice): ${slice.length - normalizedSlice.length}`,
    `Remaining: ${allPatients.length - state.nextOffset}`,
    ...(errorLog.length > 0 ? ['\nErrors:', ...errorLog] : []),
  ].join('\n')
  fs.writeFileSync(logFile, logContent)

  console.log(`\n=== DONE ===`)
  console.log(`WA: ${results.sent_wa} sent, ${results.errors_wa} errors`)
  console.log(`SMS: ${results.sent_sms} sent, ${results.errors_sms} errors, ${results.unpersisted_sms} unpersisted`)
  console.log(`Next offset: ${state.nextOffset} / ${allPatients.length}`)
  console.log(`Remaining: ${allPatients.length - state.nextOffset}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
```

Decisiones clave del script:
- **Clon estructural de `scheduled.ts`** (D-17): NO modifica el original, vive en archivo aparte.
- **Accent strip ANTES del SMS** (RESEARCH.md finding 1 CRITICAL): garantiza 1 segmento.
- **Regex `̀-ͯ` Unicode escape (NO literal bytes)** — copy-paste de literal combining-mark bytes en markdown puede normalizarse y quedar regex vacío que no matchea nada → strip silenciosamente no-op → 2 segmentos → DOUBLE BILLING en ~406 nombres con acentos. Pitfall 1 RESEARCH.md.
- **WA template mantiene acentos**: D-10 sólo aplica al SMS — WA es UTF-8 safe.
- **Two-gate fallback** (RESEARCH.md Pattern 3): encoding check + length check para defensa profunda.
- **A/B append a JSON ANTES de enviar** (recover from crash): si el script crashea mid-batch, sabemos quién recibió qué.
- **Hard guard hora** (Pitfall 3): aborta si está fuera de 8AM-9PM para no romper integridad del experimento.
- **Saturday + Sunday skip** (D-14 + Pitfall 8): defense-in-depth aunque cron filter sea `1-5`.
- **`source='campaign'` en sendSMS params** (D-12): activa marketing window guard.
- **`unpersisted_sms` tracking** (Pitfall 6): si Onurix entrega pero RPC falla, lo contamos para reconciliación manual.
- **`source: 'script'` en ctx, `source: 'campaign'` en params**: dos taxonomías separadas (RESEARCH.md File Reuse Map). `ctx.source` = operational (audit), `params.source` = regulatory (window guard).
- **Path alias `@/lib/...`**: tsx resuelve desde `tsconfig.json` paths. Si falla en cron, ver Pitfall 5 — el wrapper sourcea NVM y corre desde project root, así que paths deben resolverse.
  </action>
  <verify>
    <automated>test -f scripts/godentist-blast-experiment.ts && grep -c "sendSMS" scripts/godentist-blast-experiment.ts | xargs test 2 -le && grep -c "stripAccents" scripts/godentist-blast-experiment.ts | xargs test 2 -le && grep -c "source: 'campaign'" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "source: 'script'" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "DomainContext" scripts/godentist-blast-experiment.ts | xargs test 2 -le && grep -c "BATCH_SIZE = 1800" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "DELAY_MS = 1000" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "createHash('sha256')" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "dayOfWeek === 6" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "colombiaHour < 8" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "blast-experiment-state\.json" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "assignments\.json" scripts/godentist-blast-experiment.ts | xargs test 1 -le && grep -c "\\\\u0300" scripts/godentist-blast-experiment.ts | xargs test 1 -le && node -e "const s='José'.normalize('NFD').replace(/[̀-ͯ]/g,''); if(s!=='Jose')process.exit(1)" && cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit --skipLibCheck scripts/godentist-blast-experiment.ts 2>&1 | grep -v "Cannot find module '@/" | wc -l | xargs test 0 -le</automated>
  </verify>
  <acceptance_criteria>
    - `test -f scripts/godentist-blast-experiment.ts` returns 0
    - `grep -c "sendSMS" ...` returns ≥ 2 (import + invocation) — D-09
    - `grep -c "stripAccents" ...` returns ≥ 2 (def + use) — RESEARCH.md finding 1
    - `grep -c "source: 'campaign'" ...` returns ≥ 1 — D-12 (regulatory taxonomy in params)
    - `grep -c "source: 'script'" ...` returns ≥ 1 — operational taxonomy in ctx (RESEARCH.md File Reuse Map line 183)
    - `grep -c "DomainContext" ...` returns ≥ 2 — type import + use site (dual source taxonomy verification)
    - `grep -c "BATCH_SIZE = 1800" ...` returns ≥ 1 — D-16
    - `grep -c "DELAY_MS = 1000" ...` returns ≥ 1 — D-16
    - `grep -c "createHash('sha256')" ...` returns ≥ 1 — D-05
    - `grep -c "dayOfWeek === 6" ...` returns ≥ 1 — D-14 Saturday skip
    - `grep -c "colombiaHour < 8" ...` returns ≥ 1 — Pitfall 3 hard guard
    - `grep -c "wa.me/573016262603" ...` returns ≥ 2 — SMS personalized + fallback
    - `grep -c "blast-experiment-state.json" ...` returns ≥ 1
    - `grep -c "assignments.json" ...` returns ≥ 1
    - `grep -c "skipped.csv" ...` returns ≥ 1 — D-04
    - `grep -c "experiment_progress" ...` returns ≥ 3 (declaration + state + updates)
    - `grep -c "godentist-send-scheduled.ts" ...` returns 0 (D-17 — no contamina el original)
    - `grep -c "\\u0300" scripts/godentist-blast-experiment.ts` returns ≥ 1 — Unicode escape used (Pitfall 1: literal combining-mark bytes copy-paste fragile)
    - `node -e "const s='José'.normalize('NFD').replace(/[̀-ͯ]/g,''); if(s!=='Jose')process.exit(1)"` returns exit code 0 — behavioral test that stripAccents regex actually strips the diacritic
    - `npx tsc --noEmit --skipLibCheck scripts/godentist-blast-experiment.ts` produces 0 errors (excluding `@/` alias resolution warnings which tsx handles at runtime) — catches syntax errors that grep-only verification would miss
  </acceptance_criteria>
  <done>Script principal del blast creado, ~280 LoC, todas las decisiones D-04..D-17 implementadas, NO toca el script existente. Listo para single-batch test (Plan 05).</done>
</task>

<task type="auto">
  <name>Task 2: Crear scripts/godentist-blast-experiment-cron.sh y hacerlo ejecutable</name>
  <read_first>
    - scripts/godentist-send-cron.sh (clone source completo — 22 líneas)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (Example 4 wrapper template, Pitfall 5 cron pitfalls)
    - .planning/standalone/godentist-blast-sms-experiment/CONTEXT.md (D-14 paths)
  </read_first>
  <files>scripts/godentist-blast-experiment-cron.sh</files>
  <action>
Crear el archivo NUEVO `scripts/godentist-blast-experiment-cron.sh` con contenido:

```bash
#!/bin/bash
# Wrapper for cron — runs the blast experiment script.
# Logs output to godentist/pacientes-data/blast-experiment/logs/

cd /mnt/c/Users/Usuario/Proyectos/morfx-new

LOG_DIR="godentist/pacientes-data/blast-experiment/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(TZ='America/Bogota' date '+%Y-%m-%d_%H%M')
LOG_FILE="$LOG_DIR/cron_${TIMESTAMP}.log"

echo "=== Blast cron started at $(TZ='America/Bogota' date) ===" >> "$LOG_FILE"

# Load nvm/node (cron context has minimal env — Pitfall 5)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

npx tsx scripts/godentist-blast-experiment.ts >> "$LOG_FILE" 2>&1

echo "=== Blast cron finished at $(TZ='America/Bogota' date) ===" >> "$LOG_FILE"
```

Después de crear el archivo, hacerlo ejecutable:
```bash
chmod +x /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
```

Diferencias vs `godentist-send-cron.sh`:
- LOG_DIR distinto: `godentist/pacientes-data/blast-experiment/logs` (separado del cron anterior — RESEARCH.md File Reuse Map).
- Invoca `godentist-blast-experiment.ts` en lugar de `godentist-send-scheduled.ts`.
- Mensajes log con prefix "Blast cron" para distinguir en `journalctl` o `tail -f`.
- TODO lo demás (cd, NVM, tsx, redirect) idéntico — Pitfall 5 está cubierto.
  </action>
  <verify>
    <automated>test -f scripts/godentist-blast-experiment-cron.sh && test -x scripts/godentist-blast-experiment-cron.sh && grep -c "godentist-blast-experiment.ts" scripts/godentist-blast-experiment-cron.sh | xargs test 1 -le && grep -c "blast-experiment/logs" scripts/godentist-blast-experiment-cron.sh | xargs test 1 -le && grep -c "NVM_DIR" scripts/godentist-blast-experiment-cron.sh | xargs test 1 -le</automated>
  </verify>
  <acceptance_criteria>
    - `test -f scripts/godentist-blast-experiment-cron.sh` returns 0
    - `test -x scripts/godentist-blast-experiment-cron.sh` returns 0 (executable bit)
    - `grep -c "godentist-blast-experiment.ts" scripts/godentist-blast-experiment-cron.sh` returns ≥ 1 (no apunta al script anterior)
    - `grep -c "godentist-send-scheduled.ts" scripts/godentist-blast-experiment-cron.sh` returns 0 (NO referencia al script anterior)
    - `grep -c "blast-experiment/logs" scripts/godentist-blast-experiment-cron.sh` returns ≥ 1 (LOG_DIR separado)
    - `grep -c "NVM_DIR" scripts/godentist-blast-experiment-cron.sh` returns ≥ 1 (Pitfall 5 covered)
    - `head -1 scripts/godentist-blast-experiment-cron.sh` returns `#!/bin/bash`
  </acceptance_criteria>
  <done>Wrapper bash creado, ejecutable, apunta al nuevo .ts, LOG_DIR separado del cron anterior. Listo para crontab swap (Plan 05).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cron WSL → Node script | Wrapper sources NVM, invokes tsx |
| Script → Supabase prod | Direct service-role client (bypass RLS) — same pattern as scheduled.ts |
| Script → Onurix (via domain) | sendSMS handles credentials, atomic RPC, audit |
| Script → 360dialog | API key from workspaces.settings — no secret rotation needed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-blast-04-01 | Tampering | accent-strip bypass causing UCS-2 → 2x cost | mitigate | Two-gate fallback: encoding regex + length check; calculateSMSSegments pre-send warning; Unicode escape `̀-ͯ` instead of literal bytes (Pitfall 1) |
| T-blast-04-02 | DoS | Script ejecutado fuera de horario, rejecta 1.800 SMS | mitigate | Hard guard `colombiaHour < 8 \|\| >= 21` antes de empezar |
| T-blast-04-03 | Tampering | Same phone in groups A and B (experiment pollution) | mitigate | Dedup en Plan 01 + assignAB usa Set para dedup defensivo |
| T-blast-04-04 | DoS | Crash mid-batch perdiendo tracking | mitigate | Append assignments BEFORE sending; per-message in-place update + final saveAssignments |
| T-blast-04-05 | Information Disclosure | unpersisted SMS no contabilizado en saldo | mitigate | Track `total_sms_unpersisted` en state file; CSV manual reconciliation |
| T-blast-04-06 | Spoofing | WA template inyectando contenido falso por nombre malicioso | accept | Lista 2019-2022 source-controlled, no user input |
</threat_model>

<verification>
- Script principal existe con todas las decisiones D-04..D-17 implementadas (15+ grep checks + tsc + behavioral test).
- Wrapper bash existe, ejecutable, apunta al nuevo .ts.
- NO modifica el script existente `godentist-send-scheduled.ts` (verificar con `git diff scripts/godentist-send-scheduled.ts` — debe ser empty).
</verification>

<success_criteria>
- `scripts/godentist-blast-experiment.ts` creado con ~280 LoC y todas las verificaciones grep + tsc + behavioral test pasan
- `scripts/godentist-blast-experiment-cron.sh` creado, ejecutable
- `scripts/godentist-send-scheduled.ts` SIN cambios (D-17)
- Listo para single-batch test (Plan 05)
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-blast-sms-experiment/04-SUMMARY.md` registrando:
- Total LoC del script principal
- Mapping D-decision → file:line donde se implementa cada una
- Confirmación que `godentist-send-scheduled.ts` está sin cambios (`git diff --stat`)
- Lista de imports añadidos vs el clone source (`crypto`, `sendSMS`, `calculateSMSSegments`, `DomainContext`)
</output>
</output>
