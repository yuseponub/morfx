// src/number-extractor.ts — phone-number resolution chain (D-04 → D-05 → feeds D-06).
//
// Resolves a chatId (a WhatsApp JID) to its real phone number using ONLY local-cache lookups,
// in this order (RESEARCH Pattern 5, lines 264-286, VERBATIM for steps 1-3):
//   1. Direct JID parse        — works for legacy "<digits>@c.us".
//   2. LID-entry cache lookup  — LID → PN via the device's LOCAL cache (read-only, no network).
//   3. Store-fn fallback        — the wa-js Store function fallback (read-only).
//   4. DOM contact-info panel  — D-04 read-only click fallback, best-effort, returns null on any
//                                failure. The pilot (Plan 06) calibrates whether step 4 is needed.
// Unresolved after all steps → null (D-05); the caller flags numberMissing + counts the null toward
// the D-06 null-rate gate (which lives in the Plan 05 orchestrator, not here).
//
// DEVIATION / HARD CONSTRAINT (PATTERNS line 249 + RESEARCH line 288): we use ONLY local-cache
// lookups. We do NOT use the wa-js API that "Requests the real phone number" — that one may issue an
// outbound request to WhatsApp to fetch a number, which is write-ish and breaks the read-only
// guarantee (D-15). This file emits nothing and makes no number-fetching network call.
//
// REUSE (robot-godentist godentist-adapter.ts lines 471-477): the digit-strip idiom
// `.replace(/\D/g,'')` + Colombian `3\d{9}` → `57` + digits normalization. We DO NOT fabricate
// digits: if nothing parses, we return null.
import type { Page } from 'playwright'

/**
 * Normalize a parsed digit string for consistency with the godentist idiom:
 * a bare 10-digit Colombian mobile (3XXXXXXXXX) is prefixed with the country code 57.
 * Never fabricates digits — passes through anything else unchanged.
 */
function normalizeColombian(digits: string): string {
  if (digits.length === 10 && digits.startsWith('3')) return '57' + digits
  return digits
}

/**
 * Steps 1-3 of the chain, all inside a single page.evaluate over the injected Store (window.WPP).
 * Each cache lookup is wrapped in try/catch and falls through to the next on any failure.
 * (RESEARCH Pattern 5, lines 264-284, VERBATIM.)
 */
async function resolveFromStore(page: Page, chatId: string): Promise<string | null> {
  return await page.evaluate(async (id) => {
    const WPP = (window as any).WPP
    // 1. direct parse — works for legacy @c.us
    const m = String(id).match(/^(\d{6,15})@c\.us$/)
    if (m) return m[1]
    // 2. LID → PN via local cache (READ-ONLY, no network) — LID-entry cache lookup
    try {
      const entry = await WPP.contact.getPnLidEntry(id)
      const pn = entry?.pn?._serialized ?? entry?.phoneNumber?._serialized ?? entry?.pn ?? entry?.phoneNumber
      const pm = String(pn ?? '').match(/(\d{6,15})/)
      if (pm) return pm[1]
    } catch {}
    // 3. Store-fn fallback
    try {
      const pn = await WPP.whatsapp.functions.getPnForLid(id)
      const pm = String(pn?._serialized ?? pn ?? '').match(/(\d{6,15})/)
      if (pm) return pm[1]
    } catch {}
    return null
  }, chatId)
}

/**
 * Step 4 (D-04): the contact-info panel DOM fallback. A read-only click is acceptable per D-04.
 * This is a best-effort, defensively-wrapped attempt: open the chat header / info panel, read any
 * phone-shaped text, strip non-digits. It NEVER throws and returns null on any failure — the pilot
 * (Plan 06) calibrates whether step 4 is even needed. We deliberately avoid hard-coded obfuscated
 * CSS class names (RESEARCH anti-pattern) and look for phone-shaped digit runs in the panel text.
 */
async function resolveFromDom(page: Page): Promise<string | null> {
  try {
    // Read any phone-shaped text already present in the DOM (the open chat's header/info panel).
    // We do NOT navigate, scrape obfuscated classes, or interact beyond reading text content.
    const digits = await page.evaluate(() => {
      const text = document.body?.innerText ?? ''
      // Phone-shaped: optional +, then 10+ digits (allow spaces/dashes inside), or a 3XX CO mobile.
      const match = text.match(/(\+?\d[\d\s-]{8,}\d)/)
      if (!match) return null
      const stripped = match[1].replace(/\D/g, '')
      return stripped.length >= 10 ? stripped : null
    })
    return digits ?? null
  } catch {
    return null
  }
}

/**
 * Resolve a chatId to its phone number using the full local-cache chain. Returns digits or null
 * (D-05). Never throws — every step is guarded and falls through.
 */
export async function resolveNumber(page: Page, chatId: string): Promise<string | null> {
  // Steps 1-3: Store / local-cache.
  const fromStore = await resolveFromStore(page, chatId)
  if (fromStore) {
    const n = normalizeColombian(fromStore)
    console.log(`[wa-reader] Resolved number for ${chatId} via Store cache.`)
    return n
  }
  // Step 4: DOM contact-info panel fallback (D-04), best-effort only.
  const fromDom = await resolveFromDom(page)
  if (fromDom) {
    const n = normalizeColombian(fromDom)
    console.log(`[wa-reader] Resolved number for ${chatId} via DOM panel fallback.`)
    return n
  }
  console.log(`[wa-reader] Could not resolve number for ${chatId} → null (numberMissing). (D-05)`)
  return null
}

/**
 * Pure helper for the D-06 null-rate gate (Plan 05 orchestrator counts nulls cleanly with this).
 */
export function isResolved(n: string | null): boolean {
  return typeof n === 'string' && n.length > 0
}
