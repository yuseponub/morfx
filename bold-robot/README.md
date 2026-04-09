# Bold Robot

Playwright-based scraper for the BOLD merchant panel (`panel.bold.co`) that generates payment links on demand.

This service exists because BOLD's official Payment Links API requires manual commercial approval that was not granted in a reasonable timeframe. Morfx users already have active BOLD accounts and need to generate payment links from inside WhatsApp conversations, so we automate the web panel instead.

> ⚠️ **ToS caveat:** Web-scraping third-party panels may violate their Terms of Service. This robot is intended for **low-volume, user-triggered** use only (one link per manual click from a merchant's own account — not a batch job, not a crawler). If BOLD ever approves API access, migrate to the official API and deprecate this robot.

## Local development

```bash
cd bold-robot
npm install
npx playwright install chromium
node server.js
```

Server listens on port `8080`.

Test health:
```bash
curl http://localhost:8080/api/health
```

Test create link (needs real BOLD credentials):
```bash
curl -X POST http://localhost:8080/api/create-link \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your-email@example.com",
    "password": "your-password",
    "amount": 10000,
    "description": "TEST 1x producto"
  }'
```

## Deploy to Railway

1. Go to https://railway.app → **New Project → Deploy from GitHub repo**
2. Select the **morfx** repo (the one that already hosts `morfx-production` and `godentist-production`)
3. **Settings → Source → Root Directory:** `bold-robot`
4. **Settings → Networking → Target Port:** `8080`
5. **Settings → Networking → Public Domain:** generate (Railway assigns one automatically, e.g. `bold-robot-production.up.railway.app`)
6. No env vars needed — credentials are passed per-request in the body
7. Railway auto-deploys from `main` on each push

## API

### `GET /api/health`
Returns `200 { status: "ok", service: "bold-robot", timestamp }` if alive.

### `POST /api/create-link`
Body:
```json
{
  "username": "string (BOLD panel email)",
  "password": "string (BOLD panel password)",
  "amount": 50000,
  "description": "1x ELIXIR DEL SUEÑO"
}
```

Success (`200`):
```json
{ "url": "https://checkout.bold.co/LNK_xxx" }
```

Error (`400` validation / `500` flow failure):
```json
{ "error": "descriptive message", "hint": "check /api/screenshots" }
```

Expected latency: **15–30 seconds** (full Playwright flow: login + 3 wizard steps + extraction).

### `GET /api/screenshots`
HTML index of the 50 most recent debug screenshots. Populated on every run — each step of the flow dumps a screenshot. Invaluable for debugging broken selectors when BOLD changes their UI.

### `GET /api/screenshots/:name`
Serves a specific screenshot image.

## Troubleshooting

**Robot returns "No se pudo extraer la URL del link generado":**
- Open `/api/screenshots`, find the latest run's screenshots (newest first)
- Look at `09-url-extracted.png` — is the "Comparte tu link" page actually reached?
- If yes but extraction failed: the "Copiar link" button DOM/clipboard behavior changed → update `bold-client.js` extraction strategies
- If no (flow got stuck earlier): find the earliest screenshot that looks wrong and fix that step's selector

**Login fails:**
- Check screenshots `01-login-page.png` and `02-login-filled.png`
- Common breakers: captcha, rate-limiting after too many failed attempts, field selector changes
- BOLD does NOT require 2FA on normal merchant accounts (confirmed by users) — if you see a 2FA prompt, it was added by the merchant and must be disabled

**Playwright version mismatch:**
- `package.json` playwright version MUST match the Dockerfile base image tag EXACTLY (`v1.58.2` ↔ `1.58.2`)
- Mismatch causes the container to fail on startup

## Architecture notes

- Plain JavaScript (not TypeScript) — kept small on purpose, no build step
- Single browser per request: launch → flow → close. No session reuse (simple, stateless, safer)
- Sequential only: no concurrency handling. BOLD panel login probably can't handle parallel sessions for the same account anyway
- All logging goes to stdout (Railway captures it)
