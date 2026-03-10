---
phase: quick-016
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/comprehension-prompt.ts
  - src/lib/agents/somnio-v3/comprehension-schema.ts
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/sales-track.ts
  - src/lib/agents/somnio-v3/transitions.ts
autonomous: true

must_haves:
  truths:
    - "Comprehension is the sole classification authority — no ack interception in sales-track"
    - "Generic acknowledgments produce intent='acknowledgment' from comprehension, routed via transition table"
    - "Contextual acks (confirming phase positive response) produce intent='confirmar' from comprehension directly"
    - "is_acknowledgment field does not exist anywhere in somnio-v3"
    - "TypeScript compiles cleanly"
  artifacts:
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "'acknowledgment' as 21st intent in V3_INTENTS"
      contains: "'acknowledgment'"
    - path: "src/lib/agents/somnio-v3/sales-track.ts"
      provides: "Clean sales track without ack routing block"
    - path: "src/lib/agents/somnio-v3/transitions.ts"
      provides: "Transition table without acknowledgment_positive synthetic key"
  key_links:
    - from: "comprehension-prompt.ts"
      to: "constants.ts"
      via: "'acknowledgment' intent in both prompt and V3_INTENTS"
    - from: "sales-track.ts"
      to: "transitions.ts"
      via: "intent goes straight to resolveTransition (no interception)"
---

<objective>
Eliminate the ack routing block in sales-track.ts and make comprehension the sole classification authority for acknowledgments.

Purpose: Currently, comprehension sends intent='otro' + is_acknowledgment=true for generic acks, and sales-track intercepts them BEFORE the transition table using synthetic keys ('acknowledgment', 'acknowledgment_positive'). This splits classification authority between two layers. After this change, comprehension sends intent='acknowledgment' for generic acks (new real intent) or intent='confirmar' for contextual confirmations, and all intents flow directly through the transition table with zero interception.

Output: 7 modified files in somnio-v3/, clean TypeScript compilation, zero references to is_acknowledgment/isAcknowledgment/acknowledgment_positive/isPositiveAck.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/comprehension-prompt.ts
@src/lib/agents/somnio-v3/comprehension-schema.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/sales-track.ts
@src/lib/agents/somnio-v3/transitions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 'acknowledgment' intent and update comprehension layer</name>
  <files>
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/comprehension-prompt.ts
    src/lib/agents/somnio-v3/comprehension-schema.ts
  </files>
  <action>
    **constants.ts:**
    - Add 'acknowledgment' to V3_INTENTS array as the 21st intent, in a new comment group "// Acknowledgment (1)" between Escape and Fallback sections.

    **comprehension-prompt.ts:**
    - Replace ALL is_acknowledgment rules with new acknowledgment intent rules:
      - Remove line 54: "- is_acknowledgment: true SOLO para respuestas cortas..."
      - Remove line 55: "- Para reconocimientos puros (ok, si, gracias, emojis solos), usa 'otro' como primary intent y marca is_acknowledgment=true"
      - Add new rule: "- acknowledgment: reconocimientos puros sin contenido sustancial (ok, si, gracias, jaja, emojis solos). NUNCA usar para saludos. Si hay contexto claro del bot (pregunta sobre compra, confirmacion), usar el intent correspondiente (quiero_comprar, confirmar, seleccion_pack)"
      - In the CONTEXTO DE INTENTS section, add: "- acknowledgment: reconocimiento puro sin contenido (ok, si, gracias, jaja, emojis solos)"
      - In the bot context rules (lines 18-22), replace "is_acknowledgment = false" references:
        - Change final fallback from "intent = otro, is_acknowledgment = true (ack pasivo)" to "intent = acknowledgment"
        - Remove all "is_acknowledgment = false" annotations (they're unnecessary now since the field won't exist)
      - Remove the "irrelevante" description reference to "reconocimientos vacios" in classification rules — update to: "irrelevante: mensajes sin contenido sustancial que no requieren respuesta informativa"

    **comprehension-schema.ts:**
    - Remove `is_acknowledgment` field entirely from the classification z.object (lines 60-62)
    - Update `irrelevante` description in category to: 'irrelevante: messages without substantive content (acknowledgments, emojis alone)'
  </action>
  <verify>
    grep -r "is_acknowledgment" src/lib/agents/somnio-v3/comprehension-prompt.ts src/lib/agents/somnio-v3/comprehension-schema.ts src/lib/agents/somnio-v3/constants.ts — should return 0 results.
    grep "'acknowledgment'" src/lib/agents/somnio-v3/constants.ts — should return 1 result.
  </verify>
  <done>'acknowledgment' is a real intent in V3_INTENTS, comprehension prompt instructs AI to use intent='acknowledgment' instead of is_acknowledgment flag, schema has no is_acknowledgment field.</done>
</task>

<task type="auto">
  <name>Task 2: Remove is_acknowledgment from types, agent pipeline, sales-track, and transitions</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
    src/lib/agents/somnio-v3/sales-track.ts
    src/lib/agents/somnio-v3/transitions.ts
  </files>
  <action>
    **types.ts:**
    - Remove `is_acknowledgment: boolean` from classificationInfo in V3AgentOutput (line 202). Remove the entire classificationInfo optional field? NO — keep category and sentiment, just remove is_acknowledgment.

    **somnio-v3-agent.ts:**
    - Line 60: In systemEvent mock analysis, remove `is_acknowledgment: false` from classification object.
    - Lines 127-131 (guard classificationInfo), lines 232-236 (silence classificationInfo), lines 288-292 (output classificationInfo): Remove `is_acknowledgment: analysis.classification.is_acknowledgment` from ALL THREE classificationInfo objects.
    - Lines 139-148 (resolveSalesTrack call): Remove `isAcknowledgment: analysis.classification.is_acknowledgment` and `sentiment: analysis.classification.sentiment` from the input object. Keep all other fields (phase, intent, state, gates, changes, category, systemEvent).

    **sales-track.ts:**
    - Remove `isAcknowledgment` and `sentiment` from the input type definition (lines 35-36 in the function signature).
    - Remove them from the destructuring (line 43).
    - Delete the ENTIRE ack routing block (lines 105-129): the section "// 3. Acknowledgment routing" including the `if (isAcknowledgment)` block with all its sub-conditions.
    - Delete the `isPositiveAck` helper function (lines 157-159).
    - Update the file header comment (lines 8-12): Remove "3. Acknowledgment routing -> sub-type transitions" from the Flow description. Renumber step 4 to 3 and step 5 to 4.

    **transitions.ts:**
    - Delete the `acknowledgment_positive` transition entry (lines 58-67): the entry with `phase: 'confirming', on: 'acknowledgment_positive', action: 'crear_orden'`.
    - Keep the `promos_shown` + `acknowledgment` transition (lines 69-77) — this handles ack in promos without pack.
    - Keep the default `acknowledgment` -> silence transition (lines 79-87) — this handles generic acks.
    - Update comment on line 57 from "R3: acknowledgment — phase-specific exceptions handled before generic" to "R3: acknowledgment — handled via transition table (comprehension sends confirmar for positive acks in confirming)".
  </action>
  <verify>
    Run: grep -rn "is_acknowledgment\|isAcknowledgment\|acknowledgment_positive\|isPositiveAck" src/lib/agents/somnio-v3/ — must return 0 results.
    Run: npx tsc --noEmit — must compile without errors.
  </verify>
  <done>Zero references to is_acknowledgment/isAcknowledgment/acknowledgment_positive/isPositiveAck in somnio-v3/. TypeScript compiles. Sales track passes intent directly to resolveTransition with no interception. Comprehension is the sole classification authority.</done>
</task>

</tasks>

<verification>
1. `grep -rn "is_acknowledgment\|isAcknowledgment\|acknowledgment_positive\|isPositiveAck" src/lib/agents/somnio-v3/` — 0 results
2. `grep "'acknowledgment'" src/lib/agents/somnio-v3/constants.ts` — 1 result (the intent in V3_INTENTS)
3. `grep "acknowledgment" src/lib/agents/somnio-v3/transitions.ts` — only the 2 kept transitions (promos_shown + default silence)
4. `npx tsc --noEmit` — clean compilation
5. `grep "isAcknowledgment\|isPositiveAck" src/lib/agents/somnio-v3/sales-track.ts` — 0 results
</verification>

<success_criteria>
- 'acknowledgment' is a real intent (21st) in V3_INTENTS
- Comprehension prompt instructs AI to use intent='acknowledgment' for generic acks, and intent='confirmar' for contextual positive acks
- is_acknowledgment field removed from schema, types, and all pipeline code
- Sales track ack routing block (lines 108-129) completely removed
- isPositiveAck helper deleted
- acknowledgment_positive transition deleted from transitions.ts
- promos_shown ack and default ack transitions preserved in transitions.ts
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/016-eliminar-ack-routing-comprehension-autoridad/016-SUMMARY.md`
</output>
