const fs = require('fs')
const path = require('path')

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || '/app/screenshots'

function ensureDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  }
}

async function saveScreenshot(page, name) {
  ensureDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filename = `${timestamp}_${safeName}.png`
  const filepath = path.join(SCREENSHOTS_DIR, filename)
  try {
    await page.screenshot({ path: filepath, fullPage: true })
  } catch (err) {
    console.error(`Failed to save screenshot ${filename}: ${err.message}`)
  }
  return filename
}

function listScreenshots() {
  ensureDir()
  return fs
    .readdirSync(SCREENSHOTS_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .reverse()
    .slice(0, 50)
}

function getScreenshotPath(name) {
  return path.join(SCREENSHOTS_DIR, name)
}

module.exports = { saveScreenshot, listScreenshots, getScreenshotPath, SCREENSHOTS_DIR }
