---
phase: whatsapp-history-reader
plan: 06
type: execute
wave: 5
depends_on: [05]
decisions: [D-16, D-03, D-04, D-06, D-08, D-09, D-10]
files_modified:
  - robot-whatsapp-reader/src/chat-scraper.ts
  - .planning/standalone/whatsapp-history-reader/PILOT-RESULTS.md
autonomous: false
requirements: [D-16, D-03, D-04, D-06, D-08, D-09, D-10]
must_haves:
  truths:
    - "The pilot runs --pilot on 3-5 REAL chats of a real number and HALTS (does not sweep)"
    - "The measured null-rate is reported BEFORE any full sweep is authorized (D-06/D-16)"
    - "RESEARCH open questions are resolved empirically: raw message field shape locked, archived-chat hydration confirmed, real LID null-rate measured"
    - "JSON structure (D-07/D-08/D-09/D-10), phone capture (D-04), and message fidelity (order/timestamps/fromMe/placeholders) are validated against real data before the operator authorizes the sweep"
  artifacts:
    - path: ".planning/standalone/whatsapp-history-reader/PILOT-RESULTS.md"
      provides: "Recorded pilot evidence: null-rate, raw-message-shape lock, fidelity findings, GO/NO-GO decision"
      contains: "null-rate"
  key_links:
    - from: "pilot run output"
      to: "operator GO/NO-GO authorization"
      via: "human checkpoint after structure + null-rate validation"
      pattern: "GO|NO-GO"
---

<objective>
Execute the MANDATORY D-16 supervised pilot — the first real run of the robot on a small sample (3-5 real chats), with execution HALTING for human validation before any full sweep is authorized. This gate exists to catch the two failure modes only observable against real WhatsApp data: virtualization message loss and a high LID null-rate. The operator inspects the pilot output, the measured null-rate is reported, RESEARCH open questions are resolved empirically, and the operator explicitly approves (GO) or rejects (NO-GO) before Plan 07 (full sweep) may run.

Purpose: Prove the structure and extractor against real data so the full sweep is never built on a broken structure ("hacer posibles pruebas al principio para no hacer todo sobre una estructura rota").
Output: A PILOT-RESULTS.md recording the evidence + the operator's GO/NO-GO decision.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-history-reader/CONTEXT.md
@.planning/standalone/whatsapp-history-reader/RESEARCH.md
@robot-whatsapp-reader/README.md
@robot-whatsapp-reader/src/index.ts

<notes>
RESEARCH Open Questions this pilot MUST resolve (RESEARCH.md lines 561-565):
1. Actual @lid null-rate on real lead chats — PRINT the per-chat resolved number + aggregate null-rate; do not sweep until clearly under threshold (0.08).
2. Exact raw message object shape from WPP.chat.getMessages in wa-js 4.3.0 — `console.log(JSON.stringify(raw[0]))` ONCE to lock the t/fromMe/body/type mapping; freeze normalize() if anything differs.
3. Whether archived 1:1 chats are fully hydrated before getMessages — if an archived chat returns [], may need to select/touch it first.
</notes>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Prepare the pilot harness (raw-message logging) and dry checks</name>
  <read_first>
    - RESEARCH.md lines 561-565 (open questions to resolve)
    - RESEARCH.md lines 257-258 (Pitfall guard — re-call/union option if a message is missed)
    - robot-whatsapp-reader/src/chat-scraper.ts (scrapeMessages — where to add the one-time raw log)
    - robot-whatsapp-reader/src/index.ts (pilot mode flow)
  </read_first>
  <files>robot-whatsapp-reader/src/chat-scraper.ts</files>
  <action>
Before the live run, add a one-time raw-message debug log gated to pilot so Open Question 2 can be answered. In `scrapeMessages` (or in index.ts pilot branch), add a guard that logs `console.log('[wa-reader][pilot] RAW SAMPLE:', JSON.stringify(raw[0]))` for the FIRST non-empty chat ONLY when a `--pilot` / env flag is set (e.g. read `process.env.WA_PILOT_RAWLOG === '1'` or pass a `debugRawSample` boolean through). This must NOT change normal behavior and must remain zero-send.

Re-run the project-wide zero-send gate after the edit: `grep -rEn "sendText|sendMessage|WPP\.chat\.send|requestPhoneNumber" src/` returns 0. Re-run `npm run build` (exits 0).

This is the only code touched in this plan — everything else is the live pilot + human validation in Task 2.
  </action>
  <verify>
    <automated>cd robot-whatsapp-reader && grep -qi 'RAW SAMPLE' src/chat-scraper.ts && ZS=$(grep -rEn "sendText|sendMessage|WPP\.chat\.send|requestPhoneNumber" src/ | wc -l) && [ "$ZS" -eq 0 ] && npm run build && echo PILOT_HARNESS_OK</automated>
  </verify>
  <acceptance_criteria>
    - `grep -ic 'RAW SAMPLE' robot-whatsapp-reader/src/chat-scraper.ts` returns >= 1 (one-time raw shape log, pilot-gated)
    - the raw log is GATED (not always-on): `grep -Ec 'WA_PILOT_RAWLOG|debugRawSample|pilot' robot-whatsapp-reader/src/chat-scraper.ts` returns >= 1
    - PROJECT-WIDE zero-send still passes: `grep -rEn "sendText|sendMessage|WPP\.chat\.send|requestPhoneNumber" robot-whatsapp-reader/src/` returns 0 lines
    - `cd robot-whatsapp-reader && npm run build` exits 0
  </acceptance_criteria>
  <done>A pilot-gated one-time raw-message log exists to answer Open Question 2; zero-send still passes; build clean.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: SUPERVISED PILOT GATE — run on real chats, report null-rate, validate, GO/NO-GO</name>
  <read_first>
    - CONTEXT.md line 58 (D-16 verbatim — the pilot gate requirement)
    - RESEARCH.md lines 515-522 (Phase Requirements → Validation Map — exactly what to eyeball per decision)
    - RESEARCH.md line 438 (D-06 rationale — if pilot null-rate already >2-3% on real chats, revisit extractor before sweeping)
    - robot-whatsapp-reader/README.md (the operator run instructions)
  </read_first>
  <what-built>
A finished read-only CLI (`robot-whatsapp-reader`) that, in `--pilot` mode, opens a persistent Chrome session, injects wa-js, captures the business identity, enumerates 1:1 chats (incl. archived), and scrapes the first `config.pilotChatCount` (5) chats to atomic JSON + manifest — then HALTS without sweeping. It prints the running null-rate and (with the pilot raw-log) one raw message object to lock the field mapping. Zero send paths exist (project-wide grep = 0).
  </what-built>
  <how-to-verify>
**This is a HUMAN gate. Execution HALTS here. The operator's phone is required (QR scan). The full sweep (Plan 07) MUST NOT run until the operator types GO.**

1. **Run the pilot** (operator, on the real number — e.g. the trigger case 573162814531):
   `cd robot-whatsapp-reader && WA_PILOT_RAWLOG=1 npm run dev -- --number 573162814531 --pilot`
   Scan the QR (WhatsApp → Linked Devices). Wait for the run to complete and HALT (it prints "PILOT COMPLETE … NOT sweeping").

2. **Report the measured null-rate** (D-06/D-16): read the printed aggregate null-rate. Record it. If it is already > 2-3% on these real chats, that is a RED FLAG per RESEARCH — investigate the extractor before authorizing the sweep (likely NO-GO).

3. **Lock the raw message shape** (Open Question 2): from the `[wa-reader][pilot] RAW SAMPLE: {...}` log, confirm the fields `t` (unix seconds), `id.fromMe`, `body`, `type` map as `normalize()` assumes. If any field name differs, that is a NO-GO until `normalize()` is corrected.

4. **Validate JSON structure** (D-07/D-08/D-09/D-10) — open 2-3 files in `output/573162814531/`:
   - D-08: `business.number` is set and correct (the operator's own number); `fromMe` matches who actually sent each message (spot-check a few you remember).
   - D-09: timestamps are in America/Bogota (`-05:00` offset), plausible vs the real chat.
   - D-10: a non-text message shows `text:null` + a `note` placeholder (e.g. `<imagen omitida>`), in the right position.
   - D-07: one file per chat, named by number; `manifest.json` lists each with `status:'done'` + messageCount.

5. **Validate phone capture** (D-04): the `number` in each file matches the real contact's phone (cross-check against the visible chat). `numberMissing:true` only where genuinely unresolvable.

6. **Validate full history** (D-03 / Pitfall 1 — virtualization): pick 1-2 chats; scroll the REAL chat to the very top by hand and eyeball that the oldest message in the JSON matches the oldest visible message. The counts should be plausible (not suspiciously round/low). If the JSON is missing old messages → virtualization loss → NO-GO (this is exactly what the gate exists to catch).

7. **Validate archived hydration** (Open Question 3): confirm at least one archived chat was captured with messages. If an archived chat came back empty, note it — the extractor may need a select/touch step before sweeping.

8. **Record everything** in `.planning/standalone/whatsapp-history-reader/PILOT-RESULTS.md`: the measured null-rate, the raw-shape confirmation, per-decision findings (D-03/D-04/D-06/D-08/D-09/D-10), any anomalies, and the final GO / NO-GO decision with rationale.

**Decision:**
- **GO** → structure + null-rate + fidelity all validated → authorize Plan 07 (full sweep).
- **NO-GO** → record the specific failure (high null-rate / wrong raw shape / virtualization loss / empty archived) → a follow-up fix plan is needed before re-piloting. Do NOT proceed to the sweep.
  </how-to-verify>
  <resume-signal>Type "GO" (with the recorded null-rate) to authorize the full sweep, or "NO-GO: <reason>" to halt for a fix.</resume-signal>
  <acceptance_criteria>
    - PILOT-RESULTS.md exists and records the measured null-rate (numeric)
    - PILOT-RESULTS.md records the raw-message-shape confirmation (Open Question 2 resolved)
    - PILOT-RESULTS.md records per-decision findings for D-03, D-04, D-06, D-08, D-09, D-10
    - PILOT-RESULTS.md contains an explicit "GO" or "NO-GO: <reason>" decision line
    - The pilot run did NOT proceed to a full sweep (only pilotChatCount chats in output/<number>/)
  </acceptance_criteria>
  <done>The pilot ran on real chats, HALTED, the null-rate was reported, RESEARCH open questions resolved, structure/fidelity validated, and the operator recorded a GO/NO-GO decision in PILOT-RESULTS.md. Plan 07 is unblocked only on GO.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| unvalidated extractor ↔ full sweep | A broken structure or high null-rate must not be discovered AFTER mass-backing-up real client data |
| pilot run ↔ live WhatsApp account | First real session — the moment the zero-send + anti-ban invariants meet reality |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-WHR06-01 | Information Disclosure (silent incomplete backup at scale) | extractor vs real data | mitigate | Pilot measures null-rate + cross-checks full-history BEFORE sweep; GO/NO-GO gate (D-16) |
| T-WHR06-02 | Tampering / ToS (first live session triggers a send/ban) | live pilot run | mitigate | Project-wide zero-send grep = 0 (re-verified Task 1); read-only one-shot; operator supervises |
| T-WHR06-03 | Information Disclosure | pilot output/ (real PII) | mitigate | gitignored; operator-local; deleted after stage-2; only 5 chats in pilot |
| T-WHR06-04 | Repudiation (no record of validation) | sweep authorization | mitigate | PILOT-RESULTS.md records evidence + explicit GO/NO-GO with null-rate |
</threat_model>

<verification>
- Build + zero-send re-verified before the live run (Task 1 acceptance).
- The pilot HALTED (only pilotChatCount chats written) — no auto-sweep.
- PILOT-RESULTS.md records null-rate + raw-shape + per-decision findings + GO/NO-GO.
</verification>

<success_criteria>
- D-16 satisfied: first run was a supervised pilot that halted for human validation.
- Null-rate measured and reported before any sweep (D-06).
- RESEARCH open questions (null-rate, raw shape, archived hydration) resolved empirically.
- Structure + phone capture + message fidelity validated against real data; GO/NO-GO recorded.
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-history-reader/06-SUMMARY.md` (include the GO/NO-GO outcome and the measured null-rate).
</output>
