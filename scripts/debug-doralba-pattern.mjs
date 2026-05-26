// Analizar patrones entre los 52 mismatches:
//  - ¿Race condition? (medir delta entre order_products.created_at del source vs automation.started_at)
//  - ¿Fechas concentradas? (puede indicar deploy con bug)
//  - ¿Source sin SKU? (problema upstream que el operador "arregla" en dst)
//  - ¿Algún error_message en la execution?
//  - Sample uno y replicar EXACTAMENTE su INSERT para ver si falla
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WS = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const TAG_C = '0683baa0-30d3-49ec-83fa-d3e112bd6416';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
const { data: execs } = await supabase
  .from('automation_executions')
  .select('id, started_at, actions_log, error_message, duration_ms')
  .eq('workspace_id', WS)
  .eq('automation_id', TAG_C)
  .gte('started_at', since)
  .order('started_at');

console.log(`Total executions: ${execs?.length ?? 0}`);

const cases = [];
for (const e of execs || []) {
  const dup = (e.actions_log || []).find(a => a.type === 'duplicate_order');
  if (!dup || dup.status !== 'success') continue;
  const newId = dup.result?.newOrderId;
  const srcId = dup.result?.sourceOrderId;
  if (!newId || !srcId) continue;

  const [{ data: srcProds }, { data: dstProds }, { data: srcOrder }] = await Promise.all([
    supabase.from('order_products').select('id, sku, title, unit_price, quantity, subtotal, created_at').eq('order_id', srcId).order('created_at'),
    supabase.from('order_products').select('id, sku, title, unit_price, quantity, created_at').eq('order_id', newId).order('created_at'),
    supabase.from('orders').select('id, created_at').eq('id', srcId).single(),
  ]);

  const dstEmpty = !dstProds || dstProds.length === 0;
  if (!dstEmpty && srcProds?.length === dstProds.length) {
    const same = srcProds.every((sp, i) => sp.sku === dstProds[i].sku && Number(sp.unit_price) === Number(dstProds[i].unit_price) && sp.quantity === dstProds[i].quantity);
    if (same) continue; // matches exactly, skip
  }

  // src product earliest creation
  const earliestSrcProd = srcProds?.[0]?.created_at;
  const automationStarted = e.started_at;
  // Delta between when source product existed and automation ran
  const deltaMs = earliestSrcProd ? new Date(automationStarted).getTime() - new Date(earliestSrcProd).getTime() : null;

  cases.push({
    execId: e.id,
    started: e.started_at,
    duration_ms: e.duration_ms,
    error: e.error_message,
    srcId,
    newId,
    srcProductCount: srcProds?.length ?? 0,
    dstProductCount: dstProds?.length ?? 0,
    srcEarliestProd: earliestSrcProd,
    deltaMsFromProductToAutomation: deltaMs,
    srcHasEmptySku: srcProds?.some(p => !p.sku || p.sku.trim() === ''),
    srcOrderCreatedAt: srcOrder?.created_at,
  });
}

const empties = cases.filter(c => c.dstProductCount === 0);
const edited = cases.filter(c => c.dstProductCount > 0);

console.log(`\nEmpty destinations: ${empties.length}`);
console.log(`Edited destinations: ${edited.length}`);

console.log('\n=== Time distribution of empty cases (per month) ===');
const monthBuckets = {};
for (const c of empties) {
  const m = c.started.substring(0, 7);
  monthBuckets[m] = (monthBuckets[m] || 0) + 1;
}
console.log(JSON.stringify(monthBuckets, null, 2));

console.log('\n=== Delta source-product-creation → automation-start (ms) for empty cases ===');
const deltas = empties.map(c => c.deltaMsFromProductToAutomation).filter(d => d != null).sort((a,b) => a-b);
console.log('count:', deltas.length, 'min:', deltas[0], 'p50:', deltas[Math.floor(deltas.length/2)], 'p95:', deltas[Math.floor(deltas.length*0.95)], 'max:', deltas[deltas.length-1]);
console.log('first 10:', deltas.slice(0,10));
console.log('last 10:', deltas.slice(-10));

console.log('\n=== Empty cases with source SKU empty? ===');
console.log('empties with srcHasEmptySku=true:', empties.filter(c => c.srcHasEmptySku).length);
console.log('empties with srcHasEmptySku=false:', empties.filter(c => c.srcHasEmptySku === false).length);

console.log('\n=== duration_ms distribution for empty cases ===');
const durs = empties.map(c => c.duration_ms).filter(d => d != null).sort((a,b) => a-b);
console.log('count:', durs.length, 'min:', durs[0], 'p50:', durs[Math.floor(durs.length/2)], 'p95:', durs[Math.floor(durs.length*0.95)], 'max:', durs[durs.length-1]);

console.log('\n=== Empty cases with error_message ===');
console.log(empties.filter(c => c.error).map(c => ({ exec: c.execId, error: c.error })));

console.log('\n=== Full empty-case dump (last 5) for visual inspection ===');
console.log(JSON.stringify(empties.slice(-5), null, 2));

// Now try to REPRODUCE one case: pick the most recent empty case,
// and run the SAME insert that should have happened
console.log('\n=== REPRODUCE most recent empty case ===');
const target = empties[empties.length - 1];
if (target) {
  console.log('targeting exec', target.execId, 'src', target.srcId);
  const { data: src } = await supabase
    .from('orders')
    .select('*, order_products:order_products(*)')
    .eq('id', target.srcId)
    .single();
  console.log('source has', src?.order_products?.length, 'products');

  // simulate exact duplicate order on a sandbox
  const { data: testOrder, error: createErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: WS,
      contact_id: src.contact_id,
      pipeline_id: 'b1c955ab-1ef9-4b0e-a7e6-e4dec37d9597',
      stage_id: 'fbbc5228-d3b8-4c6c-a359-a18541cb0cdb',
      source_order_id: target.srcId,
      name: '[DEBUG] reproduce-empty-case',
      description: 'TEST - delete me',
    })
    .select('id')
    .single();
  if (createErr) { console.log('createErr:', createErr); }
  else {
    const productsToInsert = src.order_products.map(p => ({
      order_id: testOrder.id,
      product_id: p.product_id || null,
      sku: p.sku,
      title: p.title,
      unit_price: p.unit_price,
      quantity: p.quantity,
    }));
    console.log('inserting:', JSON.stringify(productsToInsert, null, 2));
    const ins = await supabase.from('order_products').insert(productsToInsert);
    console.log('insert error:', ins.error, 'status:', ins.status);
    // cleanup
    await supabase.from('order_products').delete().eq('order_id', testOrder.id);
    await supabase.from('orders').delete().eq('id', testOrder.id);
  }
}
