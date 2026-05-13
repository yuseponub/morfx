#!/usr/bin/env node
/**
 * Research script 02 — Sede switching timeline + ID numérico mapping.
 *
 * Goals:
 *  - Build label → numeric ID map for the 4 sedes (CABECERA, FLORIDABLANCA, JUMBO, MEJORAS)
 *  - For each switch (sede A → sede B), capture timeline of state changes:
 *    - #idsucursalgrid.value (hidden field — source of truth for ID)
 *    - visible combo input value (label)
 *    - window.Sucursal (JS global)
 *    - toolbar "of X" text (paging total)
 *    - first row of grid table (phone + hora — fingerprint)
 *    - rowCount of grid tables
 *  - Sample timeline at: 0ms, 100ms, 250ms, 500ms, 1s, 2s, 4s post selectSucursal click
 *  - And again post-clickBuscar at same intervals
 *
 * Output: timeline JSON per pair + final summary
 */

const path = require('path')
const fs = require('fs')

const { chromium } = require('/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/robot-godentist/node_modules/playwright')

const BASE_URL = 'https://godentist.dentos.co'
const APPOINTMENTS_URL = `${BASE_URL}/citas/index/listcitassimple`
const USERNAME = 'JROMERO'
const PASSWORD = '123456'

const SEDES = ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS']
const SAMPLE_INTERVALS_MS = [0, 100, 250, 500, 1000, 2000, 4000]

const EVIDENCE_DIR = path.resolve(__dirname, '..', 'research-evidence', '02-sede-switching-timeline')

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }
function writeArtifact(name, content) {
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8')
}

async function captureState(page) {
  return await page.evaluate(() => {
    const hidden = document.getElementById('idsucursalgrid')
    let visibleValue = null, visibleId = null
    let parent = hidden?.parentElement
    for (let i = 0; i < 5 && parent; i++) {
      const textInputs = parent.querySelectorAll('input[type="text"]')
      for (const inp of textInputs) {
        if (inp.id && inp.id !== 'idsucursalgrid') {
          visibleId = inp.id
          visibleValue = inp.value
          break
        }
      }
      if (visibleValue !== null) break
      parent = parent.parentElement
    }

    // Toolbar text — look for "of X" pattern
    let toolbarOfX = null
    let toolbarFullText = null
    const allElements = document.querySelectorAll('.xtb-text, .x-toolbar-text, td, span, div')
    for (const el of allElements) {
      const text = (el.textContent || '').trim()
      const match = text.match(/(?:of|de)\s+(\d+)/i)
      if (match && text.length < 100) {
        toolbarOfX = parseInt(match[1])
        toolbarFullText = text
        break
      }
    }

    // Paging buttons disabled state
    const pagingButtons = {}
    for (const cls of ['x-tbar-page-first', 'x-tbar-page-prev', 'x-tbar-page-next', 'x-tbar-page-last']) {
      const btn = document.querySelector(`button.${cls}`)
      if (btn) {
        pagingButtons[cls] = btn.classList.contains('x-item-disabled')
      }
    }

    // Grid rows — count + first row
    // ExtJS grid uses x-grid3-row-table (one table per row)
    const rowTables = document.querySelectorAll('table.x-grid3-row-table')
    let firstRow = null
    if (rowTables.length > 0) {
      const cells = Array.from(rowTables[0].querySelectorAll('td')).map(c => (c.textContent || '').trim())
      // Heuristic from script 01: cell[1] = hora, cell[2] = paciente, cell[5] = phone
      firstRow = {
        hora: cells[1] || '',
        paciente: cells[2] || '',
        phone: cells[5] || '',
        allCells: cells,
      }
    }

    // Window.Sucursal global
    let windowSucursal = null
    try { windowSucursal = window.Sucursal } catch (e) {}

    return {
      ts: Date.now(),
      hidden: hidden ? { value: hidden.value, name: hidden.getAttribute('name') } : null,
      visible: visibleId ? { id: visibleId, value: visibleValue } : null,
      windowSucursal,
      toolbar: { ofX: toolbarOfX, fullText: toolbarFullText },
      pagingButtons,
      grid: { rowCount: rowTables.length, firstRow },
    }
  })
}

async function sampleTimeline(page, label, intervals) {
  const samples = []
  const startTime = Date.now()
  for (const ms of intervals) {
    const elapsed = Date.now() - startTime
    const wait = Math.max(0, ms - elapsed)
    if (wait > 0) await page.waitForTimeout(wait)
    const state = await captureState(page)
    state.intervalMs = ms
    state.label = label
    samples.push(state)
  }
  return samples
}

async function openSucursalCombo(page) {
  const comboId = await page.evaluate(() => {
    const hidden = document.getElementById('idsucursalgrid')
    let parent = hidden?.parentElement
    for (let i = 0; i < 5 && parent; i++) {
      const textInputs = parent.querySelectorAll('input[type="text"]')
      for (const inp of textInputs) {
        if (inp.id && inp.id !== 'idsucursalgrid') return inp.id
      }
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
  const btn = await page.$('button:has-text("Buscar")')
    || await page.$('.x-btn:has-text("Buscar")')
    || await page.$('button:has-text("Filtrar")')
  if (btn) {
    await btn.click()
    return true
  }
  return false
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
    // ── Login ──
    console.log('\n[02] Login...')
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    const usernameField = await page.$('input.username') || await page.$('input[type="text"]')
    const passwordField = await page.$('input.password') || await page.$('input[type="password"]')
    await usernameField.fill(USERNAME)
    await passwordField.fill(PASSWORD)
    const sucursalSelect = await page.$('select')
    if (sucursalSelect) {
      const options = await sucursalSelect.$$('option')
      for (const opt of options) {
        const val = await opt.getAttribute('value')
        const text = (await opt.textContent())?.trim() || ''
        if (val && val !== '' && val !== '0' && !text.toLowerCase().includes('seleccione')) {
          await sucursalSelect.selectOption(val)
          break
        }
      }
    }
    const submitBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]')
    if (submitBtn) await submitBtn.click()
    else await passwordField.press('Enter')
    await page.waitForTimeout(5000)

    // ── Navigate to appointments ──
    await page.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)

    // ── Set date (tomorrow) + hour (6:00 AM) ──
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = `${String(tomorrow.getDate()).padStart(2,'0')}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${tomorrow.getFullYear()}`
    console.log(`\n[02] Set date: ${dateStr}`)
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

    // ── PHASE A: Build label → numericId map by selecting each sede ──
    console.log('\n[02] PHASE A — Building label → numericId map')
    const idMap = {}
    for (const label of SEDES) {
      const selected = await selectSucursal(page, label)
      if (selected) {
        await page.waitForTimeout(300)
        const state = await captureState(page)
        idMap[label] = {
          numericId: state.hidden?.value,
          visibleValue: state.visible?.value,
          windowSucursal: state.windowSucursal,
        }
        console.log(`  ${label}: hidden=${idMap[label].numericId} visible="${idMap[label].visibleValue}" windowSucursal=${idMap[label].windowSucursal}`)
      } else {
        idMap[label] = { error: 'not found in dropdown' }
        console.log(`  ${label}: NOT FOUND`)
      }
    }
    writeArtifact('00-sede-id-map.json', idMap)

    // ── PHASE B: For each pair (current → next), capture timeline ──
    console.log('\n[02] PHASE B — Switching timeline (selectSucursal + clickBuscar each pair)')
    const timelines = []

    // Start from the LAST sede selected (MEJORAS PUBLICAS) and rotate through all 4 pairs
    // We'll do: MEJORAS → CABECERA → FLO → JUMBO → MEJORAS (closing the loop)
    const rotation = ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS', 'CABECERA']
    for (let i = 0; i < rotation.length - 1; i++) {
      const from = rotation[i]
      const to = rotation[i + 1]
      console.log(`\n  Switch: ${from} → ${to}`)

      // Step 1: ensure we're in `from` state (already loaded with buscar)
      const selFrom = await selectSucursal(page, from)
      if (!selFrom) {
        console.log(`    ${from} not found — skipping pair`)
        continue
      }
      await page.waitForTimeout(300)
      await clickBuscar(page)
      await page.waitForTimeout(3500) // wait for table to fully load
      const stateBeforeSwitch = await captureState(page)
      console.log(`    ${from} loaded: rowCount=${stateBeforeSwitch.grid.rowCount} ofX=${stateBeforeSwitch.toolbar.ofX} hidden=${stateBeforeSwitch.hidden?.value} firstRow.phone=${stateBeforeSwitch.grid.firstRow?.phone}`)

      // Step 2: Open combo + click `to` item — capture timeline starting RIGHT AFTER click
      await openSucursalCombo(page)
      const targetItem = page.locator(`.x-combo-list-item:visible:has-text("${to}")`)
      if (await targetItem.count() === 0) {
        await page.keyboard.press('Escape')
        console.log(`    ${to} not found in dropdown — skipping`)
        continue
      }
      const clickStartTs = Date.now()
      await targetItem.first().click()

      // Sample timeline after selectSucursal click (BEFORE clickBuscar)
      const selectSamples = await sampleTimeline(page, `select(${from}→${to})`, SAMPLE_INTERVALS_MS)
      selectSamples.unshift({ ...stateBeforeSwitch, intervalMs: -1, label: `before-select(${from}→${to})` })

      // Step 3: Click Buscar + sample again
      const buscarStartTs = Date.now()
      await clickBuscar(page)
      const buscarSamples = await sampleTimeline(page, `buscar(${from}→${to})`, SAMPLE_INTERVALS_MS)

      const pair = {
        from, to,
        clickStartTs,
        buscarStartTs,
        selectSamples,
        buscarSamples,
      }
      timelines.push(pair)

      // Print key findings
      const postSelectFinal = selectSamples[selectSamples.length - 1]
      const postBuscarFinal = buscarSamples[buscarSamples.length - 1]
      console.log(`    Post-select 4s: hidden=${postSelectFinal.hidden?.value} visible="${postSelectFinal.visible?.value}" ofX=${postSelectFinal.toolbar.ofX} rowCount=${postSelectFinal.grid.rowCount} firstPhone=${postSelectFinal.grid.firstRow?.phone}`)
      console.log(`    Post-buscar 4s: hidden=${postBuscarFinal.hidden?.value} visible="${postBuscarFinal.visible?.value}" ofX=${postBuscarFinal.toolbar.ofX} rowCount=${postBuscarFinal.grid.rowCount} firstPhone=${postBuscarFinal.grid.firstRow?.phone}`)
    }

    writeArtifact('01-switching-timelines.json', timelines)

    // ── PHASE C: Summary of findings ──
    console.log('\n[02] PHASE C — Summary')
    const summary = {
      sedeIdMap: idMap,
      pairsAnalyzed: timelines.length,
      keyFindings: [],
    }

    for (const pair of timelines) {
      const before = pair.selectSamples[0]
      const postSelect0ms = pair.selectSamples[1] // index 0 = before, 1 = ms=0
      const postSelect4s = pair.selectSamples[pair.selectSamples.length - 1]
      const postBuscar4s = pair.buscarSamples[pair.buscarSamples.length - 1]

      // Did hidden update IMMEDIATELY after select?
      const hiddenUpdatedAtMs = pair.selectSamples.find(s => s.intervalMs >= 0 && s.hidden?.value !== before.hidden?.value)?.intervalMs
      // Did toolbar update after select (without buscar)?
      const toolbarUpdatedSelectMs = pair.selectSamples.find(s => s.intervalMs >= 0 && s.toolbar.ofX !== before.toolbar.ofX)?.intervalMs
      // Did toolbar update after buscar?
      const toolbarUpdatedBuscarMs = pair.buscarSamples.find(s => s.toolbar.ofX !== before.toolbar.ofX)?.intervalMs
      // Did first row change after buscar?
      const firstRowChangedMs = pair.buscarSamples.find(s => s.grid.firstRow?.phone !== before.grid.firstRow?.phone)?.intervalMs

      summary.keyFindings.push({
        switch: `${pair.from} → ${pair.to}`,
        beforeState: {
          hidden: before.hidden?.value,
          ofX: before.toolbar.ofX,
          rowCount: before.grid.rowCount,
          firstPhone: before.grid.firstRow?.phone,
        },
        hiddenUpdatedAtMs: hiddenUpdatedAtMs ?? 'never within timeline',
        toolbarUpdatedSelectMs: toolbarUpdatedSelectMs ?? 'never (waiting for buscar)',
        toolbarUpdatedBuscarMs: toolbarUpdatedBuscarMs ?? 'never within timeline',
        firstRowChangedMs: firstRowChangedMs ?? 'never within timeline',
        finalHidden: postBuscar4s.hidden?.value,
        finalOfX: postBuscar4s.toolbar.ofX,
        finalRowCount: postBuscar4s.grid.rowCount,
        finalFirstPhone: postBuscar4s.grid.firstRow?.phone,
      })
    }

    writeArtifact('02-summary.json', summary)
    console.log('\n[02] Findings:')
    for (const f of summary.keyFindings) {
      console.log(`  ${f.switch}:`)
      console.log(`    hidden updated at: ${f.hiddenUpdatedAtMs}ms`)
      console.log(`    toolbar updated (post-select alone): ${f.toolbarUpdatedSelectMs}`)
      console.log(`    toolbar updated (post-buscar): ${f.toolbarUpdatedBuscarMs}ms`)
      console.log(`    firstRow changed (post-buscar): ${f.firstRowChangedMs}ms`)
      console.log(`    final: hidden=${f.finalHidden} ofX=${f.finalOfX} rowCount=${f.finalRowCount}`)
    }

    console.log('\n[02] Script COMPLETE')
  } catch (err) {
    console.error('[02] ERROR:', err.message)
    console.error(err.stack)
    try {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'ERROR-final.png'), fullPage: true })
    } catch (e) {}
    process.exit(1)
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
