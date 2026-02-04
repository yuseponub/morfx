---
phase: 11-shopify-integration
plan: 02
subsystem: api
tags: [shopify, hmac, security, phone-normalization, fuzzy-matching, fuse.js, talisman, webhooks]

# Dependency graph
requires:
  - phase: 04-contacts
    provides: Contact model with phone field for matching
provides:
  - HMAC verification utility for secure webhook processing
  - Phone normalization for international Shopify formats
  - Contact matching with phone-first and fuzzy-fallback strategy
affects: [11-03-webhook-endpoint, 11-04-order-mapper, 11-05-integration-settings]

# Tech tracking
tech-stack:
  added: [fuse.js, talisman]
  patterns: [tiered-matching, timing-safe-comparison, phonetic-similarity]

key-files:
  created:
    - src/lib/shopify/hmac.ts
    - src/lib/shopify/phone-normalizer.ts
    - src/lib/shopify/contact-matcher.ts
    - src/lib/shopify/talisman.d.ts

key-decisions:
  - "Use crypto.timingSafeEqual for HMAC verification to prevent timing attacks"
  - "Phone normalization handles international formats with CO fallback for ambiguous numbers"
  - "Fuzzy matches always require human verification (needsVerification: true)"
  - "Double Metaphone for phonetic matching (better than Soundex for Spanish names)"

patterns-established:
  - "Tiered matching: phone first (exact), fuzzy second (needs verification)"
  - "Shopify phone extraction: order.phone > customer.phone > shipping.phone > billing.phone"
  - "Fuzzy confidence threshold at 40% to avoid false positives"

# Metrics
duration: 11min
completed: 2026-02-04
---

# Phase 11 Plan 02: Core Utilities Summary

**Secure HMAC verification, international phone normalization, and intelligent contact matching with phone-first strategy and fuzzy name+city fallback using Fuse.js and Double Metaphone**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-04T20:57:26Z
- **Completed:** 2026-02-04T21:08:35Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- HMAC verification utility with timing-safe comparison for secure webhook processing
- Phone normalization that handles international Shopify formats with Colombia fallback
- Contact matcher implementing tiered strategy: exact phone match first, fuzzy name+city second
- All fuzzy matches flagged for human verification (core requirement from CONTEXT.md)

## Task Commits

Each task was committed atomically:

1. **Task 1: HMAC verification utility** - `1e0e7a9` (feat)
2. **Task 2: Phone normalization for Shopify** - `72ee0b7` (feat)
3. **Task 3: Contact matching with fuzzy logic** - `34ea1dd` (feat)

## Files Created/Modified

- `src/lib/shopify/hmac.ts` - HMAC-SHA256 verification with timing-safe comparison
- `src/lib/shopify/phone-normalizer.ts` - International phone normalization with E.164 output
- `src/lib/shopify/contact-matcher.ts` - Tiered contact matching with Fuse.js and Double Metaphone
- `src/lib/shopify/talisman.d.ts` - TypeScript declarations for talisman phonetics module
- `package.json` - Added fuse.js and talisman dependencies

## Decisions Made

1. **Timing-safe HMAC comparison:** Using crypto.timingSafeEqual prevents attackers from measuring response times to guess the correct HMAC character by character.

2. **International phone handling:** Unlike the existing phone.ts (Colombia-only), Shopify phones can be from any country. The normalizer tries automatic country detection first, then falls back to CO for ambiguous local numbers.

3. **Fuzzy match verification requirement:** All fuzzy name+city matches MUST be flagged for human verification (needsVerification: true). This prevents auto-assigning orders to the wrong contact based on similar names.

4. **Double Metaphone over Soundex:** Better for non-English names common in LATAM. Returns two encodings (primary and alternate) for more robust "sounds like" matching.

5. **40% confidence threshold:** Prevents false positives in fuzzy matching while still catching reasonable matches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added TypeScript declarations for talisman**
- **Found during:** Task 3 (Contact matcher implementation)
- **Issue:** talisman library lacks TypeScript types, causing TS7016 error
- **Fix:** Created talisman.d.ts with type declarations for double-metaphone function
- **Files modified:** src/lib/shopify/talisman.d.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 34ea1dd (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** TypeScript type declaration was necessary for compilation. No scope creep.

## Issues Encountered

None - plan executed smoothly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core utilities ready for webhook endpoint implementation (Plan 03)
- HMAC verification ready for route handler
- Phone normalization ready for contact matching
- Contact matcher ready for order processing
- Types already defined in src/lib/shopify/types.ts (from Plan 01)

---
*Phase: 11-shopify-integration*
*Completed: 2026-02-04*
