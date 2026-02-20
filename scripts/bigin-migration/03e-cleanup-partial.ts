/**
 * Clean up partial migration data:
 * - Delete all orders with bigin_id in custom_fields (test + partial migration)
 * - Delete all order_products linked to those orders
 * - Delete contacts created by migration (keep original 173)
 * Note: order_products cascade-delete with orders
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  process.env[t.slice(0, eq)] = t.slice(eq + 1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490';

async function main() {
  console.log('=== CLEANUP PARTIAL MIGRATION ===\n');

  // 1. Delete orders with bigin_id (cascade deletes order_products)
  console.log('Deleting orders with bigin_id...');
  let deletedOrders = 0;
  while (true) {
    const { data: batch } = await supabase
      .from('orders')
      .select('id')
      .eq('workspace_id', WS_ID)
      .not('custom_fields->>bigin_id', 'is', null)
      .limit(500);

    if (!batch || batch.length === 0) break;

    const ids = batch.map(o => o.id);
    const { error } = await supabase
      .from('orders')
      .delete()
      .in('id', ids);

    if (error) {
      console.log('  Error:', error.message);
      break;
    }
    deletedOrders += ids.length;
    console.log(`  Deleted ${deletedOrders} orders...`);
  }
  console.log(`  Total orders deleted: ${deletedOrders}`);

  // 2. Delete migration contacts (those with bigin_match_method in custom_fields)
  console.log('\nDeleting migration contacts...');
  let deletedContacts = 0;
  while (true) {
    const { data: batch } = await supabase
      .from('contacts')
      .select('id')
      .eq('workspace_id', WS_ID)
      .not('custom_fields->>bigin_match_method', 'is', null)
      .limit(500);

    if (!batch || batch.length === 0) break;

    const ids = batch.map(c => c.id);
    const { error } = await supabase
      .from('contacts')
      .delete()
      .in('id', ids);

    if (error) {
      console.log('  Error:', error.message);
      break;
    }
    deletedContacts += ids.length;
    console.log(`  Deleted ${deletedContacts} contacts...`);
  }
  console.log(`  Total contacts deleted: ${deletedContacts}`);

  // Verify
  const { count: orderCount } = await supabase
    .from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID);
  const { count: contactCount } = await supabase
    .from('contacts').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID);

  console.log(`\nAfter cleanup: ${contactCount} contacts, ${orderCount} orders`);
  console.log('=== DONE ===');
}

main().catch(console.error);
