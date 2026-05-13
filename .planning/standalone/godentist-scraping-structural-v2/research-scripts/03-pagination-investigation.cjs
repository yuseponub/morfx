#!/usr/bin/env node
/**
 * Research script 03 — Pagination investigation.
 *
 * Goals (per CONTEXT.md D-13):
 *  - For each sede, capture pagination state:
 *    - "of X" total pages
 *    - "Displaying A - B of C" text (alternate source)
 *    - `x-tbar-page-next` disabled state
 *    - `x-tbar-page-last` disabled state
 *    - rowCount on current page
 *  - For multi-page sedes (CABECERA), navigate through pages:
 *    - Before/after each clickNextPage, capture state
 *    - Verify rowCount + first row PHONE changes
 *  - For single-page sedes (FLO/JUMBO), attempt clickNextPage on disabled button:
 *    - Does the click do nothing? (expected)
 *    - Does the table change? (would be bug)
 *
 * Output: artifacts in research-evidence/03-pagination-investigation/
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

const EVIDENCE_DIR = path.resolve(__dirname, '..', 'research-evidence', '03-pagination-investigation')

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }
function writeArtifact(name, content) {
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8')
}

async function capturePageState(page) {
  return await page.evaluate(() => {
    const hidden = document.getElementById('idsucursalgrid')

    // Toolbar — both "of X" pattern and "Displaying A - B of C" pattern
    let ofX = null, displayingText = null, ofXFullText = null
    const allElements = document.querySelectorAll('.xtb-text, .x-toolbar-text, td, span, div')
    for (const el of allElements) {
      const text = (el.textContent || '').trim()
      if (text.length > 200) continue
      const ofMatch = text.match(/(?:of|de)\s+(\d+)/i)
      if (ofMatch && !ofX) {
        ofX = parseInt(ofMatch[1])
        ofXFullText = text
      }
      const dispMatch = text.match(/(\d+)\s*-\s*(\d+)\s+(?:of|de)\s+(\d+)/i)
      if (dispMatch && !displayingText) {
        displayingText = { a: parseInt(dispMatch[1]), b: parseInt(dispMatch[2]), c: parseInt(dispMatch[3]), raw: text }
      }
    }

    // Paging buttons + their disabled state
    const buttons = {}
    for (const cls of ['x-tbar-page-first', 'x-tbar-page-prev', 'x-tbar-page-next', 'x-tbar-page-last']) {
      const btn = document.querySelector(`button.${cls}`)
      if (btn) {
        buttons[cls] = {
          disabled: btn.classList.contains('x-item-disabled'),
          ariaDisabled: btn.getAttribute('aria-disabled'),
          parentTable: btn.closest('table')?.className || '',
          outerHTML: btn.outerHTML?.substring(0, 200),
        }
      } else {
        buttons[cls] = null
      }
    }

    // Page input (the one between prev and next that shows current page)
    const pageInputCandidates = []
    const inputs = document.querySelectorAll('input.x-tbar-page-number, .x-toolbar input[type="text"]')
    for (const inp of inputs) {
      pageInputCandidates.push({
        id: inp.id,
        value: inp.value,
        className: inp.className,
      })
    }

    // Grid rows
    const rowTables = document.querySelectorAll('table.x-grid3-row-table')
    const rows = []
    for (let i = 0; i < Math.min(rowTables.length, 5); i++) {
      const cells = Array.from(rowTables[i].querySelectorAll('td')).map(c => (c.textContent || '').trim())
      rows.push({
        hora: cells[1] || '',
        paciente: cells[2] || '',
        phone: cells[5] || '',
      })
    }

    return {
      ts: Date.now(),
      hiddenSucursal: hidden?.value,
      ofX,
      ofXFullText,
      displayingText,
      buttons,
      pageInputs: pageInputCandidates,
      rowCount: rowTables.length,
      firstRows: rows,
    }
  })
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

async function selectSucursal(page, label) {
  await openSucursalCombo(page)
  const item = page.locator(`.x-combo-list-item:visible:has-text("${label}")`)
  if (await item.count() > 0) {
    await item.first().click()
    return true
  }
  await page.keyboard.press('Escape')
  return false
}

async function clickBuscar(page) {
  const btn = await page.$('button:has-text("Buscar")') || await page.$('button:has-text("Filtrar")')
  if (btn) { await btn.click(); return true }
  return false
}

async function clickNextPageRaw(page) {
  // Same logic as adapter's clickNextPage — click without checking disabled
  return await page.evaluate(() => {
    const nextBtn = document.querySelector('button.x-tbar-page-next')
    if (nextBtn) {
      nextBtn.click()
      return { found: true, wasDisabled: nextBtn.classList.contains('x-item-disabled') }
    }
    return { found: false }
  })
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
    // Login + navigate + date + hour (same as script 02)
    console.log('\n[03] Login + setup...')
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
    console.log(`[03] Date: ${dateStr}, hour set`)

    // ── PER-SEDE INVESTIGATION ──
    const sedeReports = {}
    for (const sede of SEDES) {
      console.log(`\n[03] ====== Sede: ${sede} ======`)
      const sedeReport = { sede, expectedId: SEDE_ID_MAP[sede], pages: [] }

      await selectSucursal(page, sede)
      await page.waitForTimeout(500)
      await clickBuscar(page)
      await page.waitForTimeout(3500)

      const initialState = await capturePageState(page)
      console.log(`  hidden=${initialState.hiddenSucursal} (expected ${sedeReport.expectedId})`)
      console.log(`  ofX=${initialState.ofX} | Displaying=${JSON.stringify(initialState.displayingText)}`)
      console.log(`  rowCount=${initialState.rowCount} | firstPhone=${initialState.firstRows[0]?.phone}`)
      console.log(`  next.disabled=${initialState.buttons['x-tbar-page-next']?.disabled} | last.disabled=${initialState.buttons['x-tbar-page-last']?.disabled}`)
      console.log(`  pageInputs=${JSON.stringify(initialState.pageInputs)}`)

      sedeReport.matchesExpectedId = initialState.hiddenSucursal === sedeReport.expectedId
      sedeReport.initialPage = initialState
      sedeReport.totalPagesFromToolbar = initialState.ofX
      sedeReport.totalPagesFromDisplaying = initialState.displayingText
        ? Math.ceil(initialState.displayingText.c / (initialState.displayingText.b - initialState.displayingText.a + 1))
        : null
      sedeReport.totalPagesAgree = sedeReport.totalPagesFromToolbar === sedeReport.totalPagesFromDisplaying

      // Walk through ALL pages
      const totalPages = initialState.ofX || 1
      console.log(`  Navigating through ${totalPages} page(s)...`)

      sedeReport.pages.push({
        pageNum: 1,
        state: initialState,
      })

      for (let p = 2; p <= totalPages; p++) {
        const clickResult = await clickNextPageRaw(page)
        console.log(`    Click next → page ${p}: wasDisabled=${clickResult.wasDisabled}`)
        await page.waitForTimeout(2500)
        const pageState = await capturePageState(page)
        console.log(`      hidden=${pageState.hiddenSucursal} rowCount=${pageState.rowCount} firstPhone=${pageState.firstRows[0]?.phone} next.disabled=${pageState.buttons['x-tbar-page-next']?.disabled}`)
        sedeReport.pages.push({
          pageNum: p,
          clickResult,
          state: pageState,
        })
      }

      // EXTRA TEST: try clickNextPage on the LAST page (button should be disabled)
      console.log(`  Extra test: clickNextPage on last page (button SHOULD be disabled)`)
      const stateBeforeBogusClick = await capturePageState(page)
      const bogusClick = await clickNextPageRaw(page)
      await page.waitForTimeout(2000)
      const stateAfterBogusClick = await capturePageState(page)
      console.log(`    Bogus click wasDisabled=${bogusClick.wasDisabled}`)
      console.log(`    Before: rowCount=${stateBeforeBogusClick.rowCount} firstPhone=${stateBeforeBogusClick.firstRows[0]?.phone}`)
      console.log(`    After:  rowCount=${stateAfterBogusClick.rowCount} firstPhone=${stateAfterBogusClick.firstRows[0]?.phone}`)
      const bogusClickChangedState = stateBeforeBogusClick.firstRows[0]?.phone !== stateAfterBogusClick.firstRows[0]?.phone
        || stateBeforeBogusClick.rowCount !== stateAfterBogusClick.rowCount
      console.log(`    BogusClick changed state? ${bogusClickChangedState} ← KEY (should be false)`)
      sedeReport.bogusClickTest = {
        wasDisabled: bogusClick.wasDisabled,
        changedState: bogusClickChangedState,
        before: { rowCount: stateBeforeBogusClick.rowCount, firstPhone: stateBeforeBogusClick.firstRows[0]?.phone },
        after: { rowCount: stateAfterBogusClick.rowCount, firstPhone: stateAfterBogusClick.firstRows[0]?.phone },
      }

      sedeReports[sede] = sedeReport
      writeArtifact(`${sede.replace(/\s+/g, '-')}.json`, sedeReport)
    }

    // ── SUMMARY ──
    console.log('\n[03] ====== SUMMARY ======')
    const summary = { sedeReports }
    for (const sede of SEDES) {
      const r = sedeReports[sede]
      console.log(`\n${sede}:`)
      console.log(`  hidden=${r.initialPage.hiddenSucursal} expected=${r.expectedId} ✓=${r.matchesExpectedId}`)
      console.log(`  totalPages: ofX=${r.totalPagesFromToolbar} displaying=${r.totalPagesFromDisplaying} agree=${r.totalPagesAgree}`)
      console.log(`  pages walked: ${r.pages.length}`)
      console.log(`  bogusClick: wasDisabled=${r.bogusClickTest.wasDisabled} changedState=${r.bogusClickTest.changedState}`)
    }
    writeArtifact('SUMMARY.json', summary)
    console.log('\n[03] Script COMPLETE')
  } catch (err) {
    console.error('[03] ERROR:', err.message)
    console.error(err.stack)
    try { await page.screenshot({ path: path.join(EVIDENCE_DIR, 'ERROR.png'), fullPage: true }) } catch (e) {}
    process.exit(1)
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
