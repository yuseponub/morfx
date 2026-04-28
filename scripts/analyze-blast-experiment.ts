/**
 * Analyzer GoDentist Blast Experiment A/B — métrica D-07 (inbound 3d post-WA)
 *
 * Lee assignments.json (Plan 04 output) + queries messages table (workspace GoDentist)
 * para computar tasa de respuesta por grupo y lift de B (WA+SMS) vs A (solo WA).
 *
 * Modos (autodetectados):
 *   - INTERMEDIO: ventana 3d aún no cerrada para todos los pacientes
 *   - FINAL: ventana 3d cerrada para 100% de pacientes con sent_wa_at != null
 *
 * Idempotente: solo lee — no muta DB ni FS.
 *
 * Usage:
 *   npx tsx scripts/analyze-blast-experiment.ts
 *   npx tsx scripts/analyze-blast-experiment.ts --sample-size 10
 *   npx tsx scripts/analyze-blast-experiment.ts --min-window-hours 72
 *
 * Capturar output:
 *   npx tsx scripts/analyze-blast-experiment.ts | tee .planning/standalone/godentist-blast-sms-experiment/FINAL-ANALYSIS.txt
 */

import dotenv from 'dotenv'
dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WORKSPACE_ID = '36a74890-aad6-4804-838c-57904b1c9328'  // GoDentist
const ASSIGNMENTS_FILE = '/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/assignments.json'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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

interface AnalysisResult {
  total: number
  enviados_wa: number
  ventana_completa: number
  inbound_3d: number
  rate: number
  samples: Array<{ phone: string; nombre: string; preview: string; received_at: string }>
}

// CLI arg parser: extracts --name value from process.argv
function getArg(name: string, defaultVal: string): string {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx < 0 || idx + 1 >= process.argv.length) return defaultVal
  return process.argv[idx + 1]
}

const SAMPLE_SIZE = parseInt(getArg('sample-size', '5'))
const MIN_WINDOW_HOURS = parseInt(getArg('min-window-hours', '72'))
const SAMPLE_PREVIEW_CHARS = 200

interface InboundCheckResult {
  hasInbound: boolean
  sample: { content: any; timestamp: string } | null
}

async function checkInboundIn3d(phone: string, sentWaAt: string): Promise<InboundCheckResult> {
  const sentMs = new Date(sentWaAt).getTime()
  const windowEnd = new Date(sentMs + 3 * 24 * 60 * 60 * 1000).toISOString()

  // Get conversation IDs for this phone in GoDentist workspace
  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .eq('workspace_id', WORKSPACE_ID)
    .eq('phone', phone)
    .eq('channel', 'whatsapp')

  if (!convs || convs.length === 0) {
    return { hasInbound: false, sample: null }
  }

  const convIds = convs.map(c => c.id)

  // Look for inbound messages in the 3d window
  const { data: msgs } = await supabase
    .from('messages')
    .select('content, timestamp')
    .in('conversation_id', convIds)
    .eq('direction', 'inbound')
    .gte('timestamp', sentWaAt)
    .lte('timestamp', windowEnd)
    .order('timestamp', { ascending: true })
    .limit(1)

  if (!msgs || msgs.length === 0) {
    return { hasInbound: false, sample: null }
  }

  return { hasInbound: true, sample: { content: msgs[0].content, timestamp: msgs[0].timestamp } }
}

async function analyzeGroup(entries: AssignmentEntry[], groupLabel: 'A' | 'B'): Promise<AnalysisResult> {
  const result: AnalysisResult = {
    total: entries.length,
    enviados_wa: 0,
    ventana_completa: 0,
    inbound_3d: 0,
    rate: 0,
    samples: [],
  }

  const nowMs = Date.now()

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (!e.sent_wa_at) continue
    result.enviados_wa++

    const sentMs = new Date(e.sent_wa_at).getTime()
    const hoursElapsed = (nowMs - sentMs) / (1000 * 60 * 60)

    if (hoursElapsed < MIN_WINDOW_HOURS) continue
    result.ventana_completa++

    const check = await checkInboundIn3d(e.phone, e.sent_wa_at)
    if (check.hasInbound) {
      result.inbound_3d++
      if (result.samples.length < SAMPLE_SIZE && check.sample) {
        const body = (check.sample.content as any)?.body || JSON.stringify(check.sample.content)
        const preview = String(body).slice(0, SAMPLE_PREVIEW_CHARS)
        result.samples.push({
          phone: e.phone,
          nombre: e.nombre,
          preview,
          received_at: check.sample.timestamp,
        })
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  [Group ${groupLabel}] processed ${i + 1}/${entries.length}...`)
    }
  }

  result.rate = result.ventana_completa > 0 ? result.inbound_3d / result.ventana_completa : 0
  return result
}

function formatPct(rate: number): string {
  return (rate * 100).toFixed(2) + '%'
}

async function main() {
  if (!fs.existsSync(ASSIGNMENTS_FILE)) {
    console.error(`ERROR: ${ASSIGNMENTS_FILE} no existe.`)
    console.error(`Ejecutar Plan 04 (cron run) primero — el archivo se crea cuando dispara el primer batch.`)
    process.exit(1)
  }

  const assignments: AssignmentEntry[] = JSON.parse(fs.readFileSync(ASSIGNMENTS_FILE, 'utf-8'))

  console.log(`=== GoDentist Blast Experiment — Análisis A/B ===`)
  console.log(`Assignments file: ${ASSIGNMENTS_FILE}`)
  console.log(`Total assignments: ${assignments.length}`)
  console.log(`Min window hours: ${MIN_WINDOW_HOURS} (${MIN_WINDOW_HOURS / 24}d)`)
  console.log(`Sample size: ${SAMPLE_SIZE}`)
  console.log()

  const groupA = assignments.filter(a => a.group === 'A')
  const groupB = assignments.filter(a => a.group === 'B')
  console.log(`Group A (solo WA): ${groupA.length}`)
  console.log(`Group B (WA + SMS): ${groupB.length}`)
  console.log()

  console.log(`Analizando Group A...`)
  const resA = await analyzeGroup(groupA, 'A')
  console.log()

  console.log(`Analizando Group B...`)
  const resB = await analyzeGroup(groupB, 'B')
  console.log()

  // Modo intermedio vs final
  const isFinalA = resA.ventana_completa === resA.enviados_wa
  const isFinalB = resB.ventana_completa === resB.enviados_wa
  const isFinal = isFinalA && isFinalB

  console.log('=== RESULTADOS ===')
  console.log(isFinal ? 'Modo: ANÁLISIS FINAL (ventana 3d cerrada para todos)' : `Modo: ANÁLISIS INTERMEDIO (pendientes A=${resA.enviados_wa - resA.ventana_completa}, B=${resB.enviados_wa - resB.ventana_completa})`)
  console.log()

  console.log('| Métrica            | Group A     | Group B     |')
  console.log('|--------------------|-------------|-------------|')
  console.log(`| total              | ${String(resA.total).padEnd(11)} | ${String(resB.total).padEnd(11)} |`)
  console.log(`| enviados_wa        | ${String(resA.enviados_wa).padEnd(11)} | ${String(resB.enviados_wa).padEnd(11)} |`)
  console.log(`| ventana_completa   | ${String(resA.ventana_completa).padEnd(11)} | ${String(resB.ventana_completa).padEnd(11)} |`)
  console.log(`| inbound_3d         | ${String(resA.inbound_3d).padEnd(11)} | ${String(resB.inbound_3d).padEnd(11)} |`)
  console.log(`| rate               | ${formatPct(resA.rate).padEnd(11)} | ${formatPct(resB.rate).padEnd(11)} |`)
  console.log()

  if (resA.rate > 0 && resA.ventana_completa > 0 && resB.ventana_completa > 0) {
    const lift = ((resB.rate - resA.rate) / resA.rate) * 100
    const sign = lift >= 0 ? '+' : ''
    console.log(`Lift (B vs A): ${sign}${lift.toFixed(2)}%`)
    if (resA.ventana_completa < 100 || resB.ventana_completa < 100) {
      console.log(`(⚠ Sample size <100/grupo — análisis intermedio. Esperar más datos para significancia.)`)
    }
  } else {
    console.log(`Lift: N/A (rate Group A es 0 o sin datos suficientes)`)
  }
  console.log()

  console.log('=== Sample Inbound Group A ===')
  if (resA.samples.length === 0) {
    console.log('(sin samples — 0 inbound en ventana 3d)')
  } else {
    for (const s of resA.samples) {
      console.log(`  [${s.received_at}] ${s.nombre} (${s.phone}): ${s.preview}`)
    }
  }
  console.log()

  console.log('=== Sample Inbound Group B ===')
  if (resB.samples.length === 0) {
    console.log('(sin samples — 0 inbound en ventana 3d)')
  } else {
    for (const s of resB.samples) {
      console.log(`  [${s.received_at}] ${s.nombre} (${s.phone}): ${s.preview}`)
    }
  }
  console.log()

  console.log('=== END ===')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
