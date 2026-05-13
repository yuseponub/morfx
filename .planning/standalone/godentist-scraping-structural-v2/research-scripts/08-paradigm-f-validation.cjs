#!/usr/bin/env node
/**
 * Research script 08 — PARADIGM F validation.
 *
 * Paradigm F: ONE FRESH page.goto(APPOINTMENTS_URL) PER SEDE.
 *  - Eliminates ALL inter-sede race conditions by design
 *  - Each sede scrape starts from a clean state: navigate → set date/hour → select sede → buscar → extract
 *  - Slower (~14s per scrape vs ~6s) but correctness by construction (D-07)
 *
 * Plus paradigm E's pagination guard (waitForFunction post-clickNextPage).
 *
 * Stress: 5 consecutive runs.
 */

const path = require('path')
const fs = require('fs')
const { chromium } = require('/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/robot-godentist/node_modules/playwright')

const BASE_URL = 'https://godentist.dentos.co'
const APPOINTMENTS_URL = `${BASE_URL}/citas/index/listcitassimple`
const USERNAME = 'JROMERO'
const PASSWORD = '123456'

const SEDES = ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS']
const SEDE_ID_MAP = { 'CABECERA': '1', 'FLORIDABLANCA': '3', 'JUMBO EL BOSQUE': '5', 'MEJORAS PUBLICAS': '4' }
const NUM_RUNS = 5

const EVIDENCE_DIR = path.resolve(__dirname, '..', 'research-evidence', '08-paradigm-f-validation')
fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

function writeArtifact(name, content) {
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8')
}

class FilterDriftError extends Error {
  constructor(expectedId, actualId, when) {
    super(`Filter drift: expected=${expectedId} actual=${actualId} when=${when}`)
    this.name = 'FilterDriftError'
  }
}
class PaginationStuckError extends Error {
  constructor(sede, page, totalPages, before, after) {
    super(`Pagination stuck: sede=${sede} page=${page}/${totalPages} before=${before} after=${after}`)
    this.name = 'PaginationStuckError'
  }
}

async function verifyFilter(page, expectedId, when) {
  const actualId = await page.evaluate(() => document.getElementById('idsucursalgrid')?.value)
  if (actualId !== expectedId) throw new FilterDriftError(expectedId, actualId, when)
}
async function readPageInputValue(page) {
  return await page.evaluate(() => document.querySelector('input.x-tbar-page-number')?.value ?? null)
}
async function readFirstRowFingerprint(page) {
  return await page.evaluate(() => {
    const rt = document.querySelector('table.x-grid3-row-table')
    if (!rt) return null
    const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
    return { phone: cells[5] || '', hora: cells[1] || '', paciente: cells[2] || '' }
  })
}
async function readTotalPages(page) {
  return await page.evaluate(() => {
    const els = document.querySelectorAll('.xtb-text, .x-toolbar-text, td, span, div')
    for (const el of els) {
      const t = (el.textContent || '').trim()
      if (t.length > 100) continue
      const m = t.match(/(?:of|de)\s+(\d+)/i)
      if (m) return parseInt(m[1])
    }
    return 0
  })
}
async function readTotalCitas(page) {
  return await page.evaluate(() => {
    const els = document.querySelectorAll('.xtb-text, .x-toolbar-text, td, span, div')
    for (const el of els) {
      const t = (el.textContent || '').trim()
      if (t.length > 200) continue
      const m = t.match(/Total\s+de\s+citas:\s*(\d+)/i)
      if (m) return parseInt(m[1])
    }
    return null
  })
}
async function extractRows(page, label) {
  return await page.evaluate((sucursalLabel) => {
    const rowTables = document.querySelectorAll('table.x-grid3-row-table')
    return Array.from(rowTables).filter(rt => rt.offsetParent !== null && rt.offsetHeight > 0).map(rt => {
      const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
      const phone = cells[5] || ''
      const normalizedPhone = phone.startsWith('3') && phone.length === 10 ? '57' + phone : phone
      return {
        nombre: cells[2] || '',
        telefono: normalizedPhone,
        hora: cells[1] || '',
        sucursal: sucursalLabel,
        estado: cells[3] || '',
      }
    }).filter(r => r.hora && r.nombre)
  }, label)
}
async function openSucursalCombo(page) {
  const comboId = await page.evaluate(() => {
    const hidden = document.getElementById('idsucursalgrid')
    let parent = hidden?.parentElement
    for (let i = 0; i < 5 && parent; i++) {
      const textInputs = parent.querySelectorAll('input[type="text"]')
      for (const inp of textInputs) if (inp.id && inp.id !== 'idsucursalgrid') return inp.id
      parent = parent.parentElement
    }
    return null
  })
  if (!comboId) return null
  const trigger = page.locator(`#${comboId}`).locator('..').locator('.x-form-trigger')
  if (await trigger.count() > 0) await trigger.click()
  else await page.locator(`#${comboId}`).click()
  await page.waitForTimeout(500)
  return comboId
}
async function setDateAndHour(page, dateStr) {
  const dateInput = page.locator('#df_fecha')
  await dateInput.click({ clickCount: 3 })
  await dateInput.fill(dateStr)
  await dateInput.press('Tab')
  await page.waitForTimeout(1500)
  const comboHourInputId = await page.evaluate(() => {
    const hidden = document.getElementById('idhoras')
    let parent = hidden?.parentElement
    for (let i = 0; i < 8 && parent; i++) {
      const textInputs = parent.querySelectorAll('input[type="text"]')
      for (const inp of textInputs) if (inp.id && inp.id !== 'idhoras') return inp.id
      parent = parent.parentElement
    }
    return null
  })
  if (comboHourInputId) {
    const trigger = page.locator(`#${comboHourInputId}`).locator('..').locator('.x-form-trigger')
    if (await trigger.count() > 0) {
      await trigger.click()
      await page.waitForTimeout(800)
      await page.locator('.x-combo-list-item:visible').first().click()
    }
  }
  await page.waitForTimeout(1000)
}
async function selectSucursalF(page, label, expectedId) {
  await openSucursalCombo(page)
  const item = page.locator(`.x-combo-list-item:visible:has-text("${label}")`)
  if (await item.count() === 0) {
    await page.keyboard.press('Escape')
    throw new Error(`Sede ${label} not in dropdown`)
  }
  await item.first().click()
  await page.waitForTimeout(300)
  await verifyFilter(page, expectedId, `post-select-${label}`)
}
async function clickBuscarAndWait(page) {
  const fpBefore = await readFirstRowFingerprint(page)
  const btn = await page.$('button:has-text("Buscar")') || await page.$('button:has-text("Filtrar")')
  if (btn) await btn.click()
  else await page.locator('#df_fecha').press('Enter')
  // Wait for table to populate (firstRow appears OR changes)
  try {
    await page.waitForFunction((fpBefore) => {
      const rt = document.querySelector('table.x-grid3-row-table')
      if (!rt) return false
      const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
      const phone = cells[5] || ''
      const hora = cells[1] || ''
      if (!fpBefore) return phone.length > 0 || hora.length > 0  // wait for first non-empty row
      return phone !== fpBefore.phone || hora !== fpBefore.hora
    }, fpBefore, { timeout: 8000, polling: 200 })
  } catch (e) {
    // Table never changed — could be empty result legitimately
    console.log(`        waitForBuscar timeout (table may be empty)`)
  }
  await page.waitForTimeout(500)
}
async function clickNextPageWithGuard(page, sede, currentPage, totalPages) {
  const fpBefore = await readFirstRowFingerprint(page)
  const pageBefore = await readPageInputValue(page)
  async function attemptClick() {
    await page.evaluate(() => {
      const btn = document.querySelector('button.x-tbar-page-next')
      if (btn) btn.click()
    })
    try {
      await page.waitForFunction(({ pageBefore, fpBefore }) => {
        const pageInput = document.querySelector('input.x-tbar-page-number')
        const cp = pageInput?.value
        if (cp === pageBefore) return false
        const rt = document.querySelector('table.x-grid3-row-table')
        if (!rt) return false
        const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
        return (cells[5] || '') !== fpBefore.phone || (cells[1] || '') !== fpBefore.hora
      }, { pageBefore, fpBefore }, { timeout: 5000, polling: 100 })
      return true
    } catch (e) { return false }
  }
  let ok = await attemptClick()
  if (!ok) { await page.waitForTimeout(500); ok = await attemptClick() }
  if (!ok) {
    const pageAfter = await readPageInputValue(page)
    throw new PaginationStuckError(sede, currentPage, totalPages, pageBefore, pageAfter)
  }
  await page.waitForTimeout(500)
}

async function scrapeOneSede(page, sede, dateStr) {
  const expectedId = SEDE_ID_MAP[sede]

  // FRESH NAVIGATION — eliminates ALL state from previous sede
  await page.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await setDateAndHour(page, dateStr)

  // Select sede (defaults to CABECERA after navigation, so for CABECERA we may skip)
  const currentHidden = await page.evaluate(() => document.getElementById('idsucursalgrid')?.value)
  if (currentHidden !== expectedId) {
    await selectSucursalF(page, sede, expectedId)
  } else {
    await verifyFilter(page, expectedId, `post-navigation-default-${sede}`)
  }

  await clickBuscarAndWait(page)
  await verifyFilter(page, expectedId, `post-buscar-${sede}`)

  const totalPages = await readTotalPages(page) || 1
  const totalCitas = await readTotalCitas(page)
  console.log(`      ${sede}: totalPages=${totalPages} totalCitas=${totalCitas}`)

  const rows = []
  for (let p = 1; p <= totalPages; p++) {
    await verifyFilter(page, expectedId, `page-${p}-${sede}`)
    const pageInput = await readPageInputValue(page)
    const fp = await readFirstRowFingerprint(page)
    const pageRows = await extractRows(page, sede)
    console.log(`        page ${p} (pageInput=${pageInput} firstPhone=${fp?.phone}): ${pageRows.length} rows`)
    rows.push(...pageRows)
    if (p < totalPages) {
      await clickNextPageWithGuard(page, sede, p, totalPages)
    }
  }
  return { rows, totalPages, totalCitas, extractedCount: rows.length }
}

async function runOnce(page) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = `${String(tomorrow.getDate()).padStart(2,'0')}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${tomorrow.getFullYear()}`
  const isoDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`

  const allRows = []
  const sedeStats = {}
  for (const sede of SEDES) {
    console.log(`    [F] Sede: ${sede}`)
    const r = await scrapeOneSede(page, sede, dateStr)
    allRows.push(...r.rows)
    sedeStats[sede] = { totalPages: r.totalPages, totalCitas: r.totalCitas, rowCount: r.rows.length }
  }
  return { date: isoDate, appointments: allRows, sedeStats }
}

function validateRun(rows) {
  const bySede = {}
  for (const r of rows) {
    if (!bySede[r.sucursal]) bySede[r.sucursal] = []
    bySede[r.sucursal].push(`${r.telefono}|${r.hora}`)
  }
  const ratios = {}, duplicates = {}
  for (const [sede, keys] of Object.entries(bySede)) {
    const unique = new Set(keys).size
    ratios[sede] = { total: keys.length, unique, ratio: unique > 0 ? keys.length / unique : 0 }
    const counts = {}
    keys.forEach(k => { counts[k] = (counts[k] || 0) + 1 })
    duplicates[sede] = Object.entries(counts).filter(([_, c]) => c > 1)
  }
  const sedeKeys = Object.keys(bySede)
  const overlaps = []
  for (let i = 0; i < sedeKeys.length; i++) {
    for (let j = i + 1; j < sedeKeys.length; j++) {
      const a = new Set(bySede[sedeKeys[i]]), b = new Set(bySede[sedeKeys[j]])
      const inter = [...a].filter(x => b.has(x))
      overlaps.push({ pair: `${sedeKeys[i]} ∩ ${sedeKeys[j]}`, count: inter.length, samples: inter.slice(0, 3) })
    }
  }
  const phoneToSedes = {}
  for (const r of rows) {
    if (!phoneToSedes[r.telefono]) phoneToSedes[r.telefono] = new Set()
    phoneToSedes[r.telefono].add(r.sucursal)
  }
  const crossSede = Object.entries(phoneToSedes).filter(([_, s]) => s.size > 1)
  return {
    pass: Object.values(ratios).every(r => r.ratio === 1.0) && overlaps.every(o => o.count === 0) && crossSede.length === 0,
    invariant_a_ratio: { pass: Object.values(ratios).every(r => r.ratio === 1.0), details: ratios, duplicates },
    invariant_b_overlap: { pass: overlaps.every(o => o.count === 0), overlaps },
    invariant_c_cross_sede: { pass: crossSede.length === 0, crossSedePhones: crossSede.map(([p, s]) => ({ phone: p, sedes: [...s] })) },
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    console.log('[08] Login...')
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    await (await page.$('input[type="text"]')).fill(USERNAME)
    await (await page.$('input[type="password"]')).fill(PASSWORD)
    const sucursalSelect = await page.$('select')
    if (sucursalSelect) {
      const options = await sucursalSelect.$$('option')
      for (const opt of options) {
        const val = await opt.getAttribute('value')
        const text = (await opt.textContent())?.trim() || ''
        if (val && val !== '' && val !== '0' && !text.toLowerCase().includes('seleccione')) {
          await sucursalSelect.selectOption(val); break
        }
      }
    }
    const submitBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]')
    if (submitBtn) await submitBtn.click()
    await page.waitForTimeout(5000)

    const runs = []
    for (let i = 1; i <= NUM_RUNS; i++) {
      console.log(`\n[08] ====== RUN ${i}/${NUM_RUNS} ======`)
      let r
      try {
        r = await runOnce(page)
        const v = validateRun(r.appointments)
        r.validation = v
        console.log(`  ✓ Run ${i}: ${r.appointments.length} apps | pass=${v.pass} a=${v.invariant_a_ratio.pass} b=${v.invariant_b_overlap.pass} c=${v.invariant_c_cross_sede.pass}`)
        if (!v.invariant_a_ratio.pass) {
          for (const [sede, dups] of Object.entries(v.invariant_a_ratio.duplicates)) {
            if (dups.length > 0) console.log(`    DUPS ${sede}: ${JSON.stringify(dups)}`)
          }
        }
        if (!v.invariant_c_cross_sede.pass) console.log(`    CROSS: ${JSON.stringify(v.invariant_c_cross_sede.crossSedePhones)}`)
      } catch (err) {
        console.error(`  ✗ Run ${i} FAILED: ${err.name}: ${err.message}`)
        r = { error: err.message, errorName: err.name, appointments: [], validation: null }
      }
      runs.push(r)
      writeArtifact(`run-${i}.json`, r)
    }
    const summary = {
      paradigm: 'F — page.goto(APPOINTMENTS_URL) before EACH sede + paradigm E pagination guard',
      totalRuns: NUM_RUNS,
      successfulRuns: runs.filter(r => !r.error).length,
      runsPassingAllInvariants: runs.filter(r => r.validation?.pass).length,
      runs: runs.map((r, i) => ({
        run: i + 1, error: r.error, totalApps: r.appointments?.length,
        pass: r.validation?.pass,
        a: r.validation?.invariant_a_ratio?.pass,
        b: r.validation?.invariant_b_overlap?.pass,
        c: r.validation?.invariant_c_cross_sede?.pass,
        sedeStats: r.sedeStats,
      })),
    }
    writeArtifact('SUMMARY.json', summary)
    console.log(`\n[08] SUMMARY: ${summary.successfulRuns}/${NUM_RUNS} success, ${summary.runsPassingAllInvariants}/${NUM_RUNS} pass-all-invariants`)
  } catch (err) {
    console.error('[08] ERROR:', err.message, err.stack); process.exit(1)
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}
main().catch(err => { console.error('Fatal:', err); process.exit(1) })
