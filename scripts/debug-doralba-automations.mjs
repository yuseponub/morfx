// Buscar las automations que disparan al CONFIRMAR (stage_changed → CONFIRMADO en Standard)
// y las executions del 25-may relacionadas con las orders de Doralba.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WS = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const STD = '9e1bf0ad-322b-437e-97f5-db515caaed46';
const LOG = 'a07c53a4-6807-4476-a6f1-c652fb65b38e';
const CONFIRMADO_STAGE = '4770a36e-5feb-4eec-a71c-75d54cb2797c';
const ORDEN_CONFIRMADA_STAGE = 'fbbc5228-d3b8-4c6c-a359-a18541cb0cdb';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== All automations in Somnio workspace ===');
const { data: autos } = await supabase
  .from('automations')
  .select('id, name, trigger_type, trigger_config, conditions, actions, is_enabled, created_by, created_at')
  .eq('workspace_id', WS)
  .order('created_at');

for (const a of autos || []) {
  // Only show those that could match the confirmation
  const actionStr = JSON.stringify(a.actions);
  const trigStr = JSON.stringify(a.trigger_config);
  const matches =
    actionStr.includes('duplicate_order') ||
    a.trigger_type === 'order.stage_changed' ||
    trigStr.includes(CONFIRMADO_STAGE) ||
    a.name.toLowerCase().includes('confirma') ||
    a.name.toLowerCase().includes('logistic') ||
    a.name.toLowerCase().includes('duplica');
  if (matches) {
    console.log('---');
    console.log(`[${a.is_enabled ? 'ON' : 'OFF'}] ${a.name} (${a.id})`);
    console.log('  trigger:', a.trigger_type, JSON.stringify(a.trigger_config));
    console.log('  actions:', JSON.stringify(a.actions, null, 2));
  }
}

console.log('\n=== Automation executions on 2026-05-25 in Somnio ===');
const { data: execs } = await supabase
  .from('automation_executions')
  .select('id, automation_id, trigger_event, status, actions_log, started_at, completed_at, duration_ms, cascade_depth, error_message')
  .eq('workspace_id', WS)
  .gte('started_at', '2026-05-25T00:00:00Z')
  .lte('started_at', '2026-05-26T00:00:00Z')
  .order('started_at');

console.log(`Found ${execs?.length ?? 0} executions on 25-may`);

const relevant = (execs || []).filter(e => {
  const s = JSON.stringify(e.trigger_event) + JSON.stringify(e.actions_log);
  return s.includes(STD) || s.includes(LOG) || s.includes('74caaef3-1753-4ee7-af5b-5a9276ae5111');
});

console.log(`\nRelevant to Doralba: ${relevant.length}`);
for (const e of relevant) {
  console.log('---');
  console.log(`exec ${e.id} @ ${e.started_at} (${e.status}, cascade=${e.cascade_depth})`);
  console.log('  automation_id:', e.automation_id);
  console.log('  trigger_event:', JSON.stringify(e.trigger_event, null, 2));
  console.log('  actions_log:', JSON.stringify(e.actions_log, null, 2));
}

console.log('\n=== Look in mutation_audit for the logistica order ===');
const { data: mut, error: mutErr } = await supabase
  .from('mutation_audit')
  .select('*')
  .or(`entity_id.eq.${LOG},entity_id.eq.${STD}`)
  .order('created_at');
if (mutErr) console.log('(mutation_audit err:', mutErr.message, ')');
else console.log(JSON.stringify(mut, null, 2));

console.log('\n=== Look up actor users in auth.users ===');
for (const uid of ['843a20b2-d784-41ce-bb3f-9372316456f6', '0d07730c-4bf7-405d-95e0-fc256dfeed01']) {
  const { data: u, error: e } = await supabase.auth.admin.getUserById(uid);
  console.log(uid, '→', e ? e.message : JSON.stringify({ email: u.user?.email, raw_user_meta_data: u.user?.user_metadata }));
}
