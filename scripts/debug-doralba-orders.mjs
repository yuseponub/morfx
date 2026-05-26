// Debug: encontrar todas las orders de Doralba Echavarria en workspace Somnio
// y rastrear el origen de la order $169,900 en pipeline Logística

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const PHONE_RAW = '3202218230';
const PHONE_INTL = '573202218230';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== STEP 1: Contact lookup ===');
const { data: contacts } = await supabase
  .from('contacts')
  .select('id, name, phone, email, workspace_id, created_at, archived_at')
  .eq('workspace_id', SOMNIO_WORKSPACE_ID)
  .or(`phone.eq.${PHONE_RAW},phone.eq.+${PHONE_INTL},phone.eq.${PHONE_INTL}`);

console.log(JSON.stringify(contacts, null, 2));
if (!contacts?.length) {
  console.error('No contact found');
  process.exit(1);
}

const contactIds = contacts.map(c => c.id);

console.log('\n=== STEP 2: All orders for this contact ===');
const { data: orders, error: ordersErr } = await supabase
  .from('orders')
  .select(`
    id, contact_id, pipeline_id, stage_id, total_value,
    shipping_address, shipping_city,
    carrier, tracking_number, linked_order_id, source_order_id,
    custom_fields,
    created_at, updated_at, archived_at,
    pipelines:pipeline_id ( id, name ),
    stages:stage_id ( id, name )
  `)
  .in('contact_id', contactIds)
  .order('created_at', { ascending: false });

if (ordersErr) {
  console.error('orders error:', ordersErr);
}
console.log(JSON.stringify(orders, null, 2));

console.log('\n=== STEP 3: Items per order ===');
for (const o of orders || []) {
  const { data: items } = await supabase
    .from('order_products')
    .select('id, product_id, sku, title, unit_price, quantity, subtotal, created_at')
    .eq('order_id', o.id);
  console.log(`Order ${o.id} — pipeline=${o.pipelines?.name} stage=${o.stages?.name} total=${o.total_value}`);
  console.log(JSON.stringify(items, null, 2));
}

console.log('\n=== STEP 4: Order notes / audit ===');
for (const o of orders || []) {
  const { data: notes } = await supabase
    .from('order_notes')
    .select('id, body, created_at, created_by, source')
    .eq('order_id', o.id)
    .order('created_at', { ascending: true });
  if (notes?.length) {
    console.log(`Notes for order ${o.id}:`);
    console.log(JSON.stringify(notes, null, 2));
  }
}

console.log('\n=== STEP 5: Order stage history ===');
for (const o of orders || []) {
  const { data: hist, error: histErr } = await supabase
    .from('order_stage_history')
    .select('id, previous_stage_id, new_stage_id, source, actor_id, actor_label, cascade_depth, trigger_event, changed_at, metadata')
    .eq('order_id', o.id)
    .order('changed_at', { ascending: true });
  if (histErr) {
    console.log(`(order_stage_history error: ${histErr.message})`);
    break;
  }
  if (hist?.length) {
    console.log(`Stage history for order ${o.id}:`);
    console.log(JSON.stringify(hist, null, 2));
  }
}

console.log('\n=== STEP 6: Pipelines in workspace ===');
const { data: pipelines } = await supabase
  .from('pipelines')
  .select('id, name, type, default_pipeline')
  .eq('workspace_id', SOMNIO_WORKSPACE_ID);
console.log(JSON.stringify(pipelines, null, 2));
