const express = require('express')
const fs = require('fs')
const { createPaymentLink } = require('./src/bold-client')
const { listScreenshots, getScreenshotPath } = require('./src/screenshots')
const codeWaiter = require('./src/code-waiter')

const app = express()
app.use(express.json({ limit: '1mb' }))

// ============================================================================
// Health
// ============================================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'bold-robot',
    timestamp: new Date().toISOString(),
  })
})

// ============================================================================
// Create payment link
// ============================================================================
app.post('/api/create-link', async (req, res) => {
  const { username, password, amount, description, imageUrl } = req.body || {}

  // Validation
  const missing = []
  if (!username) missing.push('username')
  if (!password) missing.push('password')
  if (amount === undefined || amount === null) missing.push('amount')
  if (!description) missing.push('description')
  if (missing.length > 0) {
    return res.status(400).json({ error: `Campos requeridos: ${missing.join(', ')}` })
  }

  const amountNum = Number(amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'amount debe ser un número > 0' })
  }

  const startedAt = Date.now()
  console.log(
    `[${new Date().toISOString()}] create-link: amount=${amountNum}, desc="${String(description).slice(0, 40)}"`
  )

  try {
    const result = await createPaymentLink({
      username,
      password,
      amount: amountNum,
      description: String(description),
      imageUrl: imageUrl || undefined,
    })
    const ms = Date.now() - startedAt
    console.log(`[${new Date().toISOString()}] SUCCESS in ${ms}ms: ${result.url}`)
    return res.json({ url: result.url, elapsed_ms: ms })
  } catch (err) {
    const ms = Date.now() - startedAt
    console.error(`[${new Date().toISOString()}] ERROR in ${ms}ms: ${err.message}`)
    return res.status(500).json({
      error: err.message,
      hint: 'Revisa /api/screenshots para ver el punto de falla',
      elapsed_ms: ms,
    })
  }
})

// ============================================================================
// Verification code submission (BOLD 2FA)
// ============================================================================
// When Bold challenges a login from a new IP with a 6-digit code, the
// create-link flow blocks. The user reads the code from SMS/email and
// submits it here; the pending flow picks it up and continues.

app.post('/api/submit-code', (req, res) => {
  const { code } = req.body || {}
  if (!code) {
    return res.status(400).json({ error: 'code requerido' })
  }
  if (!/^\d{4,8}$/.test(String(code).trim())) {
    return res.status(400).json({ error: 'code debe tener 4-8 dígitos' })
  }
  if (!codeWaiter.status().pending) {
    return res.status(404).json({ error: 'No hay login pendiente esperando código' })
  }
  try {
    codeWaiter.submitCode(code)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/login-status', (req, res) => {
  res.json(codeWaiter.status())
})

// Delete saved session state (forces next request to do a full login)
app.post('/api/clear-session', (req, res) => {
  const statePath = '/app/state/bold-session.json'
  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath)
      res.json({ success: true, cleared: true })
    } else {
      res.json({ success: true, cleared: false })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ============================================================================
// Screenshots debug
// ============================================================================
app.get('/api/screenshots', (req, res) => {
  const files = listScreenshots()
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Bold Robot — Debug Screenshots</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
  h1 { margin-bottom: 0.25rem; }
  .count { color: #666; margin-bottom: 2rem; }
  ul { list-style: none; padding: 0; }
  li { margin: 0.25rem 0; padding: 0.5rem; border-bottom: 1px solid #eee; font-family: ui-monospace, monospace; font-size: 0.9rem; }
  a { color: #0066cc; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .error { color: #c00; font-weight: bold; }
</style>
</head>
<body>
  <h1>Bold Robot — Debug Screenshots</h1>
  <p class="count">${files.length} screenshots (most recent first, max 50)</p>
  ${
    files.length === 0
      ? '<p>No screenshots yet. Try POST /api/create-link first.</p>'
      : '<ul>' +
        files
          .map((f) => {
            const isError = f.includes('error-')
            return `<li${isError ? ' class="error"' : ''}><a href="/api/screenshots/${encodeURIComponent(
              f
            )}" target="_blank">${f}</a></li>`
          })
          .join('') +
        '</ul>'
  }
</body>
</html>`
  res.set('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

app.get('/api/screenshots/:name', (req, res) => {
  const name = req.params.name
  // Basic path traversal protection
  if (!/^[a-zA-Z0-9_.-]+\.png$/.test(name)) {
    return res.status(400).send('Invalid filename')
  }
  const filepath = getScreenshotPath(name)
  if (!fs.existsSync(filepath)) {
    return res.status(404).send('Not found')
  }
  res.sendFile(filepath)
})

// ============================================================================
// 404
// ============================================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ============================================================================
// Start
// ============================================================================
const PORT = process.env.PORT || 8080
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bold Robot listening on port ${PORT}`)
})
