/**
 * Investigate the 85 orphan orders without bigin_id in Ventas pipeline
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
const PIPELINE_VENTAS = 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8';

async function main() {
  // Get ALL stages (not just workspace — in case stages were moved)
  const { data: allStages } = await supabase.from('stages').select('id, name, pipeline_id, position');
  const stageMap = new Map<string, any>();
  if (allStages) for (const s of allStages) stageMap.set(s.id, s);

  console.log('=== ALL STAGES IN WORKSPACE ===');
  const { data: wsStages } = await supabase.from('stages').select('id, name, pipeline_id, position').eq('workspace_id', WS_ID).order('pipeline_id').order('position');
  if (wsStages) {
    let lastPipeline = '';
    for (const s of wsStages) {
      if (s.pipeline_id !== lastPipeline) {
        console.log(`\nPipeline: ${s.pipeline_id}`);
        lastPipeline = s.pipeline_id;
      }
      console.log(`  ${s.position}. ${s.name} (${s.id})`);
    }
  }

  // Get orphan orders (Ventas pipeline, no bigin_id)
  const { data: orphans } = await supabase
    .from('orders')
    .select('id, name, contact_id, created_at, updated_at, stage_id, custom_fields, total_value, source_order_id')
    .eq('workspace_id', WS_ID)
    .eq('pipeline_id', PIPELINE_VENTAS)
    .is('custom_fields->>bigin_id', null)
    .order('created_at', { ascending: true });

  console.log(`\n=== ${orphans?.length || 0} ORPHAN ORDERS (Ventas, no bigin_id) ===\n`);

  if (orphans) {
    // Check which have order_products
    const ids = orphans.map(o => o.id);
    const { data: prods } = await supabase.from('order_products').select('order_id').in('order_id', ids);
    const withProducts = new Set(prods?.map(p => p.order_id) || []);

    // Check contacts
    const contactIds = [...new Set(orphans.filter(o => o.contact_id).map(o => o.contact_id))];
    const contactMap = new Map<string, any>();
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase.from('contacts').select('id, name, phone, custom_fields').in('id', contactIds);
      if (contacts) for (const c of contacts) contactMap.set(c.id, c);
    }

    // Check if any have linked orders (logística/envíos pointing to them)
    const { data: childOrders } = await supabase
      .from('orders')
      .select('id, source_order_id, pipeline_id')
      .in('source_order_id', ids);
    const hasChildren = new Set(childOrders?.map(o => o.source_order_id) || []);

    for (const o of orphans) {
      const stage = stageMap.get(o.stage_id);
      const contact = o.contact_id ? contactMap.get(o.contact_id) : null;
      const hasBiginContact = contact?.custom_fields?.bigin_match_method ? 'bigin-contact' : 'non-bigin-contact';

      console.log(`ORDER: ${o.id}`);
      console.log(`  name: ${o.name}`);
      console.log(`  created_at: ${o.created_at}`);
      console.log(`  updated_at: ${o.updated_at}`);
      console.log(`  stage: ${stage?.name || 'STAGE NOT FOUND'} (${o.stage_id})`);
      console.log(`  total_value: ${o.total_value}`);
      console.log(`  contact: ${contact?.name || 'none'} (${contact?.phone || 'no phone'}) [${hasBiginContact}]`);
      console.log(`  custom_fields: ${JSON.stringify(o.custom_fields)}`);
      console.log(`  has_products: ${withProducts.has(o.id)}`);
      console.log(`  has_child_orders: ${hasChildren.has(o.id)}`);
      console.log(`  source_order_id: ${o.source_order_id || 'null'}`);
      console.log('');
    }

    // Summary
    const dateGroups = new Map<string, number>();
    for (const o of orphans) {
      const d = o.created_at?.substring(0, 10) || 'null';
      dateGroups.set(d, (dateGroups.get(d) || 0) + 1);
    }
    console.log('\n=== DATE DISTRIBUTION ===');
    for (const [date, count] of [...dateGroups.entries()].sort()) {
      console.log(`  ${date}: ${count}`);
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`  Total orphans: ${orphans.length}`);
    console.log(`  With products: ${withProducts.size}`);
    console.log(`  With children: ${hasChildren.size}`);
    console.log(`  With contact: ${orphans.filter(o => o.contact_id).length}`);
    console.log(`  Stage found: ${orphans.filter(o => stageMap.has(o.stage_id)).length}`);
    console.log(`  Stage NOT found: ${orphans.filter(o => !stageMap.has(o.stage_id)).length}`);
  }
}

main().catch(console.error);
