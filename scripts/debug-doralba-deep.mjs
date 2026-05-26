// Deep dive: quiénes son los actors, qué automation disparó la duplicación,
// y cuándo se editaron los items de la order logística.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WS = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const STANDARD_ORDER_ID = '9e1bf0ad-322b-437e-97f5-db515caaed46'; // $119.900 sku 002
const LOGISTICA_ORDER_ID = 'a07c53a4-6807-4476-a6f1-c652fb65b38e'; // $169.900 sku 003

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== Users involved ===');
const userIds = ['843a20b2-d784-41ce-bb3f-9372316456f6', '0d07730c-4bf7-405d-95e0-fc256dfeed01'];
for (const uid of userIds) {
  const { data: u } = await supabase.from('users').select('id, email, full_name').eq('id', uid).maybeSingle();
  console.log(uid, '→', JSON.stringify(u));
}

console.log('\n=== Pipeline stages (Standard + Logistica) ===');
const { data: stages } = await supabase
  .from('pipeline_stages')
  .select('id, pipeline_id, name, position, pipelines:pipeline_id(name)')
  .in('pipeline_id', ['a0ebcb1e-d79a-4588-a569-d2bcef23e6b8', 'b1c955ab-1ef9-4b0e-a7e6-e4dec37d9597'])
  .order('position');
console.log(JSON.stringify(stages, null, 2));

console.log('\n=== Automations in Somnio that mention "duplicate" or trigger on order confirmed ===');
const { data: autos } = await supabase
  .from('automations')
  .select('id, name, trigger_type, trigger_config, action_type, action_config, is_active, created_at')
  .eq('workspace_id', WS)
  .or('action_type.eq.duplicate_order_to_pipeline,trigger_type.in.(stage_changed,order_stage_changed)');
console.log(JSON.stringify(autos, null, 2));

console.log('\n=== Automation runs related to STANDARD order ===');
const { data: runs1 } = await supabase
  .from('automation_runs')
  .select('id, automation_id, trigger_event, trigger_data, status, error, started_at, completed_at')
  .eq('workspace_id', WS)
  .gte('started_at', '2026-05-25T00:00:00Z')
  .lte('started_at', '2026-05-26T00:00:00Z')
  .order('started_at');
console.log(JSON.stringify(runs1, null, 2));

console.log('\n=== Look for actions whose entityId is the logistics order ===');
const { data: actLogs, error: actErr } = await supabase
  .from('automation_action_logs')
  .select('*')
  .or(`entity_id.eq.${LOGISTICA_ORDER_ID},entity_id.eq.${STANDARD_ORDER_ID}`);
if (actErr) console.log('(no automation_action_logs:', actErr.message, ')');
else console.log(JSON.stringify(actLogs, null, 2));

console.log('\n=== order.updated_at vs order_products.created_at for logistica order ===');
const { data: ord } = await supabase
  .from('orders')
  .select('id, created_at, updated_at, total_value, source_order_id, name, description, custom_fields')
  .eq('id', LOGISTICA_ORDER_ID).single();
console.log('order:', JSON.stringify(ord, null, 2));
const { data: prods } = await supabase
  .from('order_products')
  .select('*')
  .eq('order_id', LOGISTICA_ORDER_ID);
console.log('order_products:', JSON.stringify(prods, null, 2));

console.log('\n=== All audit_events that reference the logistica order (if exists) ===');
const { data: audit, error: auditErr } = await supabase
  .from('audit_events')
  .select('*')
  .or(`entity_id.eq.${LOGISTICA_ORDER_ID},data->>order_id.eq.${LOGISTICA_ORDER_ID}`)
  .limit(50);
if (auditErr) console.log('(no audit_events:', auditErr.message, ')');
else console.log(JSON.stringify(audit, null, 2));
