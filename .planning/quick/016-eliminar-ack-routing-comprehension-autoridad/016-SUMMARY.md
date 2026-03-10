# Quick-016: Eliminar Ack Routing - Comprehension como Autoridad Unica

**One-liner:** Remove is_acknowledgment flag and ack routing block; comprehension sends intent='acknowledgment' directly through transition table.

## Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add 'acknowledgment' intent and update comprehension layer | e103bbc | constants.ts, comprehension-prompt.ts, comprehension-schema.ts |
| 2 | Remove is_acknowledgment from types, agent, sales-track, transitions | 7d026f6 | types.ts, somnio-v3-agent.ts, sales-track.ts, transitions.ts |

## What Changed

**Before:** Comprehension sent `intent='otro' + is_acknowledgment=true` for generic acks. Sales-track intercepted acks BEFORE the transition table, using synthetic keys (`acknowledgment_positive`) and a helper function (`isPositiveAck`). Classification authority was split between comprehension and sales-track.

**After:** Comprehension sends `intent='acknowledgment'` for generic acks or `intent='confirmar'` for contextual positive acks. All intents flow directly through the transition table with zero interception. Comprehension is the sole classification authority.

## Key Changes

1. **constants.ts:** 'acknowledgment' added as 21st intent in V3_INTENTS
2. **comprehension-prompt.ts:** Replaced is_acknowledgment rules with acknowledgment intent instructions; updated bot context rules
3. **comprehension-schema.ts:** Removed `is_acknowledgment` field from classification z.object
4. **types.ts:** Removed `is_acknowledgment: boolean` from classificationInfo in V3AgentOutput
5. **somnio-v3-agent.ts:** Removed is_acknowledgment from mock analysis, all 3 classificationInfo objects, and resolveSalesTrack call params
6. **sales-track.ts:** Removed isAcknowledgment/sentiment params, deleted entire ack routing block (section 3), deleted isPositiveAck helper, renumbered sections
7. **transitions.ts:** Deleted acknowledgment_positive entry, preserved promos_shown ack and default ack transitions, updated comment

## Verification

- `grep -rn "is_acknowledgment|isAcknowledgment|acknowledgment_positive|isPositiveAck" src/lib/agents/somnio-v3/` -- 0 results
- `grep "'acknowledgment'" src/lib/agents/somnio-v3/constants.ts` -- 1 result
- `grep "acknowledgment" src/lib/agents/somnio-v3/transitions.ts` -- only 2 kept transitions (promos_shown + default silence)
- `npx tsc --noEmit` -- 0 errors in somnio-v3/ (4 pre-existing vitest errors in somnio/ v1 tests unrelated)

## Deviations from Plan

None -- plan executed exactly as written.

## Duration

~4 minutes

## Completed

2026-03-10
