# Phase 33: Confidence Routing + Disambiguation Log - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Bot routes low-confidence intent detections to human agents instead of guessing, and logs the full context of ambiguous situations for human review and future training. Two-band system: 80%+ respond normally, <80% handoff + log. No disambiguator UI in this phase -- review happens via Supabase dashboard (V1).

</domain>

<decisions>
## Implementation Decisions

### Confidence threshold
- 2 bands only: >= 80% respond, < 80% handoff+log
- Disambiguator with more bands built later with real production data
- Confidence check integrates into existing classification pipeline (Phase 30)

### Low-confidence handoff behavior
- Real HANDOFF: bot off, "Regalame 1 min", notify host (same as existing HANDOFF flow)
- Handoff happens BEFORE any template is sent for that message
- Automatically creates disambiguation_log record on every low-confidence handoff

### Disambiguation log content
- Customer message text
- Agent state at time of detection
- Top intent alternatives with confidence scores
- Templates already sent in conversation (templates_enviados from session_state)
- Pending templates (from pending_templates)
- Conversation history summary
- Fields for human review: correct_intent, correct_action, guidance_notes, reviewed boolean

### Human review workflow
- V1: Supabase dashboard only (no MorfX UI)
- Reviewer fills in correct_intent, correct_action, guidance_notes
- Marks entry as reviewed
- Data collected for future training/disambiguator -- no automated feedback loop in this phase

### Claude's Discretion
- Exact disambiguation_log table schema (column types, indexes)
- How much conversation history to summarize (token budget)
- Whether to include raw IntentDetector response or just top-N alternatives
- Index strategy for the table

</decisions>

<specifics>
## Specific Ideas

- Success criteria explicitly states: "via Supabase dashboard in V1" -- keep it simple, no custom UI
- Phase is LOW risk: small code change in somnio-agent + new DB table
- Block system context (templates_enviados, pending_templates) must be preserved in log for reviewers to understand what the bot had already communicated

</specifics>

<deferred>
## Deferred Ideas

- Multi-band disambiguator with production data -- future iteration after collecting enough reviewed logs
- Custom MorfX UI for disambiguation review -- future phase if Supabase dashboard proves insufficient
- Automated feedback loop (reviewed logs feeding back into intent detection) -- future capability

</deferred>

---

*Phase: 33-confidence-routing-disambiguation-log*
*Context gathered: 2026-03-02*
