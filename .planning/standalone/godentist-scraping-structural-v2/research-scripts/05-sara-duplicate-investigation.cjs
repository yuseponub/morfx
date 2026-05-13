#!/usr/bin/env node
/**
 * Research script 05 — investigate SARA SILVANA PARADA BELTRAN duplicate in CABECERA.
 *
 * Question: Is the duplicate from the PORTAL itself (Dentos shows her twice) or from the SCRAPER (race condition / page boundary)?
 *
 * Method: For CABECERA, walk all 4 pages and capture which page(s) each row appears in.
 *  - If SARA appears on page X and page Y (different pages) → scraper bug (page boundary or race)
 *  - If SARA appears 2× on the SAME page → portal bug (DB duplicate)
 */

const path = require('path')
const fs = require('fs')
const { chromium } = require('/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/robot-godentist/node_modules/playwright')

const BASE_URL = 'https://godentist.dentos.co'
const APPOINTMENTS_URL = `${BASE_URL}/citas/index/listcitassimple`
const USERNAME = 'JROMERO'
const PASSWORD = '123456'

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  try {
    // Login
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

    // Hour
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

    // CABECERA is default — no select needed
    // Click Buscar
    const btn = await page.$('button:has-text("Buscar")')
    if (btn) await btn.click()
    await page.waitForTimeout(3500)

    const targetPhone = '573204471168'
    const targetName = 'SARA SILVANA PARADA BELTRAN'

    // Walk all 4 pages, collecting all rows with their page number
    const allRows = []
    let pageNum = 1
    const totalPages = 4

    while (pageNum <= totalPages) {
      const pageInput = await page.evaluate(() => document.querySelector('input.x-tbar-page-number')?.value)
      console.log(`\n=== Page ${pageNum} (pageInput=${pageInput}) ===`)

      const rows = await page.evaluate(() => {
        const rowTables = document.querySelectorAll('table.x-grid3-row-table')
        return Array.from(rowTables).map((rt, idx) => {
          const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
          return {
            idx,
            hora: cells[1] || '',
            paciente: cells[2] || '',
            estado: cells[3] || '',
            phone: cells[5] || '',
            allCells: cells.slice(0, 13),
          }
        })
      })
      console.log(`  ${rows.length} rows on page ${pageNum}`)

      const sara = rows.filter(r => r.phone === '3204471168' || r.paciente.includes('SARA'))
      if (sara.length > 0) {
        console.log(`  *** SARA APPEARS ${sara.length} TIME(S) ON THIS PAGE:`)
        sara.forEach(s => {
          console.log(`      idx=${s.idx} hora="${s.hora}" paciente="${s.paciente}" estado="${s.estado}" phone="${s.phone}"`)
        })
      }

      rows.forEach(r => allRows.push({ ...r, pageNum }))

      if (pageNum < totalPages) {
        await page.evaluate(() => {
          const btn = document.querySelector('button.x-tbar-page-next')
          if (btn) btn.click()
        })
        await page.waitForTimeout(2500)
      }
      pageNum++
    }

    // Aggregate findings
    const saraOccurrences = allRows.filter(r => r.paciente.includes('SARA SILVANA') || r.phone === '3204471168')
    console.log(`\n=== SUMMARY ===`)
    console.log(`Total SARA occurrences: ${saraOccurrences.length}`)
    saraOccurrences.forEach((s, i) => {
      console.log(`  [${i}] page=${s.pageNum} idx_on_page=${s.idx} hora="${s.hora}" estado="${s.estado}"`)
    })

    if (saraOccurrences.length > 1) {
      const samePage = saraOccurrences.every(s => s.pageNum === saraOccurrences[0].pageNum)
      console.log(`\nAll occurrences on SAME page? ${samePage}`)
      if (samePage) {
        console.log('→ CONCLUSION: This is a PORTAL bug — Dentos shows SARA multiple times in the same page')
        console.log('→ FIX: Dedupe in server-action (D-12) handles this silently')
      } else {
        console.log('→ CONCLUSION: This is a SCRAPER bug — same row leaks across pages (page boundary or race)')
        console.log('→ FIX: Needs deeper investigation in paradigm D pagination logic')
      }
    } else {
      console.log('\nOnly 1 occurrence — bug may not reproduce in this run')
    }

    // Also check for any other duplicate phones across pages
    console.log('\n=== Other phones appearing on >1 page ===')
    const phonePages = {}
    for (const r of allRows) {
      if (!r.phone) continue
      if (!phonePages[r.phone]) phonePages[r.phone] = new Set()
      phonePages[r.phone].add(r.pageNum)
    }
    const crossPagePhones = Object.entries(phonePages).filter(([_, s]) => s.size > 1)
    if (crossPagePhones.length === 0) {
      console.log('  None — each phone appears on only 1 page (good)')
    } else {
      crossPagePhones.forEach(([p, s]) => console.log(`  ${p}: pages [${[...s].join(',')}]`))
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
