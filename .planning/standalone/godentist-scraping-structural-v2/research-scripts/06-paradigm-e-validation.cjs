#!/usr/bin/env node
/**
 * Research script 06 — PARADIGM E validation (D refined).
 *
 * Refinements over D:
 *  - Post clickNextPage: waitForFunction that BOTH
 *      pageInput.value incremented AND firstRow.phone changed
 *    Timeout 5s. If timeout → 1 retry of clickNextPage. If still timeout → throw.
 *  - Pre-extract: wait for stable DOM (no rapid mutations) for ~500ms
 *
 * Goal: eliminate page-boundary race where rows leak across pages.
 *
 * Stress: 5 consecutive runs, validate 3 invariants.
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

const EVIDENCE_DIR = path.resolve(__dirname, '..', 'research-evidence', '06-paradigm-e-validation')
fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

function writeArtifact(name, content) {
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8')
}

class FilterDriftError extends Error {
  constructor(sede, expectedId, actualId, when) {
    super(`Filter drift: sede=${sede} expected=${expectedId} actual=${actualId} when=${when}`)
    this.name = 'FilterDriftError'
  }
}
class PaginationStuckError extends Error {
  constructor(sede, page, totalPages, before, after, retryAttempted) {
    super(`Pagination stuck: sede=${sede} page=${page}/${totalPages} before=${before} after=${after} retryAttempted=${retryAttempted}`)
    this.name = 'PaginationStuckError'
  }
}

async function verifyFilter(page, expectedId, when) {
  const actualId = await page.evaluate(() => document.getElementById('idsucursalgrid')?.value)
  if (actualId !== expectedId) throw new FilterDriftError(null, expectedId, actualId, when)
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

async function readTotalPagesFromToolbar(page) {
  return await page.evaluate(() => {
    const allElements = document.querySelectorAll('.xtb-text, .x-toolbar-text, td, span, div')
    for (const el of allElements) {
      const text = (el.textContent || '').trim()
      if (text.length > 100) continue
      const m = text.match(/(?:of|de)\s+(\d+)/i)
      if (m) return parseInt(m[1])
    }
    return 0
  })
}

async function extractCurrentPageRows(page, sucursalLabel) {
  return await page.evaluate((label) => {
    const rowTables = document.querySelectorAll('table.x-grid3-row-table')
    return Array.from(rowTables).map(rt => {
      const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
      const phone = cells[5] || ''
      const normalizedPhone = phone.startsWith('3') && phone.length === 10 ? '57' + phone : phone
      return {
        nombre: cells[2] || '',
        telefono: normalizedPhone,
        hora: cells[1] || '',
        sucursal: label,
        estado: cells[3] || '',
      }
    }).filter(r => r.hora && r.nombre)
  }, sucursalLabel)
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

async function selectSucursal(page, label, expectedId) {
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

async function clickBuscar(page) {
  const btn = await page.$('button:has-text("Buscar")') || await page.$('button:has-text("Filtrar")')
  if (btn) await btn.click()
  else await page.locator('#df_fecha').press('Enter')
  await page.waitForTimeout(3000)
}

async function clickNextPageE(page, sede, currentPage, totalPages) {
  const fpBefore = await readFirstRowFingerprint(page)
  const pageBefore = await readPageInputValue(page)

  async function attemptClick() {
    await page.evaluate(() => {
      const btn = document.querySelector('button.x-tbar-page-next')
      if (btn) btn.click()
    })
    // Wait for BOTH conditions: pageInput incremented AND firstRow changed
    try {
      await page.waitForFunction(({ pageBefore, fpBefore }) => {
        const pageInput = document.querySelector('input.x-tbar-page-number')
        const currentPage = pageInput?.value
        if (currentPage === pageBefore) return false
        const rt = document.querySelector('table.x-grid3-row-table')
        if (!rt) return false
        const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
        const phone = cells[5] || ''
        const hora = cells[1] || ''
        return phone !== fpBefore.phone || hora !== fpBefore.hora
      }, { pageBefore, fpBefore }, { timeout: 5000, polling: 100 })
      return true
    } catch (e) {
      return false
    }
  }

  let ok = await attemptClick()
  if (!ok) {
    console.log(`      retry clickNextPage for ${sede} page ${currentPage}→${currentPage+1}`)
    await page.waitForTimeout(500)
    ok = await attemptClick()
  }
  if (!ok) {
    const pageAfter = await readPageInputValue(page)
    throw new PaginationStuckError(sede, currentPage, totalPages, pageBefore, pageAfter, true)
  }
  // Final settle wait
  await page.waitForTimeout(500)
}

async function scrapeAllSedes(page) {
  const allRows = []
  const sedeStats = {}

  for (const sede of SEDES) {
    const expectedId = SEDE_ID_MAP[sede]
    console.log(`    [E] Sede: ${sede} (expectedId=${expectedId})`)
    await selectSucursal(page, sede, expectedId)
    await clickBuscar(page)
    await verifyFilter(page, expectedId, `post-buscar-${sede}`)

    const totalPages = await readTotalPagesFromToolbar(page) || 1
    console.log(`      totalPages=${totalPages}`)

    const sedeRows = []
    for (let p = 1; p <= totalPages; p++) {
      await verifyFilter(page, expectedId, `page-${p}-pre-extract-${sede}`)
      const pageInput = await readPageInputValue(page)
      const fp = await readFirstRowFingerprint(page)
      console.log(`      Page ${p}: pageInput=${pageInput} firstPhone=${fp?.phone}`)

      const rows = await extractCurrentPageRows(page, sede)
      sedeRows.push(...rows)
      console.log(`        extracted ${rows.length} rows`)

      if (p < totalPages) {
        await clickNextPageE(page, sede, p, totalPages)
      }
    }

    allRows.push(...sedeRows)
    sedeStats[sede] = { totalPages, rowCount: sedeRows.length }
  }
  return { rows: allRows, sedeStats }
}

function validateRun(rows) {
  const bySede = {}
  for (const r of rows) {
    if (!bySede[r.sucursal]) bySede[r.sucursal] = []
    bySede[r.sucursal].push(`${r.telefono}|${r.hora}`)
  }
  const ratios = {}
  const duplicates = {}
  for (const [sede, keys] of Object.entries(bySede)) {
    const unique = new Set(keys).size
    ratios[sede] = { total: keys.length, unique, ratio: unique > 0 ? keys.length / unique : 0 }
    // Find specific duplicates
    const counts = {}
    keys.forEach(k => { counts[k] = (counts[k] || 0) + 1 })
    duplicates[sede] = Object.entries(counts).filter(([_, c]) => c > 1)
  }
  const sedeKeys = Object.keys(bySede)
  const overlaps = []
  for (let i = 0; i < sedeKeys.length; i++) {
    for (let j = i + 1; j < sedeKeys.length; j++) {
      const a = new Set(bySede[sedeKeys[i]])
      const b = new Set(bySede[sedeKeys[j]])
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

async function runOnce(page) {
  await page.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = `${String(tomorrow.getDate()).padStart(2,'0')}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${tomorrow.getFullYear()}`
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

  const result = await scrapeAllSedes(page)
  return { date: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`, appointments: result.rows, sedeStats: result.sedeStats }
}

async function main() {
  console.log(`Evidence: ${EVIDENCE_DIR}`)
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  try {
    console.log('[06] Login...')
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
      console.log(`\n[06] ====== RUN ${i}/${NUM_RUNS} ======`)
      let runResult
      try {
        runResult = await runOnce(page)
        console.log(`  ✓ Run ${i}: ${runResult.appointments.length} apps`)
        const v = validateRun(runResult.appointments)
        runResult.validation = v
        console.log(`  Validation: pass=${v.pass} a=${v.invariant_a_ratio.pass} b=${v.invariant_b_overlap.pass} c=${v.invariant_c_cross_sede.pass}`)
        if (!v.invariant_a_ratio.pass) {
          for (const [sede, dups] of Object.entries(v.invariant_a_ratio.duplicates)) {
            if (dups.length > 0) console.log(`    DUPS in ${sede}: ${JSON.stringify(dups)}`)
          }
        }
        if (!v.invariant_c_cross_sede.pass) console.log(`    CROSS-SEDE: ${JSON.stringify(v.invariant_c_cross_sede.crossSedePhones)}`)
      } catch (err) {
        console.error(`  ✗ Run ${i} FAILED: ${err.name}: ${err.message}`)
        runResult = { error: err.message, errorName: err.name, appointments: [], validation: null }
      }
      runs.push(runResult)
      writeArtifact(`run-${i}.json`, runResult)
    }

    const summary = {
      paradigm: 'E — D + waitForFunction(pageInput+firstRow) + 1 retry',
      totalRuns: NUM_RUNS,
      successfulRuns: runs.filter(r => !r.error).length,
      runsPassingAllInvariants: runs.filter(r => r.validation?.pass).length,
      runs: runs.map((r, i) => ({
        run: i + 1,
        error: r.error,
        totalApps: r.appointments?.length,
        pass: r.validation?.pass,
        invariantA: r.validation?.invariant_a_ratio?.pass,
        invariantB: r.validation?.invariant_b_overlap?.pass,
        invariantC: r.validation?.invariant_c_cross_sede?.pass,
        sedeStats: r.sedeStats,
      })),
    }
    writeArtifact('SUMMARY.json', summary)
    console.log(`\n[06] SUMMARY: ${summary.successfulRuns}/${NUM_RUNS} success, ${summary.runsPassingAllInvariants}/${NUM_RUNS} pass-all-invariants`)
  } catch (err) {
    console.error('[06] ERROR:', err.message, err.stack)
    process.exit(1)
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
