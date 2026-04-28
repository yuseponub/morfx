---
phase: godentist-blast-sms-experiment
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - scripts/parse-godentist-xlsx-2019-2022.ts
  - godentist/pacientes-data/pacientes-2019-2022.json
  - godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv
autonomous: true
requirements:
  - D-01
  - D-02
  - D-03
  - D-13.5
  - D-13.1

must_haves:
  truths:
    - "Existe godentist/pacientes-data/pacientes-2019-2022.json con shape array de {nombre, apellido, celular, email, fecha_creacion}"
    - "El JSON contiene SOLO phones únicos normalizables Colombian mobile (+57 3XX XXX XXXX) — dedup intra-lista aplicada"
    - "Existe godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv listando rows descartadas (phone_invalid, phone_foreign, phone_multiple, phone_duplicate)"
    - "Total únicos en JSON ≥ 8.000 (esperado ~8.284 según RESEARCH.md)"
    - "Template `nuevo_numero` confirmed APPROVED en 360dialog (manual via panel o curl)"
    - "Onurix wholesale balance manual-confirmado ≥ $83.000 COP (admin)"
  artifacts:
    - path: "scripts/parse-godentist-xlsx-2019-2022.ts"
      provides: "Parser xlsx idempotente que escribe pacientes-2019-2022.json + skipped CSV"
      min_lines: 60
    - path: "godentist/pacientes-data/pacientes-2019-2022.json"
      provides: "Lista única deduped de pacientes 2019-2022 lista para A/B split"
      contains: "[{\"nombre\":"
    - path: "godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv"
      provides: "CSV con rows descartadas por número inválido o duplicado intra-lista"
      contains: "numero,nombre,razon_skip"
  key_links:
    - from: "scripts/parse-godentist-xlsx-2019-2022.ts"
      to: "/mnt/c/Users/Usuario/Downloads/PACIENTES ENERO 2019 A DICIEMBRE 2022.xlsx"
      via: "XLSX.readFile()"
      pattern: "XLSX\\.readFile"
    - from: "scripts/parse-godentist-xlsx-2019-2022.ts"
      to: "godentist/pacientes-data/pacientes-2019-2022.json"
      via: "fs.writeFileSync"
      pattern: "writeFileSync.*pacientes-2019-2022\\.json"
---

<objective>
Pre-flight + parsing del dataset 2019-2022. Convierte el xlsx (~8.832 rows) a JSON único deduped (~8.284 phones únicos normalizables Colombian mobile), genera CSV pre-list de rows descartadas, y verifica manualmente las 2 dependencias externas que no podemos automatizar (template `nuevo_numero` APPROVED, saldo Onurix wholesale).

Purpose: Plan 04 (script de blast) requiere un JSON limpio + verifications externas confirmadas. Si el parser produce <8.000 únicos o el template está PAUSED, abortamos antes de ejecutar Plan 02-06.

Output:
- `scripts/parse-godentist-xlsx-2019-2022.ts` (parser idempotente)
- `godentist/pacientes-data/pacientes-2019-2022.json` (lista única deduped)
- `godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv` (rows descartadas con razón)
- Confirmaciones manuales: template APPROVED + Onurix balance OK (registradas en log del script o consola)

Cumple D-01 (todos los normalizables sin dedup vs campaña anterior), D-02 (sin filtros calidad extras), D-03 (parser xlsx), D-13.5 (template approved), D-13.1 (Onurix balance).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-blast-sms-experiment/CONTEXT.md
@.planning/standalone/godentist-blast-sms-experiment/RESEARCH.md
@scripts/godentist-send-scheduled.ts
@CLAUDE.md
</context>

<interfaces>
<!-- Reusable from godentist-send-scheduled.ts:47-53 -->

```typescript
// Phone normalization (E.164 with +) — clone verbatim
function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `+57${digits}`
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`
  return null
}

// Output shape (matches godentist/pacientes-data/all-pacientes.json)
interface Patient {
  nombre: string         // from nom1
  apellido: string       // from ape1
  celular: string        // raw from xlsx — keeping raw, normalization en blast script
  email: string
  fecha_creacion: string // raw 'M/D/YY' string
}
```

xlsx@0.18.5 ya está instalado en `node_modules/xlsx/` (verified). NO ejecutar `npm i xlsx` — es no-op.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear scripts/parse-godentist-xlsx-2019-2022.ts (parser idempotente con dedup)</name>
  <read_first>
    - scripts/godentist-send-scheduled.ts (líneas 16-17 dotenv pattern, 47-53 normalizePhone)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (sección "Pattern 1: xlsx Parser", "Pitfall 2: Plurality dedup", "Pitfall 7: Foreign numbers")
    - .planning/standalone/godentist-blast-sms-experiment/CONTEXT.md (D-03 mapping nom1→nombre, ape1→apellido)
    - godentist/pacientes-data/all-pacientes.json (sample del shape final esperado)
  </read_first>
  <files>scripts/parse-godentist-xlsx-2019-2022.ts</files>
  <action>
Crear el archivo NUEVO `scripts/parse-godentist-xlsx-2019-2022.ts` con este código completo (no es clone — es nuevo, pero reusa patterns):

```typescript
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
```

Justificación de decisiones:
- **Idempotente** (D-03 explícito + Pattern 1 RESEARCH.md): si el JSON existe, no sobreescribe. Permite re-correr el cron sin riesgo.
- **`raw: false`** (Pitfall en Pattern 1): mantiene `fecha_creacion` como string, evita objetos Date corruptos en JSON.
- **Dedup intra-lista por normalized phone** (Pitfall 2): garantiza que el mismo phone no aparezca 2x en la lista, lo que pollute el A/B split en Plan 04.
- **CSV con razones taxonómicas** (D-04 + Pitfall 7): `phone_invalid`, `phone_foreign`, `phone_multiple`, `phone_duplicate`. Esto se entrega a GoDentist al cierre del experimento (Plan 06).
- **Exit code 2 si <8.000** (NO fatal): permite investigación manual sin bloquear todo.
- **NO instalar xlsx** (RESEARCH.md finding 2): el paquete `xlsx@0.18.5` ya está en node_modules.
- **Preserva `celular` raw en JSON** (NO normaliza in-output): el blast script (Plan 04) normaliza on-the-fly siguiendo el patrón existente. Esto evita doble-normalización.
  </action>
  <verify>
    <automated>test -f scripts/parse-godentist-xlsx-2019-2022.ts && grep -c "normalizePhone" scripts/parse-godentist-xlsx-2019-2022.ts | xargs test 2 -le && grep -c "XLSX.readFile" scripts/parse-godentist-xlsx-2019-2022.ts | xargs test 1 -le && grep -c "phone_duplicate" scripts/parse-godentist-xlsx-2019-2022.ts | xargs test 1 -le</automated>
  </verify>
  <acceptance_criteria>
    - `test -f scripts/parse-godentist-xlsx-2019-2022.ts` returns 0
    - `grep -c "normalizePhone" scripts/parse-godentist-xlsx-2019-2022.ts` returns ≥ 2 (función + uso)
    - `grep -c "XLSX.readFile" scripts/parse-godentist-xlsx-2019-2022.ts` returns ≥ 1
    - `grep -c "phone_duplicate" scripts/parse-godentist-xlsx-2019-2022.ts` returns ≥ 1 (dedup taxonomy)
    - `grep -c "process.exit(0)" scripts/parse-godentist-xlsx-2019-2022.ts` returns ≥ 1 (idempotency exit)
    - `grep -c "raw: false" scripts/parse-godentist-xlsx-2019-2022.ts` returns ≥ 1 (Pitfall 1)
  </acceptance_criteria>
  <done>Archivo creado con parser idempotente, dedup intra-lista por phone normalizado, CSV de skipped con 4 razones taxonómicas (phone_invalid/phone_foreign/phone_multiple/phone_duplicate), sanity gate <8.000 con exit 2.</done>
</task>

<task type="auto">
  <name>Task 2: Ejecutar parser + verificar outputs</name>
  <read_first>
    - scripts/parse-godentist-xlsx-2019-2022.ts (creado en Task 1)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (sección "Summary" finding 1: lista esperada ~8.284 únicos)
  </read_first>
  <files>godentist/pacientes-data/pacientes-2019-2022.json, godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv</files>
  <action>
Ejecutar el parser con `cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsx scripts/parse-godentist-xlsx-2019-2022.ts` y capturar el output.

Validar los siguientes contra el output:
1. Total rows xlsx ≈ 8.832 (puede variar ±100 si xlsx fue actualizado)
2. Únicos válidos ≥ 8.000 (target ~8.284)
3. Descartados breakdown contiene al menos `phone_duplicate` y `phone_invalid` con counts > 0

Verificar el JSON resultante con:
```bash
node -e "const d=require('/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json'); console.log('count:', d.length); console.log('sample:', JSON.stringify(d[0])); console.log('keys:', Object.keys(d[0]).sort().join(','));"
```

Esperar:
- count ≥ 8.000
- sample tiene shape `{nombre, apellido, celular, email, fecha_creacion}`
- keys = `apellido,celular,email,fecha_creacion,nombre` (sorted)

Verificar el CSV resultante con:
```bash
head -1 godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv
wc -l godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv
```

Esperar:
- header line == `numero,nombre,razon_skip`
- total lines ≥ 100 (al menos 127 inválidos esperados según RESEARCH.md + 413 dupes = ~540 lines)

Si exit 2 del parser (count < 8.000), STOP y reportar al usuario antes de continuar a Plan 02. NO crear el JSON forzadamente.
  </action>
  <verify>
    <automated>test -f godentist/pacientes-data/pacientes-2019-2022.json && test -f godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv && node -e "const d=require('/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json'); if(d.length<8000)process.exit(1); if(!d[0].nombre||!('celular' in d[0])||!('apellido' in d[0]))process.exit(2); process.exit(0)"</automated>
  </verify>
  <acceptance_criteria>
    - `test -f godentist/pacientes-data/pacientes-2019-2022.json` returns 0
    - `node -e "const d=require('/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json'); console.log(d.length)"` returns ≥ 8000
    - JSON sample[0] contiene exactamente las 5 keys: `nombre, apellido, celular, email, fecha_creacion`
    - `head -1 godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv` returns `numero,nombre,razon_skip`
    - `wc -l godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv` returns ≥ 100
  </acceptance_criteria>
  <done>JSON único con ≥8.000 pacientes generado y validado; CSV de skipped con header correcto y >100 entries. Si <8.000, STOP reportando al usuario.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verificación manual externa — template aprobado + saldo Onurix</name>
  <what-built>
    - Parser xlsx ejecutado, JSON único con ~8.284 pacientes generado.
    - CSV pre-list con rows descartadas listo para entregar a GoDentist al cierre.
  </what-built>
  <how-to-verify>
**Pre-flight 5 (D-13.5): Template `nuevo_numero` APPROVED en 360dialog**
   1. Abrir panel 360dialog para workspace GoDentist (`36a74890-aad6-4804-838c-57904b1c9328`).
   2. Buscar template `nuevo_numero` (idioma `es`, 1 var body).
   3. Verificar status = `APPROVED` (NO `PAUSED`, NO `REJECTED`, NO `PENDING`).
   4. Si status ≠ `APPROVED`: STOP. Reportar al usuario que abortamos el experimento.

   ALT verificación via API (si el panel no está accesible):
   ```bash
   # Obtener API key del workspace
   psql ... -c "SELECT settings->>'whatsapp_api_key' FROM workspaces WHERE id='36a74890-aad6-4804-838c-57904b1c9328'"
   # GET templates (reemplazar API_KEY)
   curl -s -H "D360-API-KEY: ${API_KEY}" https://waba-v2.360dialog.io/v1/configs/templates | jq '.waba_templates[] | select(.name=="nuevo_numero") | {name, status, language}'
   ```

**Pre-flight 1 (D-13.1): Saldo Onurix wholesale del admin morfx**
   1. Login al panel admin Onurix (https://www.onurix.com).
   2. Verificar saldo de la cuenta: ≥ $83.000 COP esperado (4.142 SMS × $18.75 wholesale + 20% margen).
   3. Si saldo < $83.000: recargar a $100.000 antes de continuar a Plan 02.
   4. Capturar screenshot o anotar el saldo actual para tracking.

Reportar al usuario:
   - "Template `nuevo_numero` status: [APPROVED|PAUSED|REJECTED|PENDING]"
   - "Onurix wholesale balance: $XXX.XXX COP"
   - "Procedemos a Plan 02? [yes / no — recargar primero]"
  </how-to-verify>
  <resume-signal>Type "approved" si template está APPROVED y saldo Onurix ≥ $83.000 COP; describe el problema si no.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local FS → JSON | Script escribe a `godentist/pacientes-data/` — workspace local, no cross-workspace risk |
| Manual external services | 360dialog (WA template status) y Onurix (saldo wholesale) — humanos verifican via paneles |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-blast-01-01 | Tampering | xlsx parser | accept | Input es archivo local del usuario; no exposed via network |
| T-blast-01-02 | Information Disclosure | skipped CSV con phones inválidos | accept | CSV se genera localmente, se entrega manualmente a GoDentist al cierre — sin transit risk |
| T-blast-01-03 | Denial of Service | parser bloqueado por xlsx malformado | mitigate | try/catch + exit 1 con mensaje legible; idempotencia evita re-corrupción |
</threat_model>

<verification>
- Parser ejecutado, JSON ≥ 8.000 únicos, shape correcta, CSV de skipped generado.
- Manual confirmation registrado: template APPROVED + saldo Onurix ≥ $83k COP.
</verification>

<success_criteria>
- `godentist/pacientes-data/pacientes-2019-2022.json` existe con ≥8.000 entries shape `{nombre, apellido, celular, email, fecha_creacion}`
- `godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv` existe con header `numero,nombre,razon_skip` y ≥100 rows descartadas
- Manual gate confirmado: template `nuevo_numero` APPROVED + Onurix balance ≥ $83.000 COP
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-blast-sms-experiment/01-SUMMARY.md` registrando:
- Total rows xlsx
- Únicos válidos
- Breakdown de skipped por razón
- Template status confirmado
- Onurix balance confirmado
- Fecha esperada del primer cron run (Plan 05 swap)
</output>
