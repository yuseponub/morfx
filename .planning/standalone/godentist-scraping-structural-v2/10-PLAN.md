---
phase: godentist-scraping-structural-v2
plan: 10
type: execute
wave: 5
depends_on: [05]
files_modified:
  - .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs
autonomous: true
requirements:
  - D-14
  - D-15

must_haves:
  truths:
    - "Existe archivo .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs"
    - "El validator implementa 3 invariantes: (a) ratio total/unique by phone+hora === 1.0 per sede, (b) overlap phone+hora intersection === 0 entre pares de sedes, (c) NUEVO: ningun (phone, fecha) en >1 sede globalmente"
    - "Por default lee smoke_1.json ... smoke_5.json (N=5 per D-14, no 3 como el validator viejo)"
    - "El script tiene shebang #!/usr/bin/env node + es ejecutable"
    - "El script retorna exit code 0 si todos los invariantes pasan en todos los files; exit code 1 si cualquier falla"
    - "Output legible: PASS/FAIL por file + 'SMOKE PASS — 5/5 files clean (3 invariants)' al final si todo bien"
  artifacts:
    - path: ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs"
      provides: "Smoke E2E validator con 3 invariantes (D-15) defaulting a N=5 files (D-14)"
      contains:
        - "ratio"
        - "overlap"
        - "cross_sede_violations"
        - "smoke_1.json"
        - "smoke_5.json"
        - "ratiosBad.length === 0 && overlapsBad.length === 0 && crossSedeViolations.length === 0"
  key_links:
    - from: ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs"
      to: "Plan 11 (smoke E2E run) consume este validator"
      via: "node validate.cjs"
      pattern: "process.exit"
---

<objective>
Crear el smoke E2E validator nuevo en `.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` con las 3 invariantes (D-15) y N=5 default (D-14). El validator existente en `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs` (2-invariant, N=3 default) marcaba PASS para data que HOY (con la 3ra invariante) marcaria FAIL — eso es exactamente el bug.

Las 3 invariantes:
- **(a) Ratio per sede:** total / unique by (phone+hora) === 1.0. Si se duplica una cita dentro de la misma sede, ratio > 1.0 → FAIL. [conservada del validator viejo]
- **(b) Overlap pairwise:** (phone+hora) intersection === 0 entre cada par de sedes. Si misma cita en 2 sedes, FAIL. [conservada]
- **(c) NUEVO cross-sede:** ningun (phone, fecha) aparece en >1 sede a nivel global. Detecta el caso JOHANNA/YARINETH/EDDY que pasaba (a)+(b) porque cada sede individualmente era consistente.

Default N=5 (D-14): el bug es timing-dependent; 3 runs no dan confianza estadistica. 5 runs es el minimum aceptable para considerar el fix shipped.

Purpose: Plan 11 corre `node validate.cjs` contra 5 JSONs generados por el endpoint paradigm F del robot. Si el validator falla, el merge se aborta. CONTEXT.md D-15 mandata el rediseno.

Output: 1 archivo .cjs nuevo + chmod +x. Sin commit todavia (commit unificado Plan 11).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraping-structural-v2/CONTEXT.md
@.planning/standalone/godentist-scraping-structural-v2/RESEARCH.md
@.planning/standalone/godentist-scraping-structural-v2/PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Old validator analog: .planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs -->
<!-- The new validator EXTENDS this with invariant (c) + default N=5. -->

<!-- JSON shape produced by the robot endpoint (ScrapeAppointmentsResponse Plan 05) -->
```json
{
  "success": true,
  "date": "2026-05-14",
  "totalAppointments": 91,
  "appointments": [
    { "nombre": "...", "telefono": "57316...", "hora": "10:00 AM", "sucursal": "CABECERA", "doctor": "...", "estado": "..." },
    ...
  ],
  "errors": [...],  // optional
  "totalCitas": 91  // optional, D-15 audit
}
```

<!-- PATTERNS.md §9 has the complete validator script verbatim — copy that snippet -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear el archivo validate.cjs con 3 invariantes y N=5 default</name>

  <read_first>
    - .planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs (viejo — para comparar shape; verificar que (a)+(b) coinciden con la implementacion nueva)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §9 (snippet verbatim completo)
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md D-15 (las 3 invariantes)
  </read_first>

  <files>.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs</files>

  <action>
Crear el directorio si no existe + crear el archivo validate.cjs:

```bash
mkdir -p .planning/standalone/godentist-scraping-structural-v2/smoke-e2e
```

Crear archivo `.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` con el siguiente contenido EXACTO:

```javascript
#!/usr/bin/env node
// Smoke E2E validator for godentist-scraping-structural-v2 standalone (D-15).
//
// Usage:
//   node validate.cjs  (defaults to ./smoke_1.json ... ./smoke_5.json — D-14 mandates 5 runs)
//   node validate.cjs path1.json path2.json ...
//
// Pass criteria (per CONTEXT.md D-15):
//   (a) ratio (total / unique by phone+hora) === 1.0 per sede [conserved from old validator]
//   (b) overlap (phone+hora intersection) === 0 between every pair of sedes [conserved]
//   (c) NUEVO: ningún (phone, fecha) aparece en >1 sede globalmente [detector cross-sede]
//
// Exit code 0 if pass, 1 if fail.
//
// Diff vs old validator (.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs):
//   - Default file count: 3 → 5 (D-14)
//   - Invariant (c) added (D-15)
//   - Verdict requires ALL 3 invariants pass (was 2)

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const dir = __dirname
// D-14: default to 5 files (was 3 in old validator)
const files = args.length > 0
  ? args
  : [1, 2, 3, 4, 5].map(n => path.join(dir, `smoke_${n}.json`))

let allPassed = true

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`FAIL ${file}: file not found`)
    allPassed = false
    continue
  }
  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    console.log(`FAIL ${file}: invalid JSON (${err.message})`)
    allPassed = false
    continue
  }
  if (!data.success || !Array.isArray(data.appointments)) {
    console.log(`FAIL ${file}: not a success response (success=${data.success})`)
    if (data.error) console.log(`  error: ${data.error}`)
    allPassed = false
    continue
  }
  const apps = data.appointments

  // ── Invariant (a): ratio per sede ──
  const bySede = {}
  for (const a of apps) {
    const key = a.sucursal || '<no-sede>'
    if (!bySede[key]) bySede[key] = []
    bySede[key].push(`${a.telefono}|${a.hora}`)
  }
  const ratios = {}
  for (const [sede, keys] of Object.entries(bySede)) {
    const unique = new Set(keys).size
    ratios[sede] = { total: keys.length, unique, ratio: keys.length / unique }
  }

  // ── Invariant (b): overlap pairwise ──
  const sedes = Object.keys(bySede)
  const overlaps = []
  for (let i = 0; i < sedes.length; i++) {
    for (let j = i + 1; j < sedes.length; j++) {
      const a = new Set(bySede[sedes[i]])
      const b = new Set(bySede[sedes[j]])
      const inter = [...a].filter(x => b.has(x))
      overlaps.push({ pair: `${sedes[i]} x ${sedes[j]}`, intersection: inter.length, samples: inter.slice(0, 3) })
    }
  }

  // ── NEW Invariant (c): no (phone, fecha) in >1 sede globally — D-15 ──
  const phoneFechaToSedes = new Map()  // phone|fecha → Set<sede>
  for (const a of apps) {
    const k = `${a.telefono}|${data.date}`
    if (!phoneFechaToSedes.has(k)) phoneFechaToSedes.set(k, new Set())
    phoneFechaToSedes.get(k).add(a.sucursal || '<no-sede>')
  }
  const crossSedeViolations = [...phoneFechaToSedes]
    .filter(([, s]) => s.size > 1)
    .map(([k, s]) => ({ key: k, sedes: [...s] }))

  // ── Verdict ──
  const ratiosBad = Object.entries(ratios).filter(([, r]) => r.ratio !== 1)
  const overlapsBad = overlaps.filter(o => o.intersection !== 0)
  const pass = ratiosBad.length === 0 && overlapsBad.length === 0 && crossSedeViolations.length === 0

  console.log(`${pass ? 'PASS' : 'FAIL'} ${path.basename(file)}`)
  console.log(`  date: ${data.date}, totalAppointments: ${apps.length}, sedes: ${sedes.join(', ')}`)
  console.log(`  ratios: ${JSON.stringify(ratios)}`)
  if (ratiosBad.length > 0) console.log(`  ratios_bad: ${JSON.stringify(ratiosBad)}`)
  if (overlapsBad.length > 0) console.log(`  overlaps_bad: ${JSON.stringify(overlapsBad)}`)
  if (crossSedeViolations.length > 0) console.log(`  cross_sede_violations: ${JSON.stringify(crossSedeViolations)}`)

  if (!pass) allPassed = false
}

console.log('')
if (allPassed) {
  console.log(`SMOKE PASS — ${files.length}/${files.length} files clean (3 invariants: ratio=1.0, overlap=0, no cross-sede)`)
  process.exit(0)
}
console.log('SMOKE FAIL — review JSON files above')
process.exit(1)
```

**Tras crear el archivo, hacerlo ejecutable:**
```bash
chmod +x .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs
```

**Verificacion smoke:**
- El script debe correr sin smoke files presentes y retornar exit 1 (no encontro los 5 files default):
  ```bash
  node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs
  # Esperado: 5 lineas "FAIL ... file not found" + "SMOKE FAIL"
  ```

- Si se quisiera probar manualmente la logica con un sample JSON ad-hoc:
  ```bash
  echo '{"success":true,"date":"2026-05-14","appointments":[{"telefono":"57316","hora":"10:00 AM","sucursal":"CABECERA"}]}' > /tmp/sample.json
  node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs /tmp/sample.json
  # Esperado: PASS (1 sede, sin overlap, sin cross-sede)
  ```

**Style notes:**
- Node CommonJS (require) — el codebase usa `.cjs` para validators standalone (consistente con bold-* validators previos).
- Sin TypeScript — el validator es ejecutable directo via node sin compile step.
- console.log para output legible (no JSON estructurado — el usuario lo lee directamente).
- Mensajes en ingles (el resto del validator viejo esta en ingles).
  </action>

  <verify>
    <automated>mkdir -p .planning/standalone/godentist-scraping-structural-v2/smoke-e2e && test -f .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs && head -3 .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs && grep -c "crossSedeViolations" .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs && grep -c "smoke_1.json\|smoke_5.json" .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs && grep -c "ratiosBad.length === 0 && overlapsBad.length === 0 && crossSedeViolations.length === 0" .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs && chmod +x .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs && echo "TEST: smoke without files should exit 1" && node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs; if [ $? -eq 1 ]; then echo "OK exit 1"; else echo "FAIL: expected exit 1 when no smoke files present"; fi; echo "TEST: pass case with sample JSON" && echo '{"success":true,"date":"2026-05-14","appointments":[{"telefono":"57316","hora":"10:00 AM","sucursal":"CABECERA"}]}' > /tmp/sample.json && node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs /tmp/sample.json && echo "OK exit 0"</automated>
  </verify>

  <acceptance_criteria>
    - `test -f .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` retorna 0 (archivo existe).
    - `head -1 .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` muestra `#!/usr/bin/env node`.
    - `grep -c "crossSedeViolations" .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` retorna al menos `4` (declaracion + verdict + output + final exit).
    - Default N=5: `grep -c "\[1, 2, 3, 4, 5\]\.map" .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` retorna `1`.
    - Verdict combina 3 invariantes: `grep -c "ratiosBad.length === 0 && overlapsBad.length === 0 && crossSedeViolations.length === 0" .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` retorna `1`.
    - Exit codes correctos: ejecutar sin args sin smoke files presente retorna exit 1.
    - Sample positivo: ejecutar con un JSON sano retorna exit 0 y output incluye "SMOKE PASS".
    - `ls -l .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs | grep -c "x"` retorna al menos `1` (executable).
  </acceptance_criteria>

  <done>
    Validator nuevo creado con 3 invariantes + N=5 default + executable. Plan 11 puede correr `node validate.cjs` despues de generar los 5 smokes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Validator <-> smoke JSON files | Solo lectura local. Sin cruce de red. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-10-01 | Tampering | Validator local | accept | Bajo control de versiones. Sin runtime mutation. |
| T-v2-10-02 | Denial of service | JSON parse de archivo grande | accept | Smoke files de ~100KB. Aceptable. |
</threat_model>

<verification>
- Archivo creado, ejecutable, exit codes correctos.
- 3 invariantes presentes.
- N=5 default.
</verification>

<success_criteria>
- [ ] validate.cjs creado con 3 invariantes + N=5 default.
- [ ] chmod +x aplicado.
- [ ] Exit code 1 sin files presentes, exit code 0 con sample pasante.
- [ ] Sin commit todavia.
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/10-SUMMARY.md` con:
- Path absoluto del archivo.
- Output de `node validate.cjs` sin args (esperado: 5 FAIL not found + SMOKE FAIL).
- Output de `node validate.cjs` con sample JSON pasante (esperado: PASS + SMOKE PASS).
- Nota: "Plan 11 corre 5 smokes consecutivos contra Railway endpoint paradigm F + valida con este script."
</output>
</content>
</invoke>