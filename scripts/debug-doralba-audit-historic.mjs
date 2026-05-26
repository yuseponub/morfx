// Auditoría retroactiva: buscar TODAS las ejecuciones de la automation
// "Tag C confirmado" en los últimos 60 días y comparar source vs duplicado.
// Si hay un patrón de mismatch, el bug es sistémico.
// Si solo Doralba: es operacional (Sergio editó).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WS = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const TAG_C_AUTOMATION_ID = '0683baa0-30d3-49ec-83fa-d3e112bd6416';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== Last 60 days of "Tag C confirmado" executions ===');
const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
const { data: execs } = await supabase
  .from('automation_executions')
  .select('id, status, started_at, actions_log, error_message, duration_ms')
  .eq('workspace_id', WS)
  .eq('automation_id', TAG_C_AUTOMATION_ID)
  .gte('started_at', since)
  .order('started_at', { ascending: false });

console.log(`Found ${execs?.length ?? 0} executions in last 60d`);

const rows = [];
for (const e of execs || []) {
  // extract new + source order ids from actions_log
  const dupAction = (e.actions_log || []).find(a => a.type === 'duplicate_order');
  if (!dupAction || dupAction.status !== 'success') {
    rows.push({ exec: e.id, status: e.status, action_status: dupAction?.status, error: e.error_message, started: e.started_at });
    continue;
  }
  const newOrderId = dupAction.result?.newOrderId;
  const sourceOrderId = dupAction.result?.sourceOrderId;
  if (!newOrderId || !sourceOrderId) continue;

  // Get both orders' totals + product counts
  const { data: pair } = await supabase
    .from('orders')
    .select('id, total_value, archived_at, contact_id, contacts:contact_id(name, phone), order_products:order_products(sku, title, quantity, unit_price)')
    .in('id', [newOrderId, sourceOrderId]);
  const src = (pair || []).find(o => o.id === sourceOrderId);
  const dst = (pair || []).find(o => o.id === newOrderId);

  const srcSum = (src?.order_products || []).map(p => `${p.quantity}×${p.sku}@${p.unit_price}`).join(',');
  const dstSum = (dst?.order_products || []).map(p => `${p.quantity}×${p.sku}@${p.unit_price}`).join(',');
  const mismatch = src?.total_value !== dst?.total_value || srcSum !== dstSum;

  rows.push({
    exec: e.id,
    started: e.started_at,
    contact: src?.contacts?.name,
    phone: src?.contacts?.phone,
    src_total: src?.total_value,
    dst_total: dst?.total_value,
    src_items: srcSum || '(empty)',
    dst_items: dstSum || '(empty)',
    mismatch,
    src_archived: !!src?.archived_at,
    dst_archived: !!dst?.archived_at,
  });
}

const mismatches = rows.filter(r => r.mismatch);
console.log(`\nMismatches: ${mismatches.length} of ${rows.length}`);
console.table(rows.slice(0, 25));

console.log('\n=== Only mismatches ===');
console.log(JSON.stringify(mismatches, null, 2));
