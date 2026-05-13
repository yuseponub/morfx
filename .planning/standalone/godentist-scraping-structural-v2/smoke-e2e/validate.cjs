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
