# Robot Coordinadora — Deployment & Adapter Debug Log

**Date:** 2026-02-24
**Status:** RESOLVED (all issues fixed, robot operational)

## Issues Found & Resolved

### Issue 1: Dockerfile — TypeScript not installed during build
- **Symptom:** `tsc: not found` during Railway build
- **Cause:** `npm ci --omit=dev` skips devDependencies where typescript lives
- **Fix:** Install all deps, build, then `npm prune --omit=dev`
- **Commit:** `e72323d`

### Issue 2: Dockerfile — Playwright version mismatch
- **Symptom:** `browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1208/...`
- **Cause:** Docker image `v1.52.0` but playwright package auto-updated to `v1.58.2`
- **Fix:** Updated Dockerfile to `mcr.microsoft.com/playwright:v1.58.2-noble`
- **Commit:** `9ed0d03`

### Issue 3: Railway port mismatch (502 connection refused)
- **Symptom:** `upstreamErrors: connection refused` on all requests
- **Cause:** Railway assigns port 8080 by default, but networking was configured for 3001
- **Fix:** Changed Railway Networking target port to 8080
- **Resolution:** Immediate (no code change)

### Issue 4: Callback URL undefined
- **Symptom:** `Failed to parse URL from undefined/api/webhooks/robot-callback`
- **Cause:** `NEXT_PUBLIC_APP_URL` env var missing in Vercel
- **Fix:** Added `NEXT_PUBLIC_APP_URL=https://morfx-sandy.vercel.app` to Vercel + redeploy
- **Resolution:** Immediate (env var)

### Issue 5: Missing Vercel env vars for robot integration
- **Symptom:** Robot service not reachable / callback auth fails
- **Cause:** `ROBOT_COORDINADORA_URL` and `ROBOT_CALLBACK_SECRET` not in Vercel
- **Fix:** Added both vars to Vercel + redeploy
- **Resolution:** Immediate (env vars)

### Issue 6: Credenciales incompletas
- **Symptom:** "Credenciales incompletas" when running "subir ordenes coord"
- **Cause:** `portal_username` and `portal_password` columns empty in `carrier_configs` table. UI in `/settings/logistica` does NOT have credential input fields.
- **Fix (temp):** Inserted credentials directly in Supabase SQL editor
- **TODO:** Add credential fields to logistics config UI (needs GSD plan)

### Issue 7: Login failed — wrong selectors + timing
- **Symptom:** `page.click: Timeout 30000ms exceeded. waiting for locator('button[type="submit"]')`
- **Cause:** Adapter used `button[type="submit"]` but portal uses `button:has-text("Ingresar")`
- **Fix:** Port exact selectors from working robot, use `networkidle` for goto, wait for fields to be visible before filling, proper delays (2s render, 500ms between fills, 5s after click)
- **Commit:** `283819d`, `fcc1958`

### Issue 8: identificacion_destinatario rejects text
- **Symptom:** `page.fill: Error: Cannot type text into input[type=number]` — value was "N/A"
- **Cause:** MorfX sent `order.custom_fields?.identificacion || 'N/A'` but field is `type="number"`
- **Fix:** Use phone number (10 digits without country code) as fallback in both MorfX and adapter
- **Commit:** `02524d9`

### Issue 9: Wrong field names in adapter
- **Symptom:** Fields silently not matching portal inputs
- **Cause:** Adapter was written with guessed selectors, not ported from working robot
- **Fix:** `nombre_destinatario` → `nombres_destinatario`, `apellido_destinatario` → `apellidos_destinatario`, `celular_destinatario` → `telefono_celular_destinatario`
- **Commit:** `283819d`

### Issue 10: Missing form fields
- **Symptom:** Portal form incomplete — missing required fields
- **Cause:** `numero_pedido`, `total_iva`, `total_coniva` not implemented
- **Fix:** Added `getLastPedidoNumber()` (reads MuiDataGrid from /panel/pedidos), fills `numero_pedido`, `total_iva` (always 0), `total_coniva`
- **Commit:** `283819d`

### Issue 11: COD handling completely wrong
- **Symptom:** Checkbox/toggle approach for recaudo, no matching elements found
- **Cause:** Portal uses radio buttons, not checkboxes
- **Fix:** Use `input[name="pago_contra_entrega"][value="S/N"]` + `input[name="flete_contra_entrega"][value="N"]`
- **Commit:** `283819d`

### Issue 12: Disabled flete radio button blocks for 30s
- **Symptom:** `page.click: Timeout 30000ms exceeded — element is not enabled`
- **Cause:** `flete_contra_entrega=N` is auto-checked AND disabled by the portal
- **Fix:** Check if already checked/disabled before clicking, skip if so
- **Commit:** `14b4050`

### Issue 13: Decimal totalConIva blocks form submit
- **Symptom:** No SweetAlert2 after clicking submit — form silently blocked
- **Cause:** `total_coniva` field is `type="number"` with integer step. Value `109994.8` rejected by browser native validation: "The two nearest valid values are 109994 and 109995"
- **Fix:** `Math.floor(totalConIva / 100) * 100` — round down to nearest 100
- **Commit:** `9fd3d20`, `4fceeca`
- **Key learning:** Screenshots were essential — added `/api/screenshots` endpoint to serve debug images from Railway

### Issue 14: Wrong referencia value
- **Symptom:** Order shows as "agotado" in Coordinadora
- **Cause:** `referencia` was set to `order.name` (customer name "Jose Romero") instead of fixed code "AA1"
- **Fix:** Hardcoded `referencia: 'AA1'`
- **Commit:** `558ab51`

## Default Values (matching working robot)

| Field | Value |
|-------|-------|
| referencia | "AA1" |
| valorDeclarado | 55000 |
| peso | 0.08 kg |
| alto | 5 cm |
| largo | 5 cm |
| ancho | 10 cm |
| total_iva | 0 |
| flete_contra_entrega | always "N" |
| esRecaudoContraentrega | true if total_value > 0 |
| totalConIva | floor to nearest 100 |

## Environment Setup Required

### Railway (robot-coordinadora)
- `ROBOT_CALLBACK_SECRET` — shared secret for callback auth

### Vercel (morfx)
- `NEXT_PUBLIC_APP_URL` — base URL for callback construction
- `ROBOT_COORDINADORA_URL` — Railway service URL (https://morfx-production.up.railway.app)
- `ROBOT_CALLBACK_SECRET` — same shared secret

### Supabase (temporary)
- `carrier_configs.portal_username` — Coordinadora portal username
- `carrier_configs.portal_password` — Coordinadora portal password
- TODO: Add UI fields in `/settings/logistica` for these

## Railway Configuration
- **Root Directory:** `robot-coordinadora`
- **Builder:** Dockerfile
- **Dockerfile Path:** `/robot-coordinadora/Dockerfile`
- **Target Port:** 8080 (Railway's default, NOT 3001)
- **Health Check:** `GET /api/health`
- **Domain:** `morfx-production.up.railway.app`
- **Debug Screenshots:** `GET /api/screenshots` and `GET /api/screenshots/:name`

## Post-Deployment Fixes (2026-02-25)

### Issue 15: buscar guias coord — same stage as subir ordenes
- **Symptom:** Both commands read from `dispatch_stage_id`, but operationally they need separate stages
- **Fix:** Added `guide_lookup_pipeline_id` and `guide_lookup_stage_id` columns to `carrier_configs`, new `getGuideLookupStage()` domain function, UI card in settings/logistica
- **Commit:** `56968cb`

### Issue 16: guide_lookup wrote to carrier_guide_number instead of tracking_number
- **Symptom:** Guide number saved in wrong field — user expects it in tracking_number
- **Fix:** guide_lookup now writes guide to BOTH `tracking_number` (user-facing) and `carrier_guide_number` (used as "already looked up" flag by getOrdersPendingGuide filter)
- **Commit:** `dc351b7`
