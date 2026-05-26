// Confirmar que el INSERT silencioso PUEDE fallar y que el código no lo detecta.
// Prueba 3 modos de fallo: FK violation, NOT NULL violation, CHECK violation
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WS = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const LOGISTICA = 'b1c955ab-1ef9-4b0e-a7e6-e4dec37d9597';
const ORDEN_CONFIRMADA = 'fbbc5228-d3b8-4c6c-a359-a18541cb0cdb';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCase(name, build) {
  console.log(`\n=== ${name} ===`);
  // 1. Create test order
  const { data: ord, error: ce } = await supabase.from('orders').insert({
    workspace_id: WS,
    pipeline_id: LOGISTICA,
    stage_id: ORDEN_CONFIRMADA,
    name: `[DEBUG] silent-fail ${name}`,
    description: 'TEST',
  }).select('id').single();
  if (ce) { console.log('order create err:', ce); return; }

  // 2. Run insert WITHOUT error check (mimics duplicateOrder line 959)
  const toInsert = build(ord.id);
  console.log('inserting:', JSON.stringify(toInsert));
  const res = await supabase.from('order_products').insert(toInsert);
  console.log('result.error:', res.error?.code, '/', res.error?.message);
  console.log('result.status:', res.status);

  // 3. Check what landed
  const { data: rows } = await supabase.from('order_products').select('*').eq('order_id', ord.id);
  console.log('rows after insert:', rows?.length);

  // 4. Cleanup
  await supabase.from('order_products').delete().eq('order_id', ord.id);
  await supabase.from('orders').delete().eq('id', ord.id);
}

// Case 1: FK violation - product_id that doesn't exist
await testCase('FK violation (random product_id)', (orderId) => [{
  order_id: orderId,
  product_id: '00000000-0000-0000-0000-000000000001',
  sku: '999',
  title: 'TEST',
  unit_price: 100,
  quantity: 1,
}]);

// Case 2: CHECK violation - quantity = 0
await testCase('CHECK quantity > 0', (orderId) => [{
  order_id: orderId,
  product_id: null,
  sku: '999',
  title: 'TEST',
  unit_price: 100,
  quantity: 0,
}]);

// Case 3: NOT NULL violation - sku missing
await testCase('NOT NULL sku', (orderId) => [{
  order_id: orderId,
  product_id: null,
  title: 'TEST',
  unit_price: 100,
  quantity: 1,
}]);

// Case 4: order_id doesn't exist (FK fail) — mimics race where order was deleted
await testCase('FK order_id missing', () => [{
  order_id: '00000000-0000-0000-0000-000000000099',
  product_id: null,
  sku: '999',
  title: 'TEST',
  unit_price: 100,
  quantity: 1,
}]);

// Case 5: Valid product_id from Somnio catalog
console.log('\n=== Listing some Somnio products for comparison ===');
const { data: prods } = await supabase
  .from('products')
  .select('id, sku, title, price, is_active')
  .eq('workspace_id', WS)
  .order('sku')
  .limit(10);
console.log(JSON.stringify(prods, null, 2));
