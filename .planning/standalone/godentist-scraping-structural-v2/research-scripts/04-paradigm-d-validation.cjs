#!/usr/bin/env node
/**
 * Research script 04 — PARADIGM D validation.
 *
 * Paradigm D (proposed winner):
 *  - selectSucursal(label) → click dropdown item
 *  - VERIFY #idsucursalgrid.value === expectedNumericId (correctness by construction)
 *  - clickBuscar() + wait networkidle
 *  - RE-VERIFY #idsucursalgrid.value === expectedNumericId (filter didn't drift)
 *  - For pagination: read #ext-comp-1080.value (x-tbar-page-number) BEFORE and AFTER clickNextPage
 *    - If page number did NOT increment → abort pagination (don't re-read same page)
 *  - extractAppointments tags each row with expectedLabel (SAFE because filter verified)
 *
 * Stress: 5 consecutive multi-sede scrapes against tomorrow's appointments.
 * Validator: 3 invariants (CONTEXT.md D-15):
 *  (a) ratio (total/unique by phone+hora) === 1.0 per sede
 *  (b) overlap (phone+hora intersection) === 0 between any pair of sedes
 *  (c) ZERO (phone, fecha) appearing in >1 sede globally
 *
 * Output: 5 JSON outputs + validation result in research-evidence/04-paradigm-d-validation/
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

const EVIDENCE_DIR = path.resolve(__dirname, '..', 'research-evidence', '04-paradigm-d-validation')

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }
function writeArtifact(name, content) {
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8')
}

class FilterDriftError extends Error {
  constructor(sede, expectedId, actualId, when) {
    super(`Filter drift: sede=${sede} expected idsucursalgrid=${expectedId} got=${actualId} when=${when}`)
    this.name = 'FilterDriftError'
  }
}

class PaginationStuckError extends Error {
  constructor(sede, page, totalPages, before, after) {
    super(`Pagination stuck: sede=${sede} page=${page}/${totalPages} pageInput before=${before} after=${after}`)
    this.name = 'PaginationStuckError'
  }
}

async function verifyFilter(page, sede, expectedId, when) {
  const actualId = await page.evaluate(() => document.getElementById('idsucursalgrid')?.value)
  if (actualId !== expectedId) {
    throw new FilterDriftError(sede, expectedId, actualId, when)
  }
  return actualId
}

async function readPageInputValue(page) {
  return await page.evaluate(() => {
    const input = document.querySelector('input.x-tbar-page-number')
    return input ? input.value : null
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

async function extractCurrentPageRows(page, expectedSucursalLabel) {
  return await page.evaluate((sucursalLabel) => {
    const rowTables = document.querySelectorAll('table.x-grid3-row-table')
    const rows = []
    for (const rt of rowTables) {
      const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
      if (cells.length < 6) continue
      const hora = cells[1] || ''
      const paciente = cells[2] || ''
      const estado = cells[3] || ''
      const phone = cells[5] || ''
      if (!hora || !paciente) continue
      rows.push({
        nombre: paciente,
        telefono: phone.startsWith('3') && phone.length === 10 ? '57' + phone : phone,
        hora,
        sucursal: sucursalLabel, // SAFE: filter was verified before extraction (correctness by construction)
        estado,
      })
    }
    return rows
  }, expectedSucursalLabel)
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

async function selectSucursalParadigmD(page, sede, expectedId) {
  await openSucursalCombo(page)
  const item = page.locator(`.x-combo-list-item:visible:has-text("${sede}")`)
  if (await item.count() === 0) {
    await page.keyboard.press('Escape')
    throw new Error(`Sede ${sede} not in dropdown`)
  }
  await item.first().click()
  await page.waitForTimeout(300)
  // CORRECTNESS CHECK 1: immediately after select, hidden field should reflect expectedId
  await verifyFilter(page, sede, expectedId, 'post-select')
}

async function clickBuscarParadigmD(page) {
  const btn = await page.$('button:has-text("Buscar")') || await page.$('button:has-text("Filtrar")')
  if (btn) {
    await btn.click()
  } else {
    await page.locator('#df_fecha').press('Enter')
  }
  // Wait for the network + DOM to settle
  await page.waitForTimeout(3000)
}

async function scrapeAllSedesParadigmD(page) {
  const allRows = []
  const sedeStats = {}

  for (const sede of SEDES) {
    const expectedId = SEDE_ID_MAP[sede]
    console.log(`    [paradigm-D] Sede: ${sede} (expectedId=${expectedId})`)

    await selectSucursalParadigmD(page, sede, expectedId)
    await clickBuscarParadigmD(page)
    await verifyFilter(page, sede, expectedId, 'post-buscar')

    // Read total pages
    const totalPages = await readTotalPagesFromToolbar(page) || 1
    console.log(`      totalPages=${totalPages}`)

    const sedeRows = []
    let pageNum = 1
    while (pageNum <= totalPages) {
      // Before extracting: re-verify filter (defense in depth)
      await verifyFilter(page, sede, expectedId, `page-${pageNum}-pre-extract`)

      // Read pageInput.value before extract
      const pageInputBefore = await readPageInputValue(page)
      console.log(`      Page ${pageNum}: pageInput value=${pageInputBefore}`)

      // Extract current page rows
      const rows = await extractCurrentPageRows(page, sede)
      console.log(`        extracted ${rows.length} rows`)
      sedeRows.push(...rows)

      // If not last page, advance
      if (pageNum < totalPages) {
        // CORRECTNESS: capture page number before click
        const pageInputBeforeClick = await readPageInputValue(page)

        await page.evaluate(() => {
          const nextBtn = document.querySelector('button.x-tbar-page-next')
          if (nextBtn) nextBtn.click()
        })
        await page.waitForTimeout(2000)

        // CORRECTNESS CHECK 2: pageInput value should have incremented
        const pageInputAfterClick = await readPageInputValue(page)
        if (pageInputAfterClick === pageInputBeforeClick) {
          throw new PaginationStuckError(sede, pageNum, totalPages, pageInputBeforeClick, pageInputAfterClick)
        }
        console.log(`        clickNextPage: ${pageInputBeforeClick} → ${pageInputAfterClick}`)
      }
      pageNum++
    }

    allRows.push(...sedeRows)
    sedeStats[sede] = { totalPages, rowCount: sedeRows.length }
  }

  return { rows: allRows, sedeStats }
}

function validateRun(rows) {
  // Group by sede
  const bySede = {}
  for (const r of rows) {
    const key = r.sucursal
    if (!bySede[key]) bySede[key] = []
    bySede[key].push(`${r.telefono}|${r.hora}`)
  }
  // Invariant (a): ratio per sede
  const ratios = {}
  for (const [sede, keys] of Object.entries(bySede)) {
    const unique = new Set(keys).size
    ratios[sede] = { total: keys.length, unique, ratio: unique > 0 ? keys.length / unique : 0 }
  }
  // Invariant (b): pairwise overlap (phone+hora intersection between sedes)
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
  // Invariant (c): NEW — (phone, fecha) appearing in >1 sede globally
  // For this single-day scrape, fecha is implicit (same day) → simply check phone in >1 sede
  const phoneToSedes = {}
  for (const r of rows) {
    if (!phoneToSedes[r.telefono]) phoneToSedes[r.telefono] = new Set()
    phoneToSedes[r.telefono].add(r.sucursal)
  }
  const crossSede = Object.entries(phoneToSedes).filter(([_, s]) => s.size > 1)

  const ratioPass = Object.values(ratios).every(r => r.ratio === 1.0)
  const overlapPass = overlaps.every(o => o.count === 0)
  const crossSedePass = crossSede.length === 0

  return {
    pass: ratioPass && overlapPass && crossSedePass,
    invariant_a_ratio: { pass: ratioPass, details: ratios },
    invariant_b_overlap: { pass: overlapPass, overlaps },
    invariant_c_cross_sede: { pass: crossSedePass, crossSedePhones: crossSede.map(([p, s]) => ({ phone: p, sedes: [...s] })) },
  }
}

async function runOnce(page) {
  // Navigate fresh + set date/hour
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

  // Set hour
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

  const result = await scrapeAllSedesParadigmD(page)
  return { date: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`, appointments: result.rows, sedeStats: result.sedeStats }
}

async function main() {
  ensureDir(EVIDENCE_DIR)
  console.log(`Evidence: ${EVIDENCE_DIR}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  try {
    // Login
    console.log('\n[04] Login...')
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
    console.log('[04] Login OK')

    // Run NUM_RUNS times
    const runs = []
    for (let i = 1; i <= NUM_RUNS; i++) {
      console.log(`\n[04] ====== RUN ${i}/${NUM_RUNS} ======`)
      let runResult
      try {
        runResult = await runOnce(page)
        console.log(`  ✓ Run ${i}: ${runResult.appointments.length} total appointments`)
        for (const [sede, st] of Object.entries(runResult.sedeStats)) {
          console.log(`    ${sede}: ${st.rowCount} rows / ${st.totalPages} pages`)
        }
        // Validate
        const validation = validateRun(runResult.appointments)
        runResult.validation = validation
        console.log(`  Validation: pass=${validation.pass}`)
        if (!validation.pass) {
          console.log(`    invariant (a) ratio: ${validation.invariant_a_ratio.pass}`)
          console.log(`    invariant (b) overlap: ${validation.invariant_b_overlap.pass}`)
          console.log(`    invariant (c) cross-sede: ${validation.invariant_c_cross_sede.pass}`)
          if (!validation.invariant_a_ratio.pass) console.log(`      details:`, JSON.stringify(validation.invariant_a_ratio.details))
          if (!validation.invariant_b_overlap.pass) console.log(`      overlaps:`, JSON.stringify(validation.invariant_b_overlap.overlaps.filter(o => o.count > 0)))
          if (!validation.invariant_c_cross_sede.pass) console.log(`      cross-sede:`, JSON.stringify(validation.invariant_c_cross_sede.crossSedePhones))
        }
      } catch (err) {
        console.error(`  ✗ Run ${i} FAILED: ${err.name}: ${err.message}`)
        runResult = { error: err.message, errorName: err.name, appointments: [], validation: null }
      }
      runs.push(runResult)
      writeArtifact(`run-${i}.json`, runResult)
    }

    // Summary
    console.log('\n[04] ====== SUMMARY ======')
    const summary = {
      paradigm: 'D — combo + idsucursalgrid verification + pageInput.value pagination check',
      totalRuns: NUM_RUNS,
      successfulRuns: runs.filter(r => !r.error).length,
      runsThatPassedAllInvariants: runs.filter(r => r.validation?.pass).length,
      runs: runs.map((r, i) => ({
        run: i + 1,
        error: r.error,
        errorName: r.errorName,
        totalAppointments: r.appointments?.length,
        validationPass: r.validation?.pass,
        sedeStats: r.sedeStats,
      })),
    }
    writeArtifact('SUMMARY.json', summary)
    console.log(`Successful runs: ${summary.successfulRuns}/${summary.totalRuns}`)
    console.log(`Runs passing all 3 invariants: ${summary.runsThatPassedAllInvariants}/${summary.totalRuns}`)

    if (summary.runsThatPassedAllInvariants === NUM_RUNS) {
      console.log('\n✓ PARADIGM D VALIDATED: All runs passed all invariants. Ready for plan-phase.')
    } else {
      console.log('\n✗ PARADIGM D INCOMPLETE: Some runs failed. Review run-*.json for details.')
    }

    console.log('\n[04] Script COMPLETE')
  } catch (err) {
    console.error('[04] ERROR:', err.message)
    console.error(err.stack)
    process.exit(1)
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
