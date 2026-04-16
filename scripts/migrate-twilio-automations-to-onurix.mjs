// scripts/migrate-twilio-automations-to-onurix.mjs
// Run: node --env-file=.env.local scripts/migrate-twilio-automations-to-onurix.mjs [--apply]
// Source: scripts/test-onurix-domain.mjs pattern
// Dry-run by default. Pass --apply to write changes to Supabase.
// Idempotent: re-running after --apply leaves state unchanged.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const WORKSPACE_SOMNIO = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const TARGET_IDS = [
  'f77bff5b-eef8-4c12-a5a7-4a4127837575',  // GUIA TRANSPORTADORA
  '24005a44-d97e-406e-bdac-f74dbb2b5786',  // Inter
  '71c4f524-2c8b-4350-a96d-bbc8a258b6ff',  // template final ultima
  'c24cde89-2f91-493c-8d5b-7cd7610490e8',  // REPARTO
]

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const { data: before, error: readErr } = await supabase
  .from('automations')
  .select('id, name, actions, workspace_id')
  .eq('workspace_id', WORKSPACE_SOMNIO)
  .in('id', TARGET_IDS)

if (readErr) {
  console.error('Read error:', readErr)
  process.exit(1)
}

console.log(`Found ${before.length} automations in Somnio (expected 4)`)
if (before.length !== 4) {
  console.error(`ABORT: Expected 4 automations, got ${before.length}. Review TARGET_IDS.`)
  process.exit(1)
}

const changes = []
for (const auto of before) {
  const newActions = auto.actions.map((a) => {
    if (a.type === 'send_sms' || a.type === 'send_sms_onurix') {
      return { ...a, type: 'send_sms' }
    }
    return a
  })
  const changed = JSON.stringify(newActions) !== JSON.stringify(auto.actions)
  if (changed) {
    changes.push({ id: auto.id, name: auto.name, oldActions: auto.actions, newActions })
  }
}

console.log(`\nDiff: ${changes.length} automations will be modified.`)
for (const c of changes) {
  const oldTypes = c.oldActions.map(a => a.type).join(', ')
  const newTypes = c.newActions.map(a => a.type).join(', ')
  console.log(`  ${c.id} (${c.name}): [${oldTypes}] -> [${newTypes}]`)
}

if (!APPLY) {
  console.log('\nDRY RUN -- pass --apply to write changes.')
  process.exit(0)
}

for (const c of changes) {
  const { error } = await supabase
    .from('automations')
    .update({ actions: c.newActions })
    .eq('id', c.id)
    .eq('workspace_id', WORKSPACE_SOMNIO)  // Regla 3 -- workspace filter always

  if (error) {
    console.error(`FAILED ${c.id}:`, error)
    process.exit(1)
  }
  console.log(`  ok Updated ${c.id}`)
}

console.log('\n[ok] Migration complete. Re-run (without --apply) to verify idempotency (expect "Diff: 0").')
