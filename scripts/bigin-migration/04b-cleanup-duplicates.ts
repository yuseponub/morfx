/**
 * Post-Audit Cleanup: Remove duplicate bigin_id orders from Ventas pipeline
 *
 * Root cause: 1,959 ventas from `unmatched.ventasSinLogistica` were ALSO present
 * as the `venta` field inside `order-groups.json`. The upload script inserted them twice.
 *
 * Strategy:
 * - For each duplicate bigin_id pair: KEEP the one WITH order_products, DELETE the other
 * - If both have products: KEEP the older one (first inserted)
 * - If neither has products: KEEP the older one, DELETE the newer
 *
 * Safety:
 * - DRY-RUN by default. Pass --execute to actually delete.
 * - NEVER touches orders without bigin_id (the 85 real Somnio orders)
 * - NEVER touches Logística or Envíos (0 duplicates there)
 * - Checks source_order_id references before deleting (logísticas pointing to duplicate)
 * - Saves full log to data/upload-log/cleanup-audit.json
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// --- Load env ---
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
const PIPELINE_VENTAS = 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8';

const EXECUTE = process.argv.includes('--execute');
const BATCH = 200;

async function fetchAllVentas() {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, name, contact_id, created_at, custom_fields, source_order_id, stage_id')
      .eq('workspace_id', WS_ID)
      .eq('pipeline_id', PIPELINE_VENTAS)
      .not('custom_fields->>bigin_id', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (error) { console.error(`Fetch error at offset ${offset}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }
  return all;
}

async function main() {
  console.log(`=== POST-AUDIT CLEANUP ${EXECUTE ? '(EXECUTE MODE)' : '(DRY-RUN)'} ===\n`);

  // Step 1: Fetch all Ventas with bigin_id
  console.log('Fetching all Ventas orders with bigin_id...');
  const orders = await fetchAllVentas();
  console.log(`  Total: ${orders.length}`);

  // Step 2: Find duplicates
  const biginIdMap = new Map<string, any[]>();
  for (const o of orders) {
    const bid = o.custom_fields?.bigin_id;
    if (!bid) continue;
    if (!biginIdMap.has(bid)) biginIdMap.set(bid, []);
    biginIdMap.get(bid)!.push(o);
  }

  const duplicates = [...biginIdMap.entries()].filter(([_, arr]) => arr.length > 1);
  console.log(`  Duplicate bigin_ids: ${duplicates.length}`);
  console.log(`  Total duplicate orders: ${duplicates.reduce((s, [_, a]) => s + a.length, 0)}`);

  if (duplicates.length === 0) {
    console.log('\nNo duplicates found. Nothing to clean up.');
    return;
  }

  // Step 3: Check which have order_products
  const allDupIds = duplicates.flatMap(([_, arr]) => arr.map(o => o.id));
  console.log(`\nChecking order_products for ${allDupIds.length} orders...`);
  const withProducts = new Set<string>();
  for (let i = 0; i < allDupIds.length; i += 500) {
    const batch = allDupIds.slice(i, i + 500);
    const { data } = await supabase.from('order_products').select('order_id').in('order_id', batch);
    if (data) for (const d of data) withProducts.add(d.order_id);
  }
  console.log(`  ${withProducts.size} have order_products`);

  // Step 4: Check which are referenced by source_order_id (logísticas pointing to them)
  console.log('Checking source_order_id references...');
  const referencedByChildren = new Set<string>();
  for (let i = 0; i < allDupIds.length; i += 500) {
    const batch = allDupIds.slice(i, i + 500);
    const { data } = await supabase
      .from('orders')
      .select('source_order_id')
      .in('source_order_id', batch);
    if (data) for (const d of data) referencedByChildren.add(d.source_order_id);
  }
  console.log(`  ${referencedByChildren.size} are referenced by child orders (source_order_id)`);

  // Step 5: Decide which to keep and which to delete
  const toDelete: string[] = [];
  const toKeep: string[] = [];
  const decisions: any[] = [];

  for (const [biginId, arr] of duplicates) {
    // Sort by: has_products DESC, has_children DESC, created_at ASC
    arr.sort((a: any, b: any) => {
      const aProducts = withProducts.has(a.id) ? 1 : 0;
      const bProducts = withProducts.has(b.id) ? 1 : 0;
      if (aProducts !== bProducts) return bProducts - aProducts; // products first

      const aChildren = referencedByChildren.has(a.id) ? 1 : 0;
      const bChildren = referencedByChildren.has(b.id) ? 1 : 0;
      if (aChildren !== bChildren) return bChildren - aChildren; // children first

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // older first
    });

    const keep = arr[0];
    const deletes = arr.slice(1);

    toKeep.push(keep.id);
    for (const d of deletes) toDelete.push(d.id);

    decisions.push({
      bigin_id: biginId,
      keep: { id: keep.id, has_products: withProducts.has(keep.id), has_children: referencedByChildren.has(keep.id) },
      delete: deletes.map((d: any) => ({
        id: d.id, has_products: withProducts.has(d.id), has_children: referencedByChildren.has(d.id),
      })),
    });
  }

  console.log(`\n=== DECISION SUMMARY ===`);
  console.log(`  Keep: ${toKeep.length}`);
  console.log(`  Delete: ${toDelete.length}`);

  // Safety check: are any to-delete orders referenced by children?
  const deleteReferencedByChildren = toDelete.filter(id => referencedByChildren.has(id));
  if (deleteReferencedByChildren.length > 0) {
    console.log(`\n⚠ WARNING: ${deleteReferencedByChildren.length} orders to delete are referenced by child orders!`);
    console.log('  These need source_order_id re-pointing before deletion.');
    // For each, find the "keep" sibling and re-point
    const repoints: { childId: string; oldParent: string; newParent: string }[] = [];
    for (const delId of deleteReferencedByChildren) {
      // Find the bigin_id for this order
      const order = orders.find(o => o.id === delId);
      if (!order) continue;
      const biginId = order.custom_fields?.bigin_id;
      const decision = decisions.find(d => d.bigin_id === biginId);
      if (!decision) continue;

      // Find children pointing to this order
      const { data: children } = await supabase
        .from('orders')
        .select('id')
        .eq('source_order_id', delId);
      if (children) {
        for (const child of children) {
          repoints.push({ childId: child.id, oldParent: delId, newParent: decision.keep.id });
        }
      }
    }
    console.log(`  Need to re-point ${repoints.length} child orders`);

    if (EXECUTE && repoints.length > 0) {
      console.log('  Re-pointing...');
      for (const rp of repoints) {
        const { error } = await supabase
          .from('orders')
          .update({ source_order_id: rp.newParent })
          .eq('id', rp.childId);
        if (error) console.log(`    ERROR: ${rp.childId} → ${error.message}`);
        else console.log(`    ${rp.childId}: ${rp.oldParent} → ${rp.newParent}`);
      }
    }
  }

  // Safety check: any to-delete orders have products?
  const deleteWithProducts = toDelete.filter(id => withProducts.has(id));
  if (deleteWithProducts.length > 0) {
    console.log(`\n⚠ WARNING: ${deleteWithProducts.length} orders to delete have order_products!`);
    console.log('  These products will be cascade-deleted. Verify the "keep" sibling also has products.');
  }

  // Step 6: Execute or dry-run
  if (!EXECUTE) {
    console.log('\n--- DRY-RUN: No changes made ---');
    console.log(`Run with --execute to delete ${toDelete.length} orders.`);
  } else {
    console.log(`\n--- EXECUTING: Deleting ${toDelete.length} orders ---`);

    // Delete order_products first for the to-delete orders (cascade should handle this, but be safe)
    let deletedOrders = 0;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      const { error } = await supabase
        .from('orders')
        .delete()
        .in('id', batch);

      if (error) {
        console.log(`  Batch ${i} error: ${error.message} — retrying individually...`);
        for (const id of batch) {
          const { error: e } = await supabase.from('orders').delete().eq('id', id);
          if (e) console.log(`    ERROR deleting ${id}: ${e.message}`);
          else deletedOrders++;
        }
      } else {
        deletedOrders += batch.length;
      }
      if (i % 1000 === 0) console.log(`  ${Math.min(i + batch.length, toDelete.length)}/${toDelete.length}`);
    }
    console.log(`  Deleted: ${deletedOrders}`);

    // Verify final count
    const { count: finalVentas } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', WS_ID)
      .eq('pipeline_id', PIPELINE_VENTAS);
    const { count: finalTotal } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', WS_ID);
    const { count: finalProducts } = await supabase
      .from('order_products')
      .select('*', { count: 'exact', head: true });

    console.log(`\n=== POST-CLEANUP VERIFICATION ===`);
    console.log(`  Ventas: ${finalVentas} (was ${orders.length + 85}, deleted ${deletedOrders})`);
    console.log(`  Total órdenes: ${finalTotal}`);
    console.log(`  Products: ${finalProducts}`);

    // Check no duplicate bigin_ids remain
    const remaining = await fetchAllVentas();
    const remainBiginMap = new Map<string, number>();
    for (const o of remaining) {
      const bid = o.custom_fields?.bigin_id;
      if (bid) remainBiginMap.set(bid, (remainBiginMap.get(bid) || 0) + 1);
    }
    const stillDup = [...remainBiginMap.entries()].filter(([_, c]) => c > 1);
    console.log(`  Duplicate bigin_ids remaining: ${stillDup.length}`);

    // Check linking
    const { count: brokenLinks } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', WS_ID)
      .not('source_order_id', 'is', null);
    console.log(`  Orders with source_order_id: ${brokenLinks}`);
  }

  // Save log
  const logDir = path.resolve(__dirname, 'data/upload-log');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    path.resolve(logDir, 'cleanup-audit.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      mode: EXECUTE ? 'execute' : 'dry-run',
      duplicatePairs: duplicates.length,
      toDelete: toDelete.length,
      toKeep: toKeep.length,
      deleteWithProducts: deleteWithProducts.length,
      deleteReferencedByChildren: deleteReferencedByChildren.length,
      decisions: decisions.slice(0, 50), // Sample
      allDeleteIds: toDelete,
    }, null, 2)
  );
  console.log(`\nLog saved: data/upload-log/cleanup-audit.json`);
  console.log('\n=== CLEANUP COMPLETE ===');
}

main().catch(console.error);
