---
phase: standalone-whatsapp-inbox-reliability
plan: 01
type: execute
wave: 1
depends_on: []
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, hydration, initials, grapheme]
requirements: [F-2, D-10, D-11, D-12]
files_modified:
  - src/lib/utils/initials.ts
  - src/lib/utils/__tests__/initials.test.ts
  - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
  - src/app/(dashboard)/whatsapp/components/chat-header.tsx
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
  - src/app/(dashboard)/tareas/components/task-card.tsx
  - src/app/(dashboard)/settings/workspace/members/members-content.tsx
  - src/components/layout/sidebar.tsx
  - src/components/layout/user-menu.tsx
  - src/components/workspace/workspace-switcher.tsx
  - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx
autonomous: true

must_haves:
  truths:
    - "Reloading /whatsapp 3 times produces 0 React #418 hydration pageerrors"
    - "An avatar for a name starting with an emoji/astral char renders the full grapheme, never a U+FFFD replacement char"
    - "No avatar component indexes a name via charAt(0) or [0]"
  artifacts:
    - path: "src/lib/utils/initials.ts"
      provides: "Grapheme-safe firstGrapheme + getInitials util"
      exports: ["firstGrapheme", "getInitials"]
    - path: "src/lib/utils/__tests__/initials.test.ts"
      provides: "Edge-case coverage (emoji, astral, ZWJ, empty, null, whitespace, 2-word)"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/conversation-item.tsx"
      to: "src/lib/utils/initials.ts"
      via: "import { getInitials }"
      pattern: "from '@/lib/utils/initials'"
---

<objective>
Kill the React #418 hydration error that fires on EVERY /whatsapp load (DIAGNOSIS H-3, root cause PINNED). The crash is caused by UTF-16 indexing (`n[0]` / `charAt(0)`) in `getInitials`: a name starting with an emoji or astral character yields a lone surrogate, which SSR streams as a byte sequence the browser replaces with U+FFFD, diverging from the client render → React discards the whole SSR tree and re-renders 1000 items client-side (the dead-click window).

Purpose: Eliminate the CLASS of bug (surrogate-unsafe initials) everywhere, not just the active call site — one shared grapheme-safe util imported by all 9 inventory call sites (D-10/D-11).
Output: `src/lib/utils/initials.ts` + test, and 9 migrated call sites with 0 `charAt(0)`/`[0]`-on-names remaining.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-inbox-reliability/CONTEXT.md
@.planning/standalone/whatsapp-inbox-reliability/RESEARCH.md
@.planning/standalone/whatsapp-inbox-reliability/PATTERNS.md
@.planning/standalone/whatsapp-inbox-reliability/DIAGNOSIS.md
@CLAUDE.md

<interfaces>
<!-- The exact, research-locked util the executor must create. Copy verbatim. -->
From src/lib/utils/initials.ts (to be created):
```typescript
export function firstGrapheme(input: string): string;        // first user-perceived grapheme, '' for empty/whitespace
export function getInitials(name: string | null | undefined): string;  // up to 2 initials, uppercased, '' for empty
```
Sibling convention: `src/lib/utils/phone.ts` (named exports only, no default). NOTE: `src/lib/utils.ts` holds only `cn` — leave it untouched. Import alias is `@/lib/utils/initials`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create grapheme-safe initials util + vitest suite</name>
  <files>src/lib/utils/initials.ts, src/lib/utils/__tests__/initials.test.ts</files>
  <read_first>
    - src/lib/utils/phone.ts (sibling util convention — named exports, file layout, JSDoc style)
    - src/app/(dashboard)/whatsapp/components/__tests__/meta-upload-guard.test.ts (vitest describe/it/expect structure, no mocks)
    - RESEARCH.md Q8 (lines 301-349 — the verbatim-canonical implementation)
    - PATTERNS.md section "src/lib/utils/initials.ts" (lines 33-89) and "initials.test.ts" (lines 93-124)
  </read_first>
  <behavior>
    - getInitials(null) === '' ; getInitials('') === '' ; getInitials('   ') === ''
    - getInitials('😎 Test') === '😎T' (emoji first char is a full grapheme, never a lone surrogate)
    - getInitials('𝙴lizar') === '𝙴' (astral first char)
    - getInitials('👨‍👩‍👧 Family') → length >= 1 (ZWJ sequence collapses to one grapheme via Segmenter)
    - getInitials('Sandra Perez') === 'SP' ; getInitials('Sandra') === 'S' ; getInitials('A B C') === 'AB'
    - firstGrapheme('') === '' ; firstGrapheme('😎x') === '😎'
  </behavior>
  <action>
Create `src/lib/utils/initials.ts` with EXACTLY this body (from RESEARCH.md Q8, verbatim — do not paraphrase):

```typescript
// src/lib/utils/initials.ts
// Grapheme-safe initials. NEVER index UTF-16 (n[0]/charAt(0)) over names — a lone
// surrogate (emoji/astral first char) streamed in SSR becomes U+FFFD on the client →
// React #418 hydration mismatch (whatsapp-inbox-reliability F-2).

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('es', { granularity: 'grapheme' })
    : null

/** First user-perceived grapheme of a string, or '' for empty/whitespace-only. */
export function firstGrapheme(input: string): string {
  const s = (input ?? '').trim()
  if (!s) return ''
  if (segmenter) {
    for (const { segment } of segmenter.segment(s)) return segment
    return ''
  }
  // Fallback: code-point split (never a lone surrogate, unlike s[0]).
  return Array.from(s)[0] ?? ''
}

/** Up to 2 initials from the first two whitespace-separated words, uppercased. */
export function getInitials(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  if (!s) return ''
  return s
    .split(/\s+/)
    .slice(0, 2)
    .map(firstGrapheme)
    .join('')
    .toUpperCase()
}
```

The module-scope `segmenter` singleton is REQUIRED (constructing `Intl.Segmenter` per call is non-trivial). Do NOT add a default export.

Then create `src/lib/utils/__tests__/initials.test.ts` covering the behavior block above (use the structure from PATTERNS.md lines 105-118 verbatim). Use `import { getInitials, firstGrapheme } from '../initials'`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/utils/__tests__/initials.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/utils/__tests__/initials.test.ts` → all tests pass.
    - `grep -c "export function firstGrapheme\|export function getInitials" src/lib/utils/initials.ts` returns 2.
    - `grep -c "new Intl.Segmenter" src/lib/utils/initials.ts` returns 1 (module-scope singleton).
    - No default export: `grep -c "export default" src/lib/utils/initials.ts` returns 0.
  </acceptance_criteria>
  <done>The util exists with both exports and the test suite is green covering emoji/astral/ZWJ/empty/null/whitespace/multi-word cases.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate all 9 D-11 call sites to the shared util</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-item.tsx, src/app/(dashboard)/whatsapp/components/chat-header.tsx, src/app/(dashboard)/whatsapp/components/contact-panel.tsx, src/app/(dashboard)/tareas/components/task-card.tsx, src/app/(dashboard)/settings/workspace/members/members-content.tsx, src/components/layout/sidebar.tsx, src/components/layout/user-menu.tsx, src/components/workspace/workspace-switcher.tsx, src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx</files>
  <read_first>
    - PATTERNS.md section "F-2 Call Site Inventory (D-11)" (lines 694-714 — the exact per-file mapping table)
    - src/lib/utils/initials.ts (the util created in Task 1 — confirm exact export names)
    - Each target file's current avatar code before editing it (read the specific line, then edit)
  </read_first>
  <action>
Migrate each of the 9 call sites per the PATTERNS.md inventory table (lines 698-708). Use `getInitials` where two initials are wanted (name-based) and `firstGrapheme(...) || 'X'` where a single char with a fallback letter is wanted (email/workspace-based). Preserve each site's existing empty-name visual fallback (D-11). Concrete per-file changes:

1. `conversation-item.tsx:18-24` — DELETE the local `function getInitials` (uses `n[0]||''`); add `import { getInitials } from '@/lib/utils/initials'`. Usages at lines ~90 and ~217 (`{getInitials(displayName)}`) stay unchanged. (This is the #418-active site.)
2. `chat-header.tsx` (~302, ~496) — replace `displayName.charAt(0).toUpperCase()` with `firstGrapheme(displayName).toUpperCase()` (single-char site); add `import { firstGrapheme } from '@/lib/utils/initials'`.
3. `contact-panel.tsx` (~244-248) — replace the inline `.split(' ').slice(0,2).map((n)=>n[0]||'')` with `getInitials(fichaName)`; add import.
4. `tareas/task-card.tsx` (~35-39) — DELETE the local `function getInitials` (uses `parts[0]![0]!`); add `import { getInitials } from '@/lib/utils/initials'`.
5. `settings/workspace/members/members-content.tsx` (~78) — keep the email-parse logic, replace `email.split('@')[0][0]` with `firstGrapheme(email.split('@')[0])`; add `import { firstGrapheme }`.
6. `components/layout/sidebar.tsx` (~363, ~547, ~749) — replace `user.email?.charAt(0).toUpperCase() || 'U'` with `firstGrapheme(user.email ?? '').toUpperCase() || 'U'`; add import.
7. `components/layout/user-menu.tsx` (~23) — replace `user.email.charAt(0).toUpperCase()` with `firstGrapheme(user.email ?? '').toUpperCase()`; add import.
8. `components/workspace/workspace-switcher.tsx` (~68) — replace `displayWorkspace.name?.charAt(0).toUpperCase() || 'W'` with `firstGrapheme(displayWorkspace.name ?? '').toUpperCase() || 'W'`; add import.
9. `configuracion/whatsapp/equipos/components/team-members-manager.tsx` (~148) — replace `(member.user_name || member.user_email || 'A').charAt(0).toUpperCase()` with `firstGrapheme(member.user_name || member.user_email || 'A').toUpperCase() || 'A'`; add import.

Line numbers are approximate — locate the actual avatar/initials expression in each file before editing. Do NOT introduce React.memo here (that is F-1/Wave 2). Do NOT touch any other logic in these files.
  </action>
  <verify>
    <automated>grep -rn "charAt(0)" src/app src/components --include="*.tsx" --include="*.ts" | grep -iv "phone\|test" ; echo "EXIT_GREP:$?"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "charAt(0)" src/app/\(dashboard\)/whatsapp src/app/\(dashboard\)/tareas/components/task-card.tsx src/components/layout src/components/workspace --include="*.tsx"` returns 0 matches (no charAt(0) on names in avatar components).
    - `grep -n "function getInitials" src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx src/app/\(dashboard\)/tareas/components/task-card.tsx` returns 0 matches (local copies deleted).
    - Each of the 9 files contains `from '@/lib/utils/initials'`.
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>All 9 call sites import the shared util; no local getInitials copies and no `charAt(0)`/`[0]`-on-names remain in avatar components; tsc clean.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Robot gate probe418 + grep gate, commit, push (Wave 1 partial)</name>
  <what-built>Grapheme-safe initials util migrated to all 9 call sites, eliminating the #418 hydration error (H-3).</what-built>
  <how-to-verify>
This task is the F-2 verification gate (D-12). It runs the robot harness against the dev server. The executor MUST automate the dev server start + robot run, then present results.

1. Ensure dev server is running on port 3020 (`npm run dev` — project port per CLAUDE.md stack).
2. Run the #418 probe THREE times (D-12 requires 0 hydration pageerrors across 3 loads):
   ```bash
   for i in 1 2 3; do ROBOT_APP_URL=http://localhost:3020 npx tsx scripts/_robot-inbox-nav.ts probe418; done
   ```
   Gotcha (D-25): the robot already inlines functions inside `page.evaluate` — if you touch it, never add named functions there (`__name is not defined` under tsx/esbuild).
3. Inspect the latest `robot/probe418-*.txt` outputs: the hydration message count MUST be 0 in all 3 runs (baseline was 3/3 #418 errors).
4. Run the grep gate: `grep -rn "charAt(0)" src/app/\(dashboard\)/whatsapp src/components/layout src/components/workspace --include="*.tsx"` → expect 0.
5. Run `npx vitest run src/lib/utils/__tests__/initials.test.ts` → green.

This plan does NOT push on its own — it is part of Wave 1. The Wave 1 push happens after plans 01, 02, 03 all pass their gates (see plan 03 Task 3, the shared Wave 1 push). If plans 02/03 are not yet merged, hold the push.
  </how-to-verify>
  <resume-signal>Type "approved" if probe418 shows 0 hydration errors in 3/3 runs and grep gate is clean, or describe the failure.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| name string → DOM text node | User-controlled contact names (may contain emoji/astral/RTL) cross into SSR-streamed HTML |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wir-01 | Tampering | initials util / SSR text | mitigate | Grapheme-safe segmentation guarantees a valid code-point sequence in SSR output — no lone surrogate to be coerced to U+FFFD; eliminates the hydration-divergence vector |
| T-wir-02 | DoS | avatar render on 1000 names | accept | Volume is addressed by F-1 virtualization (Wave 2); this plan does not regress render count |
</threat_model>

<verification>
- `npx vitest run src/lib/utils/__tests__/initials.test.ts` green.
- robot `probe418` ×3 → 0 hydration pageerrors (D-12).
- `grep -rn "charAt(0)" src/app/(dashboard)/whatsapp src/components/layout src/components/workspace --include="*.tsx"` → 0.
- `npx tsc --noEmit` → 0 errors (project memory: tsc clean predicts Vercel build green).
</verification>

<success_criteria>
- One shared grapheme-safe util exists and is imported by all 9 D-11 call sites.
- 0 #418 hydration errors on 3 fresh /whatsapp loads.
- No `charAt(0)`/`[0]`-on-names remain in avatar components.
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-inbox-reliability/01-SUMMARY.md`
</output>
