#!/usr/bin/env node
/**
 * Research script 07 — ExtJS Grid DOM cache hypothesis.
 *
 * Hypothesis: ExtJS retains old-page rows in DOM with display:none after pagination.
 * `querySelectorAll('table.x-grid3-row-table')` captures them, causing apparent
 * duplicates in extracted data (same phone+hora) that paradigm D/E cannot fix.
 *
 * Method for CABECERA:
 *  - On page 1: count visible vs hidden row-tables, capture display states
 *  - Click next, on page 2: same
 *  - Click next, on page 3: same
 *  - Click next, on page 4: same
 *
 * If hypothesis correct: hidden row count grows as we navigate.
 * Fix: filter row-tables by visibility (offsetParent !== null) when extracting.
 */

const path = require('path')
const fs = require('fs')
const { chromium } = require('/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/robot-godentist/node_modules/playwright')

const BASE_URL = 'https://godentist.dentos.co'
const APPOINTMENTS_URL = `${BASE_URL}/citas/index/listcitassimple`
const USERNAME = 'JROMERO'
const PASSWORD = '123456'

const EVIDENCE_DIR = path.resolve(__dirname, '..', 'research-evidence', '07-extjs-grid-dom-cache')
fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

async function captureGridDOMState(page) {
  return await page.evaluate(() => {
    const allRowTables = document.querySelectorAll('table.x-grid3-row-table')
    const states = []
    for (let i = 0; i < allRowTables.length; i++) {
      const rt = allRowTables[i]
      const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
      const offsetParent = rt.offsetParent
      const computed = window.getComputedStyle(rt)
      const parent = rt.parentElement
      const parentComputed = parent ? window.getComputedStyle(parent) : null
      states.push({
        idx: i,
        firstCells: cells.slice(0, 6),
        // Visibility
        offsetParentExists: offsetParent !== null,
        offsetWidth: rt.offsetWidth,
        offsetHeight: rt.offsetHeight,
        display: computed.display,
        visibility: computed.visibility,
        // Parent
        parentTag: parent?.tagName,
        parentClass: parent?.className?.substring(0, 100),
        parentDisplay: parentComputed?.display,
        // Ancestors (climb up looking for x-grid3 view container)
        ancestorClasses: (function() {
          const classes = []
          let p = rt.parentElement
          for (let i = 0; i < 8 && p; i++) {
            classes.push(p.className?.substring(0, 60))
            p = p.parentElement
          }
          return classes
        })(),
      })
    }
    return {
      totalRowTables: allRowTables.length,
      pageInput: document.querySelector('input.x-tbar-page-number')?.value,
      states,
    }
  })
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  try {
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

    // CABECERA default
    const btn = await page.$('button:has-text("Buscar")')
    if (btn) await btn.click()
    await page.waitForTimeout(3500)

    const allPagesStates = []

    for (let p = 1; p <= 4; p++) {
      console.log(`\n=== Page ${p} ===`)
      const state = await captureGridDOMState(page)
      console.log(`  Total rowTables in DOM: ${state.totalRowTables}`)
      console.log(`  pageInput=${state.pageInput}`)
      const visible = state.states.filter(s => s.offsetParentExists && s.offsetWidth > 0 && s.offsetHeight > 0)
      const hidden = state.states.filter(s => !s.offsetParentExists || s.offsetWidth === 0 || s.offsetHeight === 0)
      console.log(`  visible: ${visible.length}, hidden: ${hidden.length}`)
      if (state.states.length > 0) {
        console.log(`  First 2 states:`)
        state.states.slice(0, 2).forEach(s => {
          console.log(`    idx=${s.idx} offsetParentExists=${s.offsetParentExists} W=${s.offsetWidth} H=${s.offsetHeight} display=${s.display} parentClass="${s.parentClass}"`)
        })
        if (hidden.length > 0) {
          console.log(`  First HIDDEN state:`)
          const h = hidden[0]
          console.log(`    idx=${h.idx} cells=${JSON.stringify(h.firstCells)} parentDisplay=${h.parentDisplay}`)
          console.log(`    ancestorClasses: ${JSON.stringify(h.ancestorClasses)}`)
        }
        if (visible.length > 0) {
          console.log(`  First VISIBLE state:`)
          const v = visible[0]
          console.log(`    idx=${v.idx} cells=${JSON.stringify(v.firstCells)} parentDisplay=${v.parentDisplay}`)
          console.log(`    ancestorClasses: ${JSON.stringify(v.ancestorClasses)}`)
        }
      }
      fs.writeFileSync(path.join(EVIDENCE_DIR, `page-${p}-state.json`), JSON.stringify(state, null, 2))
      allPagesStates.push({ page: p, totalRowTables: state.totalRowTables, visibleCount: visible.length, hiddenCount: hidden.length })

      if (p < 4) {
        await page.evaluate(() => document.querySelector('button.x-tbar-page-next')?.click())
        await page.waitForTimeout(2500)
      }
    }

    console.log('\n=== HYPOTHESIS CHECK ===')
    console.log('  Page | Total | Visible | Hidden')
    allPagesStates.forEach(s => {
      console.log(`  ${s.page}    | ${s.totalRowTables}    | ${s.visibleCount}      | ${s.hiddenCount}`)
    })

    const totalGrows = allPagesStates.every((s, i) => i === 0 || s.totalRowTables >= allPagesStates[i-1].totalRowTables)
    const hiddenGrows = allPagesStates.some(s => s.hiddenCount > 0)
    console.log(`\nTotal grows monotonically? ${totalGrows}`)
    console.log(`Hidden rows present? ${hiddenGrows}`)

    if (hiddenGrows) {
      console.log('→ CONFIRMED: ExtJS retains old-page rows in DOM. Fix: filter by offsetParent or x-grid3-row class visibility')
    } else {
      console.log('→ NOT confirmed via this method. The duplicates may have another cause.')
    }
  } catch (err) {
    console.error('ERROR:', err.message, err.stack)
    process.exit(1)
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
