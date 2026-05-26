// Reproducción del INSERT que falló silenciosamente en duplicateOrder
// Plan:
//   1. Verificar que el product_id del source EXISTE en products
//   2. Crear una order de prueba en Logistica (clon de la real)
//   3. Insertar exactamente lo que duplicateOrder construyó
//   4. Si funciona: el bug es timing/state-dependent
//   5. Si falla: tenemos el error exacto
//   6. Limpiar la order de prueba
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WS = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const STD = '9e1bf0ad-322b-437e-97f5-db515caaed46';
const LOGISTICA_PIPELINE = 'b1c955ab-1ef9-4b0e-a7e6-e4dec37d9597';
const ORDEN_CONFIRMADA_STAGE = 'fbbc5228-d3b8-4c6c-a359-a18541cb0cdb';
const CONTACT = '74caaef3-1753-4ee7-af5b-5a9276ae5111';
const SOURCE_PRODUCT_ID = 'c24407ea-94eb-49ea-b96c-f6d15fb07bb7';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== STEP 1: Verify source product_id exists in products table ===');
const { data: product, error: prodErr } = await supabase
  .from('products')
  .select('id, workspace_id, sku, title, price, is_active, archived_at, created_at, updated_at')
  .eq('id', SOURCE_PRODUCT_ID)
  .maybeSingle();
console.log(prodErr ? `ERROR: ${prodErr.message}` : JSON.stringify(product, null, 2));

console.log('\n=== STEP 2: Pull EXACT source order + products as duplicateOrder does ===');
const { data: sourceOrder, error: srcErr } = await supabase
  .from('orders')
  .select('*, order_products:order_products(*)')
  .eq('id', STD)
  .eq('workspace_id', WS)
  .single();
console.log('sourceOrder.order_products:', JSON.stringify(sourceOrder?.order_products, null, 2));

console.log('\n=== STEP 3: Create test order (same shape as the real duplicate did) ===');
const { data: testOrder, error: createErr } = await supabase
  .from('orders')
  .insert({
    workspace_id: WS,
    contact_id: CONTACT,
    pipeline_id: LOGISTICA_PIPELINE,
    stage_id: ORDEN_CONFIRMADA_STAGE,
    source_order_id: STD,
    name: '[DEBUG] reproduce-doralba',
    description: 'TEST - delete me',
    shipping_address: sourceOrder.shipping_address,
    shipping_city: sourceOrder.shipping_city,
    shipping_department: sourceOrder.shipping_department,
    carrier: sourceOrder.carrier,
    tracking_number: sourceOrder.tracking_number,
    custom_fields: sourceOrder.custom_fields || {},
  })
  .select('id, total_value, created_at')
  .single();
console.log('createErr:', createErr);
console.log('testOrder:', JSON.stringify(testOrder, null, 2));

if (!testOrder) {
  console.error('Cannot continue without test order');
  process.exit(1);
}

console.log('\n=== STEP 4: Insert order_products EXACTLY as duplicateOrder builds them ===');
const sourceProducts = sourceOrder.order_products;
const productsToInsert = sourceProducts.map((p) => ({
  order_id: testOrder.id,
  product_id: p.product_id || null,
  sku: p.sku,
  title: p.title,
  unit_price: p.unit_price,
  quantity: p.quantity,
}));
console.log('about to insert:', JSON.stringify(productsToInsert, null, 2));

const insertResult = await supabase.from('order_products').insert(productsToInsert);
console.log('insert result.error:', insertResult.error);
console.log('insert result.status:', insertResult.status);
console.log('insert result.statusText:', insertResult.statusText);
console.log('insert result.data:', insertResult.data);
console.log('insert result.count:', insertResult.count);

console.log('\n=== STEP 5: Read back inserted products + check order total ===');
const { data: insertedProducts } = await supabase
  .from('order_products')
  .select('*')
  .eq('order_id', testOrder.id);
console.log('inserted products:', JSON.stringify(insertedProducts, null, 2));

const { data: updatedOrder } = await supabase
  .from('orders')
  .select('id, total_value, updated_at')
  .eq('id', testOrder.id)
  .single();
console.log('order after insert:', JSON.stringify(updatedOrder, null, 2));

console.log('\n=== STEP 6: Cleanup ===');
await supabase.from('order_products').delete().eq('order_id', testOrder.id);
const delRes = await supabase.from('orders').delete().eq('id', testOrder.id);
console.log('order delete err:', delRes.error);

console.log('\n=== STEP 7: Inspect any extra triggers on order_products via pg_trigger ===');
const { data: triggers, error: trErr } = await supabase.rpc('pg_meta_triggers').catch(() => ({ data: null, error: 'rpc not available' }));
if (trErr) console.log('(no rpc pg_meta_triggers — skipping)');
else console.log(triggers);
