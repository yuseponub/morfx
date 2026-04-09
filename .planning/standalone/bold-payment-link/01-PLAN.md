---
phase: bold-payment-link
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - bold-robot/Dockerfile
  - bold-robot/package.json
  - bold-robot/.dockerignore
  - bold-robot/server.js
  - bold-robot/src/bold-client.js
  - bold-robot/src/screenshots.js
  - bold-robot/README.md
autonomous: false

must_haves:
  truths:
    - "Robot Playwright standalone en bold-robot/ que expone POST /api/create-link"
    - "Logueo funcional a panel.bold.co con username + password sin 2FA"
    - "Flow completo: login → misventas → link-de-pago → nuevo → agregar-monto → personalizar → compartir → extraer URL"
    - "Extracción de URL del link generado via interceptor de clipboard con fallback a DOM scraping"
    - "Manejo de popup NPS que puede bloquear el flow"
    - "Endpoint /api/health responde 200"
    - "Endpoint /api/screenshots sirve los debug screenshots cuando el flow falla"
    - "Dockerfile basado en mcr.microsoft.com/playwright:v1.58.2-noble"
  artifacts:
    - path: "bold-robot/server.js"
      provides: "Express server con /api/health, /api/create-link, /api/screenshots, /api/screenshots/:name"
      exports: []
    - path: "bold-robot/src/bold-client.js"
      provides: "createPaymentLink({username, password, amount, description}) — Playwright flow"
      exports: ["createPaymentLink"]
    - path: "bold-robot/Dockerfile"
      provides: "Imagen base Playwright v1.58.2 + node 20 + puerto 8080"
    - path: "bold-robot/README.md"
      provides: "Instrucciones de deploy a Railway (root directory, port, env vars)"
  key_links:
    - from: "bold-robot/server.js"
      to: "bold-robot/src/bold-client.js"
      via: "require('./src/bold-client')"
      pattern: "createPaymentLink"
---

<objective>
Construir y desplegar un robot Playwright standalone que automatiza el panel web de BOLD para generar links de pago. Este plan es INDEPENDIENTE del código Next.js — el robot debe funcionar y ser verificable con `curl` antes de pasar al Plan 02.

Output: Carpeta `bold-robot/` con servicio Express + Playwright desplegado en Railway, respondiendo a `POST /api/create-link` con `{ url }`.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/bold-payment-link/CONTEXT.md — Decisiones, flujo exacto del panel, estrategia de extracción de URL
@godentist/robot-godentist/ — Robot referencia: estructura Docker + Express + Playwright + screenshots debug
@.planning/debug/resolved/robot-coordinadora-deployment.md — 16 issues ya resueltos al desplegar el robot Coordinadora. LEER ANTES de desplegar para evitar repetir bugs.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold del proyecto (Dockerfile, package.json, estructura)</name>
  <files>
    bold-robot/Dockerfile
    bold-robot/package.json
    bold-robot/.dockerignore
    bold-robot/README.md
  </files>
  <action>
    **`bold-robot/package.json`:**
    ```json
    {
      "name": "bold-robot",
      "version": "1.0.0",
      "main": "server.js",
      "scripts": {
        "start": "node server.js"
      },
      "dependencies": {
        "express": "^4.19.2",
        "playwright": "1.58.2"
      },
      "engines": {
        "node": ">=20.0.0"
      }
    }
    ```

    **`bold-robot/Dockerfile`:**
    ```dockerfile
    FROM mcr.microsoft.com/playwright:v1.58.2-noble

    WORKDIR /app

    COPY package*.json ./
    RUN npm ci --omit=dev

    COPY . .

    # Create screenshots directory
    RUN mkdir -p /app/screenshots

    ENV PORT=8080
    EXPOSE 8080

    CMD ["node", "server.js"]
    ```

    ⚠️ **CRITICAL:** La versión de Playwright en `package.json` DEBE coincidir EXACTAMENTE con la tag de la imagen Docker (`v1.58.2`). Esta fue una de las 16 issues del robot Coordinadora — mismatch causa que el robot no arranque.

    **`.dockerignore`:**
    ```
    node_modules
    npm-debug.log
    .env
    .git
    screenshots/*
    !screenshots/.gitkeep
    README.md
    ```

    **`bold-robot/README.md`:** Instrucciones de deploy:
    ```markdown
    # Bold Robot

    Playwright-based scraper for BOLD panel (panel.bold.co) to generate payment links.

    ## Local dev
    ```bash
    cd bold-robot
    npm install
    npx playwright install chromium
    node server.js
    ```

    ## Railway deploy
    1. Create new Railway project linked to morfx repo
    2. Set **Root Directory** to `bold-robot`
    3. Set **Port** to `8080` in Networking settings (target port, NOT public)
    4. Deploy — the Dockerfile handles everything

    ## API

    ### POST /api/create-link
    ```json
    {
      "username": "string",
      "password": "string",
      "amount": 50000,
      "description": "1x ELIXIR DEL SUEÑO"
    }
    ```
    Returns: `{ "url": "https://checkout.bold.co/LNK_xxx" }` or `{ "error": "..." }`.

    ### GET /api/health
    Returns 200 if alive.

    ### GET /api/screenshots
    Lists recent debug screenshots (only populated when a flow fails).

    ### GET /api/screenshots/:name
    Serves a specific screenshot file.
    ```
  </action>
  <verify>
    - `bold-robot/package.json` con playwright 1.58.2 exacto
    - `bold-robot/Dockerfile` con base `mcr.microsoft.com/playwright:v1.58.2-noble` (mismo tag que el package)
    - `cd bold-robot && npm install` completa sin errores
  </verify>
</task>

<task type="auto">
  <name>Task 2: Playwright client — login + create link flow</name>
  <files>
    bold-robot/src/bold-client.js
    bold-robot/src/screenshots.js
  </files>
  <action>
    **`bold-robot/src/screenshots.js`:**
    ```js
    const fs = require('fs')
    const path = require('path')

    const SCREENSHOTS_DIR = '/app/screenshots'

    async function saveScreenshot(page, name) {
      if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `${timestamp}_${name}.png`
      const filepath = path.join(SCREENSHOTS_DIR, filename)
      await page.screenshot({ path: filepath, fullPage: true })
      return filename
    }

    function listScreenshots() {
      if (!fs.existsSync(SCREENSHOTS_DIR)) return []
      return fs.readdirSync(SCREENSHOTS_DIR)
        .filter(f => f.endsWith('.png'))
        .sort()
        .reverse()
        .slice(0, 50)
    }

    function getScreenshotPath(name) {
      return path.join(SCREENSHOTS_DIR, name)
    }

    module.exports = { saveScreenshot, listScreenshots, getScreenshotPath, SCREENSHOTS_DIR }
    ```

    **`bold-robot/src/bold-client.js`:**
    ```js
    const { chromium } = require('playwright')
    const { saveScreenshot } = require('./screenshots')

    const BOLD_LOGIN_URL = 'https://panel.bold.co'
    const BOLD_PAGOS_URL = 'https://panel.bold.co/misventas/pagos-en-linea'
    const TIMEOUT = 60000

    /**
     * Creates a BOLD payment link via panel scraping.
     * @param {{username, password, amount, description}} input
     * @returns {Promise<{url: string}>}
     */
    async function createPaymentLink({ username, password, amount, description }) {
      if (!username || !password) throw new Error('username y password requeridos')
      if (!amount || amount <= 0) throw new Error('amount debe ser > 0')
      if (!description || !description.trim()) throw new Error('description requerida')

      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })

      const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { width: 1280, height: 800 }
      })

      // Inject clipboard interceptor BEFORE navigating
      await context.addInitScript(() => {
        window.__clipboardValue = null
        if (navigator.clipboard && navigator.clipboard.writeText) {
          const original = navigator.clipboard.writeText.bind(navigator.clipboard)
          navigator.clipboard.writeText = (text) => {
            window.__clipboardValue = text
            return original(text)
          }
        }
      })

      const page = await context.newPage()
      page.setDefaultTimeout(TIMEOUT)

      try {
        // === STEP 1: LOGIN ===
        await page.goto(BOLD_LOGIN_URL, { waitUntil: 'networkidle' })
        await saveScreenshot(page, '01-login-page')

        // Selectors are best-guess. Adjust after first real run using screenshots.
        // Common patterns: input[type="email"], input[name="email"], input[name="username"]
        await page.waitForSelector('input[type="email"], input[name="email"], input[name="username"]', { timeout: 15000 })
        await page.fill('input[type="email"], input[name="email"], input[name="username"]', username)
        await page.fill('input[type="password"], input[name="password"]', password)
        await saveScreenshot(page, '02-login-filled')

        // Submit — try button[type=submit] first
        await Promise.all([
          page.waitForLoadState('networkidle'),
          page.click('button[type="submit"], button:has-text("Ingresar"), button:has-text("Iniciar")')
        ])
        await saveScreenshot(page, '03-post-login')

        // Handle NPS popup if it appears
        await dismissNpsPopup(page)

        // === STEP 2: NAVIGATE TO LINK CREATION ===
        await page.goto('https://panel.bold.co/misventas/pagos-en-linea/link-de-pago/nuevo/agregar-monto', { waitUntil: 'networkidle' })
        await dismissNpsPopup(page)
        await saveScreenshot(page, '04-agregar-monto')

        // === STEP 3: FILL AMOUNT ===
        // The amount field selector will need adjustment on first real run
        await page.waitForSelector('input[type="number"], input[name*="monto"], input[placeholder*="monto" i]', { timeout: 15000 })
        await page.fill('input[type="number"], input[name*="monto"], input[placeholder*="monto" i]', String(amount))
        await saveScreenshot(page, '05-monto-filled')

        await page.click('button:has-text("Continuar")')
        await page.waitForLoadState('networkidle')
        await dismissNpsPopup(page)
        await saveScreenshot(page, '06-personalizar')

        // === STEP 4: FILL DESCRIPTION ===
        await page.waitForSelector('input[name*="descripcion" i], textarea[name*="descripcion" i], input[placeholder*="descripcion" i], textarea[placeholder*="descripcion" i]', { timeout: 15000 })
        await page.fill('input[name*="descripcion" i], textarea[name*="descripcion" i], input[placeholder*="descripcion" i], textarea[placeholder*="descripcion" i]', description)
        await saveScreenshot(page, '07-description-filled')

        // === STEP 5: CREATE LINK ===
        await page.click('button:has-text("Crear link de pago"), button:has-text("Crear")')
        await page.waitForLoadState('networkidle')
        await dismissNpsPopup(page)
        await saveScreenshot(page, '08-compartir')

        // Wait for the "Copiar link" button to be present
        await page.waitForSelector('button:has-text("Copiar link"), button:has-text("Copiar")', { timeout: 15000 })

        // === STEP 6: EXTRACT URL (Strategy A: clipboard interceptor) ===
        await page.click('button:has-text("Copiar link"), button:has-text("Copiar")')
        await page.waitForTimeout(500)

        let url = await page.evaluate(() => window.__clipboardValue)

        // Strategy B fallback: read clipboard directly
        if (!url) {
          url = await page.evaluate(async () => {
            try { return await navigator.clipboard.readText() } catch { return null }
          })
        }

        // Strategy C fallback: scrape DOM looking for checkout.bold.co
        if (!url) {
          url = await page.evaluate(() => {
            const bodyText = document.body.innerText
            const match = bodyText.match(/https:\/\/checkout\.bold\.co\/[A-Za-z0-9_-]+/)
            return match ? match[0] : null
          })
        }

        // Strategy D fallback: look in all input/textarea values
        if (!url) {
          url = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input, textarea')
            for (const el of inputs) {
              if (el.value && el.value.includes('checkout.bold.co')) return el.value
            }
            return null
          })
        }

        await saveScreenshot(page, '09-url-extracted')

        if (!url || !url.includes('checkout.bold.co')) {
          throw new Error('No se pudo extraer la URL del link generado. Revisa /api/screenshots.')
        }

        return { url }
      } catch (err) {
        await saveScreenshot(page, 'error-' + err.message.slice(0, 30).replace(/[^a-z0-9]/gi, '_'))
        throw err
      } finally {
        await context.close()
        await browser.close()
      }
    }

    /**
     * Detects and closes the NPS survey popup if present.
     * Popup text: "De 0 a 10, ¿qué tan recomendarías..."
     */
    async function dismissNpsPopup(page) {
      try {
        // Common close patterns: X button, aria-label="close", .close-button
        const closeBtn = await page.$('button[aria-label*="cerrar" i], button[aria-label*="close" i], button:has-text("×"), .nps-close, [data-testid*="close"]')
        if (closeBtn) {
          await closeBtn.click({ timeout: 2000 }).catch(() => {})
          await page.waitForTimeout(300)
        }
      } catch {
        // Ignore — popup may not be present
      }
    }

    module.exports = { createPaymentLink }
    ```

    ⚠️ **Nota crítica sobre selectores:** Los selectores arriba son best-guess basados en patrones comunes. **Es MUY probable que algunos necesiten ajuste** después del primer deploy, usando los screenshots de debug para identificar los selectores reales del panel BOLD. Este es el flujo esperado: deploy → probar → revisar screenshots → ajustar selectores → commit → redeploy. Por eso el robot guarda screenshots en cada paso.
  </action>
  <verify>
    - Función `createPaymentLink` exportada
    - Usa clipboard interceptor como estrategia principal + 3 fallbacks
    - Guarda screenshots en cada paso (9 total en happy path)
    - Maneja popup NPS en cada paso relevante
    - Valida inputs antes de arrancar browser
  </verify>
</task>

<task type="auto">
  <name>Task 3: Express server con endpoints</name>
  <files>
    bold-robot/server.js
  </files>
  <action>
    **`bold-robot/server.js`:**
    ```js
    const express = require('express')
    const fs = require('fs')
    const { createPaymentLink } = require('./src/bold-client')
    const { listScreenshots, getScreenshotPath } = require('./src/screenshots')

    const app = express()
    app.use(express.json({ limit: '1mb' }))

    // === Health ===
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', service: 'bold-robot', timestamp: new Date().toISOString() })
    })

    // === Create payment link ===
    app.post('/api/create-link', async (req, res) => {
      const { username, password, amount, description } = req.body || {}

      if (!username || !password || !amount || !description) {
        return res.status(400).json({
          error: 'Campos requeridos: username, password, amount, description'
        })
      }

      console.log(`[${new Date().toISOString()}] Creating link: amount=${amount}, desc="${description.slice(0, 30)}..."`)

      try {
        const result = await createPaymentLink({ username, password, amount, description })
        console.log(`[${new Date().toISOString()}] Success: ${result.url}`)
        res.json(result)
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error:`, err.message)
        res.status(500).json({
          error: err.message,
          hint: 'Revisa /api/screenshots para ver el punto de falla'
        })
      }
    })

    // === Screenshots debug ===
    app.get('/api/screenshots', (req, res) => {
      const files = listScreenshots()
      const html = `
        <html><body style="font-family: sans-serif">
        <h1>Bold Robot Screenshots</h1>
        <p>${files.length} screenshots (most recent first)</p>
        <ul>
          ${files.map(f => `<li><a href="/api/screenshots/${f}">${f}</a></li>`).join('')}
        </ul>
        </body></html>
      `
      res.send(html)
    })

    app.get('/api/screenshots/:name', (req, res) => {
      const name = req.params.name
      if (!/^[a-zA-Z0-9_.-]+\.png$/.test(name)) {
        return res.status(400).send('Invalid filename')
      }
      const path = getScreenshotPath(name)
      if (!fs.existsSync(path)) {
        return res.status(404).send('Not found')
      }
      res.sendFile(path)
    })

    const PORT = process.env.PORT || 8080
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Bold Robot listening on port ${PORT}`)
    })
    ```
  </action>
  <verify>
    - Test local: `cd bold-robot && npm install && npx playwright install chromium && node server.js` → debe arrancar en puerto 8080
    - `curl http://localhost:8080/api/health` retorna `{status:"ok"}`
    - `curl -X POST http://localhost:8080/api/create-link -H "Content-Type: application/json" -d '{}'` retorna 400 con error de validación
  </verify>
</task>

<task type="manual">
  <name>Task 4: Deploy a Railway + ajuste iterativo de selectores</name>
  <action>
    Este task es **manual porque requiere acción del usuario en Railway** y ajuste iterativo de selectores basado en screenshots reales.

    **Paso 1: Usuario crea servicio Railway**
    1. Ir a https://railway.app → New Project → Deploy from GitHub repo
    2. Seleccionar repo `morfx` (el que ya tiene Railway configurado para `morfx-production` y `godentist-production`)
    3. **Settings → Source → Root Directory:** `bold-robot`
    4. **Settings → Networking → Target Port:** `8080`
    5. **Settings → Networking → Public Domain:** generar (Railway lo crea automáticamente, ej: `bold-robot-production.up.railway.app`)
    6. No env vars necesarias (credentials vienen en cada request)
    7. Deploy

    **Paso 2: Verificar deploy exitoso**
    - `curl https://bold-robot-production.up.railway.app/api/health` debe retornar `{status:"ok"}`
    - Si falla: revisar logs de Railway

    **Paso 3: Primera prueba real (esperado: FALLA en algún selector)**
    ```bash
    curl -X POST https://bold-robot-production.up.railway.app/api/create-link \
      -H "Content-Type: application/json" \
      -d '{
        "username": "EMAIL_BOLD_REAL",
        "password": "PASSWORD_BOLD_REAL",
        "amount": 10000,
        "description": "TEST morfx"
      }'
    ```

    **Paso 4: Ajustar selectores usando screenshots**
    - Abrir `https://bold-robot-production.up.railway.app/api/screenshots`
    - Identificar en qué paso falló (nombre del archivo de screenshot)
    - Inspeccionar el screenshot para ver qué selector corresponde al elemento real
    - Editar `bold-robot/src/bold-client.js` con los selectores correctos
    - Commit + push → Railway redeploy automático
    - Repetir hasta que el curl retorne `{ url: "https://checkout.bold.co/LNK_xxx" }` real

    **Paso 5: Verificación final**
    - Abrir la URL devuelta en un navegador
    - Debe cargar el checkout real de BOLD con monto $10.000 y descripción "TEST morfx"

    **Criterio de éxito del plan:** curl devuelve URL válida que abre el checkout real de BOLD.
  </action>
  <verify>
    - `curl /api/health` retorna 200
    - `curl POST /api/create-link` con credenciales reales retorna `{url}` válida
    - URL abre checkout real con monto y descripción correctos
    - Guardar la URL de Railway (ej: `bold-robot-production.up.railway.app`) para usar en Plan 02
  </verify>
</task>

</tasks>

<verification_loop>
  1. `curl https://<railway-url>/api/health` → 200 OK
  2. `curl -X POST https://<railway-url>/api/create-link -d '{...}'` → retorna URL válida en ~15-30s
  3. Abrir URL en navegador → carga checkout real de BOLD con monto correcto
  4. Probar con credenciales inválidas → error legible, no timeout
  5. Si fallo en cualquier paso: revisar `/api/screenshots` para debug visual
</verification_loop>

<commits>
  - feat(bold-robot): scaffold Playwright service with Dockerfile and Express
  - feat(bold-robot): Playwright flow for BOLD panel login and link creation
  - fix(bold-robot): ajustar selectores post-deploy real (commits iterativos)
</commits>
