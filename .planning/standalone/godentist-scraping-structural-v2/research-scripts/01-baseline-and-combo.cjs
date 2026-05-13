#!/usr/bin/env node
/**
 * Research script 01 — Baseline portal Dentos + combo de sede investigation.
 *
 * Goals:
 *  - Login con JROMERO/123456
 *  - Navegar a /citas/index/listcitassimple
 *  - Capturar HTML inicial de la página de citas
 *  - Investigar el combo de sede:
 *    - HTML del combo cerrado (qué value tiene el input visible?)
 *    - HTML del combo abierto (qué items aparecen?)
 *    - HTML del hidden #idsucursalgrid
 *    - Después de seleccionar una sede, ¿el input visible muestra el label?
 *  - Investigar la tabla de citas:
 *    - ¿Cuántas columnas tiene?
 *    - ¿Alguna columna expone la sede? (data-attribute, tooltip, columna visible)
 *
 * Output: artefactos en ../research-evidence/01-baseline-and-combo/
 */

const path = require('path')
const fs = require('fs')

const PLAYWRIGHT_PATH = '/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/robot-godentist/node_modules/playwright'
const { chromium } = require(PLAYWRIGHT_PATH)

const BASE_URL = 'https://godentist.dentos.co'
const APPOINTMENTS_URL = `${BASE_URL}/citas/index/listcitassimple`
const USERNAME = 'JROMERO'
const PASSWORD = '123456'

const EVIDENCE_DIR = path.resolve(__dirname, '..', 'research-evidence', '01-baseline-and-combo')

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function writeArtifact(name, content) {
  const filePath = path.join(EVIDENCE_DIR, name)
  fs.writeFileSync(filePath, content, 'utf-8')
  console.log(`  → wrote ${name} (${typeof content === 'string' ? content.length : 'buffer'} bytes)`)
}

async function main() {
  ensureDir(EVIDENCE_DIR)
  console.log(`Evidence directory: ${EVIDENCE_DIR}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  try {
    // ── Step 1: Login ──
    console.log('\n[01] Login...')
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '01-login-page.png'), fullPage: true })

    const usernameField = await page.$('input.username') || await page.$('input[type="text"]')
    const passwordField = await page.$('input.password') || await page.$('input[type="password"]')

    if (!usernameField || !passwordField) {
      throw new Error('Login form not found')
    }

    await usernameField.click()
    await usernameField.fill(USERNAME)
    await passwordField.click()
    await passwordField.fill(PASSWORD)

    const sucursalSelect = await page.$('#login-form select') || await page.$('select')
    if (sucursalSelect) {
      const options = await sucursalSelect.$$('option')
      for (const opt of options) {
        const val = await opt.getAttribute('value')
        const text = (await opt.textContent())?.trim() || ''
        if (val && val !== '' && val !== '0' && !text.toLowerCase().includes('seleccione')) {
          await sucursalSelect.selectOption(val)
          console.log(`  Login sucursal: ${text}`)
          break
        }
      }
    }

    const submitBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]')
    if (submitBtn) await submitBtn.click()
    else await passwordField.press('Enter')

    await page.waitForTimeout(5000)
    const postLoginUrl = page.url()
    console.log(`  Post-login URL: ${postLoginUrl}`)
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '02-post-login.png'), fullPage: true })

    // ── Step 2: Navigate to appointments ──
    console.log('\n[02] Navigate to appointments page...')
    await page.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '03-appointments-initial.png'), fullPage: true })

    const initialHTML = await page.content()
    writeArtifact('03-appointments-initial.html', initialHTML)

    // ── Step 3: Set date + hour to ensure table loads with data ──
    // Use tomorrow's date (DD-MM-YYYY) so we have appointments to see
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dd = String(tomorrow.getDate()).padStart(2, '0')
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
    const yyyy = tomorrow.getFullYear()
    const dateStr = `${dd}-${mm}-${yyyy}`
    console.log(`\n[03] Set date to ${dateStr}`)

    const dateInput = page.locator('#df_fecha')
    await dateInput.click({ clickCount: 3 })
    await dateInput.fill(dateStr)
    await dateInput.press('Tab')
    await page.waitForTimeout(1500)

    // Set hour to earliest
    console.log('[03] Set hour to 6:00 am')
    const comboHourInputId = await page.evaluate(() => {
      const hidden = document.getElementById('idhoras')
      if (!hidden) return null
      let parent = hidden.parentElement
      for (let i = 0; i < 8 && parent; i++) {
        const textInputs = parent.querySelectorAll('input[type="text"]')
        for (const inp of textInputs) {
          if (inp.id && inp.id !== 'idhoras') return inp.id
        }
        parent = parent.parentElement
      }
      return null
    })
    if (comboHourInputId) {
      const hourInput = page.locator(`#${comboHourInputId}`)
      const trigger = hourInput.locator('..').locator('.x-form-trigger')
      if (await trigger.count() > 0) {
        await trigger.click()
        await page.waitForTimeout(800)
        const options = await page.locator('.x-combo-list-item:visible').allTextContents()
        console.log(`  Hour options: ${options.slice(0, 5).join(', ')}...`)
        if (options.length > 0) {
          await page.locator('.x-combo-list-item:visible').first().click()
        }
      }
    }
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '04-after-date-hour.png'), fullPage: true })

    // ── Step 4: Investigate combo de sede — CLOSED state ──
    console.log('\n[04] Investigate sucursal combo — CLOSED state...')

    const comboInspection = await page.evaluate(() => {
      const hidden = document.getElementById('idsucursalgrid')
      if (!hidden) return { error: 'idsucursalgrid not found' }

      let visibleInput = null
      let parent = hidden.parentElement
      for (let i = 0; i < 5 && parent; i++) {
        const textInputs = parent.querySelectorAll('input[type="text"]')
        for (const inp of textInputs) {
          if (inp.id && inp.id !== 'idsucursalgrid') {
            visibleInput = inp
            break
          }
        }
        if (visibleInput) break
        parent = parent.parentElement
      }

      return {
        hiddenId: hidden.id,
        hiddenName: hidden.getAttribute('name'),
        hiddenValue: hidden.value,
        hiddenParent: hidden.parentElement?.outerHTML?.substring(0, 800),
        visibleId: visibleInput?.id,
        visibleValue: visibleInput?.value,
        visibleClassName: visibleInput?.className,
        visibleOuterHTML: visibleInput?.outerHTML?.substring(0, 500),
        wrapper: visibleInput?.closest('.x-form-field-wrap')?.outerHTML?.substring(0, 1500),
      }
    })

    writeArtifact('05-combo-closed-state.json', JSON.stringify(comboInspection, null, 2))
    console.log(`  hidden #idsucursalgrid value: "${comboInspection.hiddenValue}"`)
    console.log(`  visible input #${comboInspection.visibleId} value: "${comboInspection.visibleValue}"`)

    // ── Step 5: Open combo + capture dropdown items ──
    console.log('\n[05] Open combo + capture dropdown items...')
    if (comboInspection.visibleId) {
      const trigger = page.locator(`#${comboInspection.visibleId}`).locator('..').locator('.x-form-trigger')
      if (await trigger.count() > 0) {
        await trigger.click()
      } else {
        await page.locator(`#${comboInspection.visibleId}`).click()
      }
      await page.waitForTimeout(1000)
      await page.screenshot({ path: path.join(EVIDENCE_DIR, '06-combo-open.png'), fullPage: true })

      const dropdownItems = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.x-combo-list-item'))
        return items.map((item, idx) => ({
          idx,
          text: (item.textContent || '').trim(),
          visible: !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length),
          className: item.className,
          outerHTML: item.outerHTML?.substring(0, 300),
        }))
      })
      writeArtifact('06-dropdown-items.json', JSON.stringify(dropdownItems, null, 2))
      const visible = dropdownItems.filter(i => i.visible)
      console.log(`  Total items: ${dropdownItems.length}, visible: ${visible.length}`)
      visible.forEach(i => console.log(`    - "${i.text}"`))

      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }

    // ── Step 6: Select CABECERA + capture combo state post-select ──
    console.log('\n[06] Select CABECERA + investigate post-select state...')
    if (comboInspection.visibleId) {
      const trigger = page.locator(`#${comboInspection.visibleId}`).locator('..').locator('.x-form-trigger')
      if (await trigger.count() > 0) await trigger.click()
      else await page.locator(`#${comboInspection.visibleId}`).click()
      await page.waitForTimeout(800)

      const cabeceraItem = page.locator('.x-combo-list-item:visible:has-text("CABECERA")')
      if (await cabeceraItem.count() > 0) {
        await cabeceraItem.click()
        console.log('  Clicked CABECERA item')
        await page.waitForTimeout(500)
      }

      // Capture state IMMEDIATELY after select (no clickBuscar yet)
      const postSelectState = await page.evaluate((visId) => {
        const hidden = document.getElementById('idsucursalgrid')
        const visible = document.getElementById(visId)
        return {
          ts: Date.now(),
          hiddenValue: hidden?.value,
          visibleValue: visible?.value,
        }
      }, comboInspection.visibleId)
      writeArtifact('07-post-select-cabecera-immediate.json', JSON.stringify(postSelectState, null, 2))
      console.log(`  IMMEDIATE post-select: hidden="${postSelectState.hiddenValue}" visible="${postSelectState.visibleValue}"`)

      await page.screenshot({ path: path.join(EVIDENCE_DIR, '07-post-select-cabecera.png'), fullPage: true })
    }

    // ── Step 7: Click Buscar + capture table HTML structure ──
    console.log('\n[07] Click Buscar + capture table structure for CABECERA...')
    const buscarBtn = await page.$('button:has-text("Buscar")')
      || await page.$('.x-btn:has-text("Buscar")')
      || await page.$('button:has-text("Filtrar")')
    if (buscarBtn) {
      await buscarBtn.click()
      console.log('  Clicked Buscar')
    } else {
      await page.locator('#df_fecha').press('Enter')
    }
    await page.waitForTimeout(4000)
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '08-table-cabecera.png'), fullPage: true })

    const tableStructure = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'))
      const tableInfos = tables.map((t, idx) => {
        const rows = Array.from(t.querySelectorAll('tbody tr'))
        const headers = Array.from(t.querySelectorAll('thead th, thead td')).map(h => (h.textContent || '').trim())
        const firstRowCells = rows[0]
          ? Array.from(rows[0].querySelectorAll('td')).map((c, ci) => ({
              cellIdx: ci,
              text: (c.textContent || '').trim().substring(0, 100),
              className: c.className,
              dataAttrs: Array.from(c.attributes).filter(a => a.name.startsWith('data-')).map(a => `${a.name}="${a.value}"`),
              title: c.getAttribute('title'),
            }))
          : []
        return {
          tableIdx: idx,
          tableClass: t.className,
          tableId: t.id,
          rowCount: rows.length,
          headers,
          firstRowCells,
        }
      })
      return tableInfos
    })
    writeArtifact('08-table-structure-cabecera.json', JSON.stringify(tableStructure, null, 2))
    console.log(`  Tables found: ${tableStructure.length}`)
    tableStructure.forEach(t => {
      if (t.rowCount > 0) {
        console.log(`    Table[${t.tableIdx}] class="${t.tableClass.substring(0, 50)}" rows=${t.rowCount}`)
        console.log(`      Headers: ${t.headers.join(' | ')}`)
        if (t.firstRowCells.length > 0) {
          console.log(`      First row ${t.firstRowCells.length} cells`)
        }
      }
    })

    // ── Step 8: Capture full HTML of the appointments page after table load ──
    console.log('\n[08] Capture full HTML of appointments page with table loaded...')
    const fullHTML = await page.content()
    writeArtifact('09-full-page-cabecera.html', fullHTML)

    // ── Step 9: Capture toolbar HTML ──
    console.log('\n[09] Capture paging toolbar HTML...')
    const toolbarInfo = await page.evaluate(() => {
      const candidates = []
      // ExtJS paging toolbar usually has .x-paging-info or contains "Displaying"
      const allElements = document.querySelectorAll('.xtb-text, .x-toolbar-text, td, span, div')
      for (const el of allElements) {
        const text = (el.textContent || '').trim()
        if (/(?:of|de)\s+\d+/i.test(text) && text.length < 100) {
          candidates.push({
            tag: el.tagName,
            className: el.className,
            text,
            outerHTML: el.outerHTML?.substring(0, 300),
          })
        }
        if (/displaying|mostrando/i.test(text) && text.length < 200) {
          candidates.push({
            tag: el.tagName,
            className: el.className,
            text,
            outerHTML: el.outerHTML?.substring(0, 400),
          })
        }
      }
      // Capture buttons of paging toolbar
      const pagingButtons = []
      const btns = document.querySelectorAll('button.x-tbar-page-first, button.x-tbar-page-prev, button.x-tbar-page-next, button.x-tbar-page-last')
      for (const b of btns) {
        pagingButtons.push({
          className: b.className,
          disabled: b.classList.contains('x-item-disabled'),
          ariaDisabled: b.getAttribute('aria-disabled'),
          outerHTML: b.outerHTML?.substring(0, 200),
        })
      }
      return { candidates: candidates.slice(0, 20), pagingButtons }
    })
    writeArtifact('10-toolbar-cabecera.json', JSON.stringify(toolbarInfo, null, 2))
    console.log(`  Toolbar text candidates: ${toolbarInfo.candidates.length}`)
    toolbarInfo.candidates.slice(0, 5).forEach(c => console.log(`    "${c.text}"`))
    console.log(`  Paging buttons: ${toolbarInfo.pagingButtons.length}`)
    toolbarInfo.pagingButtons.forEach(b => console.log(`    ${b.className.match(/x-tbar-page-\w+/)?.[0]} disabled=${b.disabled}`))

    console.log('\n[01] Script 01 COMPLETE')
  } catch (err) {
    console.error('[01] ERROR:', err.message)
    console.error(err.stack)
    try {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'ERROR-final-state.png'), fullPage: true })
      const errHTML = await page.content()
      writeArtifact('ERROR-final-state.html', errHTML)
    } catch (e) { /* ignore */ }
    process.exit(1)
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
