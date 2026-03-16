# GoDentist Follow-Up Ultimatum - Research

**Researched:** 2026-03-16
**Domain:** Inngest scheduled jobs, Supabase message queries, WhatsApp templates
**Confidence:** HIGH

## Summary

This feature adds an automatic follow-up system to the existing GoDentist confirmation flow. When `sendConfirmations` runs (morning), it schedules an Inngest job for 2pm Colombia time. At 2pm, the job checks each patient's conversation for inbound messages after `sent_at`. Patients who haven't responded receive a `conservacion_cita` WhatsApp template as an ultimatum.

The entire infrastructure already exists: Inngest `sleepUntil` pattern (used in godentist-reminders.ts), `sendTemplateMessage` domain function, conversations indexed by phone, messages table with direction/timestamp columns, and the confirmaciones-panel UI with tabs.

**Primary recommendation:** Add a new Inngest event `godentist/followup.check` and function `godentist-followup-check`. Extend `godentist_scrape_history` with a `followup_results` JSONB column rather than creating a new table. Fire the event at the end of `sendConfirmations`.

## Standard Stack

### Core (already in project)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Inngest | Scheduled job via `step.sleepUntil` | Already used for godentist-reminder-send, exact same pattern |
| Supabase (admin client) | Query messages/conversations, update history | `createAdminClient()` bypasses RLS, domain pattern |
| `sendTemplateMessage` | Send WhatsApp template | Domain layer function, already used in sendConfirmations |

### No new dependencies needed
This feature uses 100% existing infrastructure. No new npm packages.

## Architecture Patterns

### Pattern 1: Inngest sleepUntil for 2pm Colombia

**What:** Schedule a job that sleeps until a specific UTC timestamp, then runs logic.
**When to use:** Exactly this use case -- fire now, execute at 2pm.
**Existing precedent:** `godentist-reminders.ts` line 97: `await step.sleepUntil('wait-until-send-time', new Date(scheduledAt))`

**Calculating 2pm Colombia in UTC:**
```typescript
// Colombia is UTC-5. 2pm Colombia = 7pm UTC (19:00 UTC)
function calculate2pmColombiaUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  // 14:00 Colombia + 5 hours = 19:00 UTC
  return new Date(Date.UTC(y, m - 1, d, 19, 0, 0))
}
```

**IMPORTANT:** Colombia does NOT observe daylight saving time. UTC-5 is constant year-round. No DST edge cases.

### Pattern 2: Check for inbound messages after timestamp

**What:** Query the messages table to see if a conversation received any inbound message after confirmation was sent.
**Key insight:** Conversations have a UNIQUE constraint on `(workspace_id, phone)`, so phone lookup is straightforward.

```typescript
// Step 1: Find conversation by phone
const { data: conv } = await admin
  .from('conversations')
  .select('id')
  .eq('workspace_id', workspaceId)
  .eq('phone', phone)  // phone must be E.164 format: +573001234567
  .single()

// Step 2: Check for inbound messages after sent_at
const { count } = await admin
  .from('messages')
  .select('id', { count: 'exact', head: true })
  .eq('conversation_id', conv.id)
  .eq('direction', 'inbound')
  .gt('timestamp', sentAt)  // sentAt from godentist_scrape_history.sent_at

// count > 0 means patient responded -> skip
// count === 0 means no response -> send ultimatum
```

**Index support:** `idx_messages_direction` on `(conversation_id, direction)` exists. The `timestamp` filter will use sequential scan within conversation, but conversations have few messages so this is fine.

### Pattern 3: Extend sendConfirmations to fire Inngest event

**What:** At the end of `sendConfirmations` (after updating history with send_results), fire the follow-up event.
**Guard:** Only fire if current Colombia time is before 2pm.

```typescript
// At end of sendConfirmations, after saving send_results:
const now = new Date()
const colombiaHour = parseInt(
  now.toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false })
)

if (colombiaHour < 14 && historyId) {
  const followupAt = calculate2pmColombiaUtc(date)
  await (inngest.send as any)({
    name: 'godentist/followup.check',
    data: {
      historyId,
      workspaceId,
      scheduledAt: followupAt.toISOString(),
    },
  })
}
```

### Pattern 4: Template `conservacion_cita` with 2 variables

**Template variables:**
- `{{1}}` = patient name in Title Case (e.g., "Juan Perez")
- `{{2}}` = appointment date/time formatted as "MARTES 17 de marzo a las 2:30 PM"

```typescript
// Format: "MARTES 17 de marzo a las 2:30 PM"
function formatUltimatumDate(dateStr: string, hora: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO']
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${days[date.getDay()]} ${day} de ${months[date.getMonth()]} a las ${hora}`
}

// Template components:
components: [
  {
    type: 'body',
    parameters: [
      { type: 'text', text: toTitleCase(nombre) },
      { type: 'text', text: formatUltimatumDate(fechaCita, hora) },
    ],
  },
]
```

### Pattern 5: Store results in godentist_scrape_history

**Recommendation:** Add `followup_results JSONB` and `followup_sent_at TIMESTAMPTZ` columns to `godentist_scrape_history`.

**Why not a new table:** The follow-up is 1:1 with a scrape history entry. The results are simple (who responded, who got ultimatum). A JSONB column keeps it co-located with the batch data it relates to.

```typescript
interface FollowupResults {
  total: number        // total patients checked
  responded: number    // had inbound messages -> skipped
  sent: number         // ultimatum sent
  failed: number       // send failed
  skipped: number      // cancelled appointments etc
  details: Array<{
    nombre: string
    telefono: string
    status: 'responded' | 'sent' | 'failed' | 'skipped'
    error?: string
  }>
}
```

### Recommended Project Structure (changes only)

```
src/
  app/actions/godentist.ts              # ADD: followup scheduling at end of sendConfirmations
                                        # ADD: getFollowupStatus server action
  inngest/
    events.ts                           # ADD: 'godentist/followup.check' event type
    functions/godentist-reminders.ts    # ADD: godentistFollowupCheck function
  app/api/inngest/route.ts             # Already imports godentistReminderFunctions (auto)
  app/(dashboard)/confirmaciones/
    confirmaciones-panel.tsx            # ADD: followup status display in history detail
supabase/
  migrations/YYYYMMDD_followup_columns.sql  # ADD: followup_results, followup_sent_at columns
```

### Anti-Patterns to Avoid
- **Separate cron job:** Don't use a cron that runs at 2pm daily. Use Inngest sleepUntil triggered per batch -- this is idempotent and tied to specific data.
- **Querying all messages table-wide:** Always scope by conversation_id, never scan all inbound messages.
- **Creating new contacts/conversations in followup:** The contacts and conversations already exist from sendConfirmations. Just look them up by phone.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduled execution | setTimeout/cron | Inngest `step.sleepUntil` | Survives restarts, has retries, already used |
| WhatsApp sending | Direct 360dialog API call | `sendTemplateMessage` domain function | Stores in DB, updates conversation |
| Phone-to-conversation lookup | Custom query | `conversations` table with `(workspace_id, phone)` unique index | Already indexed, E.164 format |
| Timezone math | moment.js or manual offset | Hardcoded UTC-5 (Colombia has no DST) | Simple, no library needed |

## Common Pitfalls

### Pitfall 1: Phone format mismatch
**What goes wrong:** Phone stored as `+573001234567` in conversations, but appointment data has `573001234567` (no plus).
**Why it happens:** `sendConfirmations` normalizes with `+` prefix (line 199), but the raw appointment data doesn't have it.
**How to avoid:** Always normalize phone to E.164 with `+` prefix before querying conversations:
```typescript
const phone = telefono.startsWith('+') ? telefono : `+${telefono}`
```
**Warning signs:** "Conversation not found" errors for patients that definitely received confirmations.

### Pitfall 2: sent_at is null
**What goes wrong:** If `sendConfirmations` completes but the history update fails, `sent_at` could be null.
**How to avoid:** The followup function must check `sent_at` exists before proceeding. If null, skip the batch.

### Pitfall 3: Race condition with Inngest event
**What goes wrong:** The Inngest event fires before `send_results` and `sent_at` are saved to DB.
**Why it happens:** `inngest.send` is async but the history update happens right before it.
**How to avoid:** Fire Inngest event AFTER the history update succeeds. The event includes `historyId` and `scheduledAt`, so the Inngest function reads fresh data at execution time (2pm), not at scheduling time.

### Pitfall 4: Excluded/cancelled patients getting ultimatum
**What goes wrong:** Cancelled appointments have no confirmation sent, so they have no inbound messages, so they'd get the ultimatum.
**How to avoid:** Only check patients whose `send_results.details[].status === 'sent'`. Skip `excluded` and `failed`.

### Pitfall 5: Multiple confirmations in same day
**What goes wrong:** User runs sendConfirmations twice for same day, scheduling two follow-ups.
**How to avoid:** The Inngest function reads the latest `godentist_scrape_history` for that date. Or better: make the Inngest event idempotent by using the `historyId` as the identifier. Each history entry gets exactly one follow-up check.

## Code Examples

### Inngest Function: Follow-Up Check
```typescript
// Source: Based on existing godentist-reminders.ts pattern
const godentistFollowupCheck = inngest.createFunction(
  {
    id: 'godentist-followup-check',
    name: 'GoDentist: Follow-Up Ultimatum Check',
    retries: 3,
  },
  { event: 'godentist/followup.check' },
  async ({ event, step }) => {
    const { historyId, workspaceId, scheduledAt } = event.data

    // Step 1: Sleep until 2pm Colombia
    await step.sleepUntil('wait-until-2pm', new Date(scheduledAt))

    // Step 2: Load history entry and check each patient
    const results = await step.run('check-and-send', async () => {
      const admin = createAdminClient()

      // Load the scrape history
      const { data: history } = await admin
        .from('godentist_scrape_history')
        .select('*')
        .eq('id', historyId)
        .single()

      if (!history || !history.sent_at || !history.send_results) {
        return { skipped: true, reason: 'no send_results or sent_at' }
      }

      const sendResults = history.send_results as unknown as SendResult
      const appointments = history.appointments as unknown as GodentistAppointment[]
      const sentAt = history.sent_at

      // Get workspace API key
      const { data: wsData } = await admin
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()
      const apiKey = (wsData?.settings as any)?.whatsapp_api_key || process.env.WHATSAPP_API_KEY

      const followupResults: FollowupResults = {
        total: 0, responded: 0, sent: 0, failed: 0, skipped: 0, details: []
      }

      // Only process patients who were successfully sent confirmations
      const sentPatients = sendResults.details.filter(d => d.status === 'sent')
      followupResults.total = sentPatients.length

      for (const patient of sentPatients) {
        const phone = patient.telefono.startsWith('+') ? patient.telefono : `+${patient.telefono}`

        // Find conversation
        const { data: conv } = await admin
          .from('conversations')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('phone', phone)
          .single()

        if (!conv) {
          followupResults.skipped++
          followupResults.details.push({
            nombre: patient.nombre, telefono: patient.telefono,
            status: 'skipped', error: 'Conversacion no encontrada'
          })
          continue
        }

        // Check for inbound messages after sent_at
        const { count } = await admin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('direction', 'inbound')
          .gt('timestamp', sentAt)

        if ((count ?? 0) > 0) {
          followupResults.responded++
          followupResults.details.push({
            nombre: patient.nombre, telefono: patient.telefono, status: 'responded'
          })
          continue
        }

        // No response -> send ultimatum
        const apt = appointments.find(a =>
          a.telefono === patient.telefono || `+${a.telefono}` === phone
        )

        // ... send conservacion_cita template ...
      }

      // Save results
      await admin
        .from('godentist_scrape_history')
        .update({
          followup_results: followupResults as unknown as Record<string, unknown>,
          followup_sent_at: new Date().toISOString(),
        })
        .eq('id', historyId)

      return followupResults
    })

    return results
  }
)
```

### Migration: Add followup columns
```sql
ALTER TABLE godentist_scrape_history
  ADD COLUMN followup_results JSONB DEFAULT NULL,
  ADD COLUMN followup_sent_at TIMESTAMPTZ DEFAULT NULL;
```

### Query: Check inbound messages after timestamp
```typescript
// Source: messages table schema + existing index
const { count } = await admin
  .from('messages')
  .select('id', { count: 'exact', head: true })
  .eq('conversation_id', conversationId)
  .eq('direction', 'inbound')
  .gt('timestamp', sentAtTimestamp)
// count === 0 means no response
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Manual follow-up | Automatic Inngest-scheduled | Eliminates manual work, ensures 2pm deadline |
| No tracking | `followup_results` JSONB on history | Full visibility in UI |

## Open Questions

1. **Template `conservacion_cita` exact text**
   - What we know: 2 variables -- {{1}} = name, {{2}} = date+time string
   - What's unclear: The exact template body text (need to verify in 360dialog/Meta console)
   - Recommendation: Use the format specified in requirements. The template must already be approved in Meta.

2. **Should follow-up be automatic or require manual trigger?**
   - Requirements say "automatically schedule" when sendConfirmations runs
   - Recommendation: Automatic by default. Could add a checkbox in UI to opt out, but start with always-on.

3. **What if patient responds with something unrelated?**
   - Current logic: ANY inbound message after sent_at = "responded"
   - This is correct -- even if they send a sticker or unrelated text, it means they're active and shouldn't get the ultimatum

## Sources

### Primary (HIGH confidence)
- `src/inngest/functions/godentist-reminders.ts` - Exact Inngest sleepUntil pattern
- `src/app/actions/godentist.ts` - sendConfirmations flow, phone normalization, history saving
- `src/inngest/events.ts` - GodentistEvents type definitions, AllAgentEvents union
- `src/app/api/inngest/route.ts` - Function registration pattern
- `supabase/migrations/20260311100000_godentist_scrape_history.sql` - Table schema
- `supabase/migrations/20260130000002_whatsapp_conversations.sql` - Conversations/messages schema, indexes
- `src/lib/domain/messages.ts` - sendTemplateMessage signature and behavior
- `src/lib/domain/conversations.ts` - findOrCreateConversation (phone lookup pattern)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All infrastructure already exists in codebase
- Architecture: HIGH - Direct extension of existing godentist-reminders pattern
- Pitfalls: HIGH - Based on actual code inspection (phone formats, null checks, race conditions)
- Template format: MEDIUM - Variable structure specified in requirements, exact body text unverified

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable, internal feature)
