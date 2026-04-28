/**
 * Parser idempotente: ~/Downloads/PACIENTES ENERO 2019 A DICIEMBRE 2022.xlsx
 *   → godentist/pacientes-data/pacientes-2019-2022.json
 *   → godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv
 *
 * Idempotente: si el JSON destino ya existe, exit 0 sin re-parsear (no sobreescribir).
 * Para forzar re-parse: rm el JSON destino y volver a correr.
 *
 * Usage: npx tsx scripts/parse-godentist-xlsx-2019-2022.ts
 */
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'

const XLSX_PATH = '/mnt/c/Users/Usuario/Downloads/PACIENTES ENERO 2019 A DICIEMBRE 2022.xlsx'
const DATA_DIR = '/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data'
const OUTPUT_JSON = path.join(DATA_DIR, 'pacientes-2019-2022.json')
const SKIPPED_CSV = path.join(DATA_DIR, 'pacientes-2019-2022-skipped-prelist.csv')

interface Patient {
  nombre: string
  apellido: string
  celular: string
  email: string
  fecha_creacion: string
}

// Clone verbatim from scripts/godentist-send-scheduled.ts:47-53
function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `+57${digits}`
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`
  return null
}

function classifySkip(raw: string): 'phone_invalid' | 'phone_foreign' | 'phone_multiple' {
  if (!raw) return 'phone_invalid'
  if (raw.includes('-') || raw.includes('/')) return 'phone_multiple'
  const digits = raw.replace(/\D/g, '')
  // foreign: starts with non-57 prefix and length != 10/12
  if (digits.length > 0 && !digits.startsWith('57') && !(digits.length === 10 && digits.startsWith('3'))) {
    return 'phone_foreign'
  }
  return 'phone_invalid'
}

function csvEscape(s: string): string {
  return `"${(s || '').replace(/"/g, '""')}"`
}

async function main() {
  // Idempotency
  if (fs.existsSync(OUTPUT_JSON)) {
    console.log(`[parser] ${OUTPUT_JSON} ya existe — skip parse (idempotente). Para re-parse: rm el archivo.`)
    process.exit(0)
  }

  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`[parser] ERROR: xlsx no encontrado en ${XLSX_PATH}`)
    process.exit(1)
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })

  console.log(`[parser] Leyendo ${XLSX_PATH}...`)
  const wb = XLSX.readFile(XLSX_PATH)
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })
  console.log(`[parser] Sheet "${sheetName}" — ${rows.length} rows.`)

  // Map nom1→nombre, ape1→apellido. Headers son lowercase (verified RESEARCH.md).
  const raw: Patient[] = rows.map(r => ({
    nombre: String(r.nom1 || '').trim(),
    apellido: String(r.ape1 || '').trim(),
    celular: String(r.celular || '').trim(),
    email: r.email ? String(r.email).trim() : '',
    fecha_creacion: String(r.fecha_creacion || ''),
  }))

  // Dedup intra-lista por phone normalizado (Pitfall 2 RESEARCH.md)
  const seen = new Set<string>()
  const unique: Patient[] = []
  const skipped: Array<{ numero: string; nombre: string; razon: string }> = []

  for (const p of raw) {
    const norm = normalizePhone(p.celular)
    if (!norm) {
      skipped.push({
        numero: p.celular || '(empty)',
        nombre: `${p.nombre} ${p.apellido}`.trim(),
        razon: classifySkip(p.celular),
      })
      continue
    }
    if (seen.has(norm)) {
      skipped.push({
        numero: p.celular,
        nombre: `${p.nombre} ${p.apellido}`.trim(),
        razon: 'phone_duplicate',
      })
      continue
    }
    seen.add(norm)
    unique.push(p)
  }

  // Write JSON (raw celular preserved — blast script normaliza on-the-fly)
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(unique, null, 2))
  console.log(`[parser] OK — ${unique.length} pacientes únicos en ${OUTPUT_JSON}`)

  // Write skipped CSV
  const csvLines = ['numero,nombre,razon_skip']
  for (const s of skipped) {
    csvLines.push(`${csvEscape(s.numero)},${csvEscape(s.nombre)},${csvEscape(s.razon)}`)
  }
  fs.writeFileSync(SKIPPED_CSV, csvLines.join('\n') + '\n')
  console.log(`[parser] OK — ${skipped.length} rows descartadas en ${SKIPPED_CSV}`)

  // Summary
  const counts = skipped.reduce((acc, s) => {
    acc[s.razon] = (acc[s.razon] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log('\n[parser] Resumen:')
  console.log(`  Total rows xlsx:      ${rows.length}`)
  console.log(`  Únicos válidos:       ${unique.length}`)
  console.log(`  Descartados:          ${skipped.length}`)
  for (const [razon, n] of Object.entries(counts)) {
    console.log(`    ${razon}: ${n}`)
  }

  // Sanity gate
  if (unique.length < 8000) {
    console.warn(`[parser] WARNING: solo ${unique.length} únicos (<8.000 esperado). Revisar antes de proceder.`)
    process.exit(2) // non-zero pero no fatal — investigación manual
  }
}

main().catch(err => {
  console.error('[parser] Fatal:', err)
  process.exit(1)
})
