# LEARNINGS — v4-media-audio-image standalone

Completed: 2026-06-01  
Plans: 01-06 (6 plans), Waves 0-5  
Baseline SHA: `85092058e4495fc0e97ff0be2c6da582ca06c563`

---

## L-01: Decision computed IN CODE from categoria — never from LLM (Pitfall 4)

**Standalone:** Plan 03 (image-classifier.ts)

If you ask an LLM to return a binary decision, it will sometimes return the wrong one (ambiguous framing, classification errors, hallucination). For the `classifyImage` call, the LLM returns ONLY `categoria` + `descripcion`. The `decision` field (`responder` vs `handoff`) is computed in code via:

```ts
function computeDecision(categoria: ImageCategoria): 'responder' | 'handoff' {
  return categoria === 'producto' || categoria === 'pagina' ? 'responder' : 'handoff'
}
```

This makes the taxonomy change safe (update the code, not the prompt) and keeps the decision auditable. **Reuse this pattern for any classification→action mapping that must not drift.**

---

## L-02: AI SDK ImagePart uses `mediaType`, not `mimeType`

**Standalone:** Plan 03 (image-classifier.ts)

TypeScript caught this immediately: `property 'mimeType' does not exist on type 'ImagePart'`. The correct field is `mediaType`. The AI SDK provider types are strict — always verify field names with tsc before committing.

```ts
{
  type: 'image',
  image: base64Data,
  mediaType: mimeType,  // NOT mimeType
}
```

---

## L-03: Tests with fetchAsBase64 need a fetch global mock

**Standalone:** Plan 03 (image-classifier tests)

`image-classifier.ts` calls `fetchAsBase64(imageUrl)` (via `fetch`) before calling the AI SDK. Without mocking `fetch`, unit tests make real HTTP requests to `https://example.com/...` and get 404/ENOTFOUND, breaking the test even when the AI SDK mock is correct.

Pattern:
```ts
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeFetchOk() {
  return mockFetch.mockResolvedValue({
    ok: true,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  })
}
```

Add `makeFetchOk()` in `beforeEach` for tests that go through `fetch`.

---

## L-04: All 6 categorias must be explicitly covered in tests

**Standalone:** Plan 06 (image-classifier.test.ts gap-fill)

Plan 03 initially covered 4 of 6 categorias (`producto`, `comprobante_pago`, `documento_identidad`, and `ambiguo` via fail-safe). Missing: `pagina` (→ `responder`) and `captura_conversacion` (→ `handoff`). Also `ambiguo` as a normal LLM-returned value was only tested via the fail-safe (which has `descripcion: ''`).

**Rule:** For any finite enum taxonomy that drives a decision, test ALL enum members explicitly — not just the ones you expect to be most common. The plan's Task 1 guidance called this out, but the initial test writing stopped at 4.

---

## L-05: `rag:*` templates need 3 special paths in the v4 runner

**Standalone:** Plan 04 (vision branch delivery)

When emitting a `rag:<topic>` ProcessedMessage from the agent, the v4 runner needs all 3 checks:

1. **Send loop** (`:751`): `if (output.templates && output.templates.length > 0)` — normal send
2. **No-rep filter** (`:796`): `t.templateId.startsWith('rag:')` → always survive (not filtered by no-rep)
3. **Ledger exclusion** (`:839`): `!id.startsWith('rag:')` → excluded from `templates_enviados` (so it can be re-sent if needed)

This was established by `resolveLowSlot:576-589`. When adding a NEW code path that emits `rag:` templates, verify all 3 properties are inherited. The vision branch reuses `runSubLoop` which already produces the right `sourceTopic` → the shape just mirrors `resolveLowSlot` exactly.

---

## L-06: Dedicated vision branch MUST be before `comprehend()` (D-05)

**Standalone:** Plan 04 (somnio-v4-agent.ts)

The vision branch uses `runSubLoop` (KB-grounded RAG) as a replacement for the full comprehend→state-machine→response-track pipeline. It MUST be placed before `comprehend()` to avoid calling the Gemini comprehension model unnecessarily (extra cost + latency) and to prevent incorrect intent extraction from an image description.

The `recentBotMessages` derivation (pure, from `input.history`) was hoisted above the branch so it's available inside it. This is safe — it has no side effects.

**Check:** In `somnio-v4-agent.ts`, the `if (input.visionContext)` guard is at :181 and `comprehend()` is at :333 (confirmed at plan time via self-check).

---

## L-07: Regla 6 proof requires both negative AND positive evidence

**Standalone:** Plan 06 (REGLA6-EVIDENCE.md)

For a Regla 6-isolated change, the evidence must prove two things:

**Negative (G1-G3):** The PROTECTED list has 0 lines changed since baseline.  
**Positive (G7-G8):** The v4 touches are additive + v4-gated.

Capturing ONLY the protected-list diffs ("empty") is insufficient — it doesn't prove the added code is isolated. Capturing ONLY the v4 diffs is insufficient — it doesn't prove nothing leaked. Both are required to constitute "Regla 6 proof".

The gate methodology: run `git diff <baseline-sha>..HEAD` per file/directory for each gate. This is repeatable and captures the state at any point in time.

---

## L-08: D-07 fail-safe must be the innermost catch — not just top-level

**Standalone:** Plan 03 (image-classifier.ts)

The fail-safe wraps the entire `try { ... } catch { ... return FAIL_SAFE }` block. This covers:
- `fetchAsBase64` network errors (non-ok status, ENOTFOUND)
- Gemini API errors (timeout, safety block → `NoOutputGeneratedError`)
- Malformed response (null output, missing fields)
- Any unexpected runtime error

If the fail-safe were only around the `generateText` call, `fetchAsBase64` failures would throw. **Always wrap the ENTIRE function body in the fail-safe catch**, not just the LLM call.

---

## L-09: 360dialog inbound media requirement (D-11) — must be in deferred-smoke checklist

**Standalone:** Plan 06 (smoke deferral)

WhatsApp inbound media (images + audio) is served from **360dialog CDN URLs**, not from Meta's standard CDN. If you try to fetch a media URL from a Onurix (Meta Direct) workspace, you get 401/403 because Onurix URLs use different auth. The production smoke for audio transcription and image classification can ONLY be tested on a 360dialog-connected workspace.

**Always note D-11 in smoke checklists for any feature involving inbound WhatsApp media.**

---

## L-10: Focused vitest sweep is better than directory sweep when pre-existing live-LLM tests exist

**Standalone:** Plan 06 (test sweep)

The plan specification said `npx vitest run src/lib/agents/somnio-v4/` (directory sweep). This would include `smoke-rag-a.test.ts`, `smoke-rag-b.test.ts`, and `few-shots.test.ts` — which are known pre-existing failures from the `somnio-v4-rag-generative` standalone.

The focused sweep (listing explicit test file paths, excluding the known debt) produces a cleaner, non-misleading result. When running the full directory sweep, pre-existing failures appear as regressions and require lengthy classification. **Document the exclusion explicitly in the evidence file so it's auditable.**

Pattern: run `npx vitest run <explicit-path-1> <explicit-path-2> ...` and document which files were excluded and why.
