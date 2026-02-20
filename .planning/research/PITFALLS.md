# Pitfalls: Logistics Robot Integration

**Domain:** Playwright browser automation in production CRM
**Researched:** 2026-02-20
**Confidence:** HIGH

## Critical Pitfalls

### 1. Playwright on Vercel (BLOCKER)
**Problem:** Chromium ~280-400 MB exceeds Vercel's 250 MB limit. Ephemeral filesystem loses cookies.
**Prevention:** Separate microservice on Railway. NEVER attempt Playwright in Vercel.
**Phase:** Phase 1 (Architecture)

### 2. Partial Batch Failures Without Recovery
**Problem:** Order #15 of 25 fails. Robot stops. First 14 have guides, remaining 11 untouched. Rerunning processes ALL 25 (duplicates).
**Prevention:** Per-order status tracking in `robot_job_items` table. Track each order independently. Resume from last failure. Idempotency check before creating on portal.
**Phase:** Phase 2 (Robot Core)

### 3. Browser Memory Leaks
**Problem:** Playwright opens Chromium. If not properly closed (crash, timeout, unhandled error), leaks 500MB+ per instance.
**Prevention:** `try/finally` with `browser.close()`. One browser per batch, new page per order. Monitor RSS memory. Auto-restart if >2GB.
**Phase:** Phase 2 (Robot Core)

### 4. Portal UI Changes Breaking Selectors
**Problem:** Coordinadora updates their portal HTML. All CSS selectors break. Robot silently fails or fills wrong fields.
**Prevention:** Externalize selectors in config file. Use ARIA selectors (role, label) over CSS. Health check endpoint that validates selectors. Screenshot on every failure.
**Phase:** Phase 2 (Robot Core) — ongoing maintenance

### 5. Carrier Credential Security
**Problem:** Portal passwords stored in plaintext. Leaked credentials = unauthorized shipments on client's account.
**Prevention:** Encrypt at rest in Supabase (pgcrypto). Pass per-request, never store in robot. Robot process memory only, never logs. Rotate credentials notification.
**Phase:** Phase 1 (Architecture)

## High Severity Pitfalls

### 6. MUI Autocomplete Not Filling Correctly
**Problem:** Robot types city but dropdown doesn't appear, or wrong city selected. MUI Autocomplete needs specific interaction sequence.
**Prevention:**
```typescript
await page.click(SELECTORS.cityAutocomplete)
await page.fill(SELECTORS.cityAutocomplete, '')
await page.type(SELECTORS.cityAutocomplete, cityName, { delay: 50 })
await page.waitForSelector('[role="listbox"]', { timeout: 5000 })
const option = page.locator('[role="option"]').filter({ hasText: expected })
await option.click()
// VERIFY after selection
const value = await page.inputValue(SELECTORS.cityAutocomplete)
```
NEVER use `waitForTimeout()` for MUI interactions.
**Phase:** Phase 2 (Robot Core)

### 7. Session/Cookie Expiration Loops
**Problem:** Saved cookies expired. Robot enters login loop. Portal rate-limits login attempts.
**Prevention:** Validate session before batch (navigate to authenticated page, check redirect). Login once, verify always. Store cookie timestamp, proactively re-login. Retry with backoff (1s, 5s, 15s).
**Phase:** Phase 2 (Robot Core)

### 8. Real-Time Progress Not Working
**Problem:** UI shows progress bar that freezes, jumps 0%→100%, or doesn't update.
**Prevention:** Use Supabase Realtime on `robot_job_items` table (proven pattern from WhatsApp inbox). NOT SSE (Vercel proxy drops), NOT polling. Robot writes per-order updates to DB → Realtime → UI.
**Phase:** Phase 3 (UI Integration)

### 9. Robot Service Communication Failures
**Problem:** MorfX sends batch to robot. Robot is down/sleeping. Request lost. No retry.
**Prevention:** Inngest as communication layer. Event `robot/job.dispatch` → Inngest guarantees delivery with retries. Health check before showing "Process" button. Idempotency keys per batch.
**Phase:** Phase 1 (Architecture)

### 10. SweetAlert2 Modal Detection Timing
**Problem:** Robot submits form. Portal shows SweetAlert2 modal. Robot misses it or detects wrong modal.
**Prevention:**
```typescript
const result = await Promise.race([
  page.waitForSelector('.swal2-popup.swal2-icon-success', { timeout: 15000 })
    .then(() => 'success'),
  page.waitForSelector('.swal2-popup.swal2-icon-error', { timeout: 15000 })
    .then(() => 'error'),
])
// Extract text, take screenshot, dismiss modal, then proceed
```
**Phase:** Phase 2 (Robot Core)

### 11. Data Mapping Mismatches
**Problem:** MorfX stores "BOGOTA D.C." but portal expects "BOGOTA". Phone with +57, portal wants 10 digits.
**Prevention:** Normalization layer between MorfX orders and portal input. City mapping table. Validate BEFORE sending to robot. Log every transformation.
**Phase:** Phase 2 (Robot Core)

## Medium Severity Pitfalls

### 12. Concurrent Batches from Same Workspace
**Prevention:** Workspace-level lock: only one active batch. UI checks lock before showing button. Lock expires after 30min timeout.
**Phase:** Phase 3 (UI)

### 13. Playwright Version Drift
**Prevention:** Pin exact version in package.json. Pin in Dockerfile. Test before updating.
**Phase:** Phase 1 (Setup)

### 14. No Screenshot Evidence Trail
**Prevention:** Screenshot per order: before submit, on success modal, on error. Store in Supabase Storage: `robot/{workspace_id}/{batch_id}/{order_id}_{step}.png`. Auto-cleanup after 30 days.
**Phase:** Phase 2 (Robot Core)

### 15. Hardcoded Portal Delays
**Prevention:** Replace ALL `waitForTimeout` with `waitForSelector`/`waitForLoadState`. Only use timeout for anti-detection delays between orders.
**Phase:** Phase 2 (Robot Core)

### 16. Domain Layer Bypass
**Problem:** Robot updates DB directly, skipping domain layer. Automation triggers don't fire.
**Prevention:** Robot MUST update through MorfX API → domain layer. POST /api/robots/callback internally calls updateOrder(). Source: 'robot-service' for audit trail.
**Phase:** Phase 1 (Architecture)

## Phase-Specific Summary

| Phase | Critical Pitfalls | Actions |
|-------|------------------|---------|
| Phase 1: Architecture | #1 (Vercel), #5 (credentials), #9 (communication), #16 (domain bypass) | Separate service, Inngest, API contract |
| Phase 2: Robot Core | #2 (partial failures), #3 (memory), #4 (selectors), #6 (MUI), #7 (cookies), #10 (modals), #11 (data mapping) | Per-order tracking, resilient selectors, normalization |
| Phase 3: UI | #8 (progress), #12 (concurrency) | Supabase Realtime, workspace locks |
| Ongoing | #4 (portal changes), #13 (version drift) | Selector health checks, pinned versions |

## MorfX-Specific Integration Warnings

- Robot Inngest events use separate namespace: `robot/job.*` (NOT `automation/robot.*`)
- Robot results flow through `updateOrder()` domain function → emits `field.changed` triggers
- `DomainContext` for robot updates: `source: 'robot-service'`
- Every query filters by `workspace_id` (same as all domain functions)
- Inngest concurrency key: `event.data.workspaceId`

---
*Research completed: 2026-02-20*
