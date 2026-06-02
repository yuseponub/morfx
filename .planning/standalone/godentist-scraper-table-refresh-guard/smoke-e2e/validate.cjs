#!/usr/bin/env node
// Smoke E2E validator for godentist-scraper-table-refresh-guard standalone.
// Usage:
//   node validate.cjs  (defaults to ./smoke_1.json, ./smoke_2.json, ./smoke_3.json)
//   node validate.cjs path1.json path2.json path3.json
//
// Pass criteria (per SPEC Acceptance):
//   - ratio (total / unique) per sede === 1.0 for every sede in every file
//   - overlap (phone+hora intersection) === 0 between every pair of sedes in every file
// Exit code 0 if pass, 1 if fail.

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const dir = __dirname
const files = args.length > 0
  ? args
  : [path.join(dir, 'smoke_1.json'), path.join(dir, 'smoke_2.json'), path.join(dir, 'smoke_3.json')]

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

  // Group by sucursal
  const bySede = {}
  for (const a of apps) {
    const key = a.sucursal || '<no-sede>'
    if (!bySede[key]) bySede[key] = []
    bySede[key].push(`${a.telefono}|${a.hora}`)
  }

  // Ratio per sede
  const ratios = {}
  for (const [sede, keys] of Object.entries(bySede)) {
    const unique = new Set(keys).size
    ratios[sede] = { total: keys.length, unique, ratio: keys.length / unique }
  }

  // Overlap pairwise
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

  const ratiosBad = Object.entries(ratios).filter(([_, r]) => r.ratio !== 1)
  const overlapsBad = overlaps.filter(o => o.intersection !== 0)
  const pass = ratiosBad.length === 0 && overlapsBad.length === 0

  console.log(`${pass ? 'PASS' : 'FAIL'} ${path.basename(file)}`)
  console.log(`  date: ${data.date}, totalAppointments: ${apps.length}, sedes: ${sedes.join(', ')}`)
  console.log(`  ratios: ${JSON.stringify(ratios)}`)
  if (overlapsBad.length > 0) {
    console.log(`  overlaps_bad: ${JSON.stringify(overlapsBad)}`)
  }

  if (!pass) allPassed = false
}

console.log('')
if (allPassed) {
  console.log('SMOKE PASS — all files clean (ratio=1.0 per sede, overlap=0 between sedes)')
  process.exit(0)
} else {
  console.log('SMOKE FAIL — review JSON files above')
  process.exit(1)
}
