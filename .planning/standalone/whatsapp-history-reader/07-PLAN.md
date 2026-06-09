---
phase: whatsapp-history-reader
plan: 07
type: execute
wave: 6
depends_on: [06]
decisions: [D-03, D-11, D-13, D-14, D-15]
files_modified:
  - .planning/standalone/whatsapp-history-reader/SWEEP-RESULTS.md
autonomous: false
requirements: [D-03, D-11, D-13, D-14, D-15]
must_haves:
  truths:
    - "The full sweep runs ONLY after the Plan 06 pilot returned GO"
    - "All enumerated 1:1 chats (active + archived) of the target number are backed up to per-chat JSON + manifest, full history each (D-03)"
    - "The sweep runs in resumable batches; re-running skips done chats and never re-scrapes them (D-11/D-13)"
    - "Across the whole sweep the robot sends nothing; on logout it pauses clean and resumes via --resume (D-15)"
    - "After completion the operator unlinks the device and the per-number output is complete (D-14)"
  artifacts:
    - path: ".planning/standalone/whatsapp-history-reader/SWEEP-RESULTS.md"
      provides: "Sweep completion record: chats done/failed, final null-rate, manifest summary, unlink confirmation"
      contains: "manifest"
  key_links:
    - from: "Plan 06 GO decision"
      to: "full sweep authorization"
      via: "operator gate"
      pattern: "GO"
    - from: "manifest.json"
      to: "sweep completeness"
      via: "all chats status:done"
      pattern: "done"
---

<objective>
Run the full read-only backup sweep over the target number's complete 1:1 chat set (active + archived), in resumable batches, after — and only after — the Plan 06 pilot returned GO. This produces the complete per-number archive (`output/<number>/*.json` + `manifest.json`) that the future stage-2 migrator will consume, while honoring D-13 pacing/caps, D-11 resume (never re-scrape done), and the D-15 zero-send fail-safe across the entire run.

Purpose: Deliver the actual deliverable of this standalone — a complete, correct, resumable history backup of one client's number — and establish the repeatable per-client procedure (D-14).
Output: A completed sweep + SWEEP-RESULTS.md recording completeness, final null-rate, and the post-sweep device unlink.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-history-reader/CONTEXT.md
@.planning/standalone/whatsapp-history-reader/RESEARCH.md
@.planning/standalone/whatsapp-history-reader/PILOT-RESULTS.md
@robot-whatsapp-reader/README.md
@robot-whatsapp-reader/src/index.ts
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: FULL SWEEP — run batches to completion, then unlink (operator)</name>
  <read_first>
    - .planning/standalone/whatsapp-history-reader/PILOT-RESULTS.md (MUST show GO — do not run otherwise)
    - RESEARCH.md lines 440 (D-13 batched/resumable rationale) + lines 477-489 (linked-device unlink after sweep)
    - RESEARCH.md lines 395-399 (Pitfall 4 — logout mid-run: pause clean, re-scan, resume; never send)
    - robot-whatsapp-reader/README.md (sweep + resume + unlink instructions)
  </read_first>
  <what-built>
The finished CLI in NON-pilot mode: it enumerates the full 1:1 chat set (active + archived), skips any chat already `done` in the manifest (D-11), scrapes full history per chat from the Store (D-03), atomic-writes each, paces between chats (D-13), enforces the D-06 gate, and on logout pauses clean (D-15) so a `--resume` run continues where it stopped. Zero send paths exist (verified Plan 05/06).
  </what-built>
  <how-to-verify>
**PRECONDITION (blocking): `PILOT-RESULTS.md` must contain a "GO" decision. If it says NO-GO, STOP — a fix plan is needed first. Do not run the sweep.**

**This is a HUMAN-operated gate — it needs the operator's phone (QR) and is inherently NOT autonomous/CI-runnable.**

1. **Start the sweep** (no `--pilot`):
   `cd robot-whatsapp-reader && npm run dev -- --number 573162814531`
   Scan the QR if prompted (the persistent profile from the pilot likely keeps you logged in). Let it run. It paces between chats (4-9s + jitter) and respects `perSessionChatCap` (150) — when the cap or `--limit` is hit it stops cleanly.

2. **Run batches until complete** (D-13/D-11): re-run the SAME command for each batch. Each run auto-resumes — it skips `done` chats and retries `failed` ones. Repeat until a run reports there are no remaining chats (`✅ All done` / 0 remaining).

3. **If the session logs out mid-run** (D-15): the robot prints "SESSION LOST — pausing clean … NOTHING was sent" and stops. Re-scan the QR (Linked Devices) and re-run the same command — it resumes. NEVER does it send anything to wake the session.

4. **Confirm completeness**: open `output/573162814531/manifest.json` — every enumerated chat should be `status:'done'` (a small number of `failed` is acceptable if genuinely unresolvable; note them). Record the final aggregate null-rate (should be under the gate threshold, consistent with the pilot).

5. **Unlink the device** (RESEARCH linked-device note — one-shot, not 24/7): on the phone, WhatsApp → Linked Devices → log out the robot's session. This is the CONTEXT "extract one-shot then unlink" requirement.

6. **Record results** in `.planning/standalone/whatsapp-history-reader/SWEEP-RESULTS.md`: number of chats done / failed (with reasons), total messages, final null-rate, manifest summary, confirmation that the device was unlinked, and a note that `output/` is PII to be kept local and deleted after the future stage-2 import.

7. **Multi-client (D-14)**: to back up another client, repeat the whole flow (pilot-then-sweep) with a different `--number` — each gets isolated `output/<number>/` + `profiles/<number>/`.
  </how-to-verify>
  <resume-signal>Type "sweep complete: <done>/<failed> chats, null-rate <x>, device unlinked" — or describe any blocker.</resume-signal>
  <acceptance_criteria>
    - PILOT-RESULTS.md shows GO before the sweep ran (precondition honored)
    - `output/<number>/manifest.json` exists and (near-)all chats are `status:'done'` (failures itemized with reasons)
    - SWEEP-RESULTS.md records done/failed counts, final null-rate, and device-unlink confirmation
    - SWEEP-RESULTS.md confirms no message was ever sent during the sweep (D-15) and that output/ remains gitignored PII
    - For any logout, resume was used (re-run), not a send-to-wake
  </acceptance_criteria>
  <done>The full sweep completed in resumable batches with GO precondition honored; manifest shows all chats done (failures itemized); final null-rate recorded; device unlinked; SWEEP-RESULTS.md written; zero send across the run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| long multi-batch live session ↔ WhatsApp account | Sustained automation over a real account — the anti-ban + zero-send invariants must hold for the whole sweep, not just one chat |
| completed output/ ↔ everything else | A complete client history at rest is the highest-value PII this tool produces |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-WHR07-01 | Tampering / ToS (send/ban over a long run) | sweep CLI | mitigate | Zero-send proven (Plan 05/06 grep=0); read-only; D-13 pacing; logout → resume not send (D-15) |
| T-WHR07-02 | Denial of Service (account ban from sustained automation) | sweep pacing | mitigate | randDelay + per-session/daily caps; batched resumable; local residential IP; unlink after (one-shot) |
| T-WHR07-03 | Information Disclosure (complete client history leaked) | output/<number>/ | mitigate | gitignored; local-only; SWEEP-RESULTS notes delete-after-stage-2; device unlinked post-sweep |
| T-WHR07-04 | Tampering (incomplete/duplicated backup) | resume/manifest | mitigate | D-11 skip-done + retry-failed; atomic write (D-12); manifest completeness check in acceptance |
| T-WHR07-05 | Elevation (sweep run without pilot approval) | sweep authorization | mitigate | Blocking precondition: PILOT-RESULTS.md must show GO |
</threat_model>

<verification>
- Precondition: PILOT-RESULTS.md = GO (else stop).
- Completeness: manifest.json all/near-all `done`; failures itemized.
- SWEEP-RESULTS.md records counts + final null-rate + unlink + zero-send confirmation.
- This is inherently a live, human-operated run — not CI-verifiable; correctness is established by the manifest + operator record, building on the code gates proven in Plans 05/06.
</verification>

<success_criteria>
- Full history of the target number backed up (active + archived, full per chat — D-03), resumably (D-11/D-13).
- Zero send across the entire sweep; logout handled by resume (D-15).
- Per-number isolation honored; device unlinked after; output kept as local gitignored PII (D-14).
- SWEEP-RESULTS.md records completeness, final null-rate, and unlink.
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-history-reader/07-SUMMARY.md` (include done/failed counts + final null-rate + unlink confirmation).
</output>
