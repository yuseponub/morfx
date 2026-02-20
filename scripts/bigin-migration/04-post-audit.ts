/**
 * Post-Migration Audit: Duplicates, Orphans, Linking
 *
 * Checks:
 * 1. Duplicate bigin_ids within same pipeline
 * 2. Orphan orders without bigin_id (not in "2" stages)
 * 3. Duplicate name+contact+date combos
 * 4. source_order_id linking integrity
 * 5. Counts expected vs actual
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
const PIPELINE_LOGISTICA = 'b1c955ab-1ef9-4b0e-a7e6-e4dec37d9597';
const PIPELINE_ENVIOS = '02d98c52-92f9-4c54-9dfc-c3b2164bf72f';

const PIPELINES = [
  { name: 'Ventas', id: PIPELINE_VENTAS, expected: 26154 },
  { name: 'Logística', id: PIPELINE_LOGISTICA, expected: 22242 },
  { name: 'Envíos', id: PIPELINE_ENVIOS, expected: 3871 },
];

/** Paginated fetch of all orders for a pipeline */
async function fetchAllOrders(pipelineId: string, fields: string = 'id, name, contact_id, created_at, custom_fields, source_order_id, stage_id, pipeline_id') {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select(fields)
      .eq('workspace_id', WS_ID)
      .eq('pipeline_id', pipelineId)
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (error) { console.error(`  Fetch error at offset ${offset}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }
  return all;
}

/** Fetch stage names for identifying "2" stages */
async function fetchStages() {
  const { data } = await supabase
    .from('stages')
    .select('id, name, pipeline_id')
    .eq('workspace_id', WS_ID);
  return data || [];
}

/** Fetch order_products for a set of order IDs */
async function fetchOrderProducts(orderIds: string[]) {
  const result = new Set<string>();
  for (let i = 0; i < orderIds.length; i += 500) {
    const batch = orderIds.slice(i, i + 500);
    const { data } = await supabase
      .from('order_products')
      .select('order_id')
      .in('order_id', batch);
    if (data) for (const d of data) result.add(d.order_id);
  }
  return result;
}

async function main() {
  console.log('=== POST-MIGRATION AUDIT ===\n');
  console.log(`Workspace: ${WS_ID}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Fetch stages to identify "2" suffix stages
  const stages = await fetchStages();
  const stage2Ids = new Set(stages.filter(s => s.name.endsWith('2')).map(s => s.id));
  console.log(`Stages con sufijo "2": ${stage2Ids.size}`);
  for (const s of stages.filter(s => s.name.endsWith('2'))) {
    console.log(`  - ${s.name} (${s.id})`);
  }

  const report: any = { timestamp: new Date().toISOString(), pipelines: {} };

  // ============================================================
  // TAREA 1: AUDIT PER PIPELINE
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('TAREA 1: AUDITORÍA DE DUPLICADOS POR PIPELINE');
  console.log('='.repeat(60));

  for (const pipeline of PIPELINES) {
    console.log(`\n--- ${pipeline.name} (expected: ${pipeline.expected}) ---`);
    const orders = await fetchAllOrders(pipeline.id);
    console.log(`  Total en DB: ${orders.length}`);
    console.log(`  Diferencia vs esperado: ${orders.length - pipeline.expected}`);

    const pReport: any = {
      name: pipeline.name,
      expected: pipeline.expected,
      actual: orders.length,
      diff: orders.length - pipeline.expected,
      duplicateBiginIds: [],
      orphansNoBiginId: [],
      duplicateNameContactDate: [],
      inStage2: [],
    };

    // --- 1a. Duplicate bigin_ids ---
    const biginIdMap = new Map<string, any[]>();
    let noBiginCount = 0;
    for (const o of orders) {
      const biginId = o.custom_fields?.bigin_id;
      if (!biginId) { noBiginCount++; continue; }
      if (!biginIdMap.has(biginId)) biginIdMap.set(biginId, []);
      biginIdMap.get(biginId)!.push(o);
    }
    const dupBiginIds = [...biginIdMap.entries()].filter(([_, arr]) => arr.length > 1);
    console.log(`  Duplicate bigin_ids: ${dupBiginIds.length} bigin_ids con ${dupBiginIds.reduce((s, [_, a]) => s + a.length, 0)} órdenes total`);
    pReport.duplicateBiginIds = dupBiginIds.map(([biginId, arr]) => ({
      bigin_id: biginId,
      count: arr.length,
      orders: arr.map((o: any) => ({ id: o.id, name: o.name, created_at: o.created_at, has_source: !!o.source_order_id })),
    }));
    if (dupBiginIds.length > 0) {
      console.log(`  Samples:`);
      for (const [bid, arr] of dupBiginIds.slice(0, 5)) {
        console.log(`    bigin_id=${bid}: ${arr.length} copies`);
        for (const o of arr) console.log(`      - ${o.id} | ${o.name} | ${o.created_at}`);
      }
    }

    // --- 1b. Orders without bigin_id (not in stage "2") ---
    const ordersNoBigin = orders.filter(o => !o.custom_fields?.bigin_id);
    const orphans = ordersNoBigin.filter(o => !stage2Ids.has(o.stage_id));
    const inStage2 = ordersNoBigin.filter(o => stage2Ids.has(o.stage_id));
    console.log(`  Sin bigin_id total: ${ordersNoBigin.length}`);
    console.log(`    En stages "2" (legítimas): ${inStage2.length}`);
    console.log(`    Huérfanas (posibles restos v1/v2): ${orphans.length}`);
    pReport.orphansNoBiginId = orphans.map(o => ({
      id: o.id, name: o.name, created_at: o.created_at, stage_id: o.stage_id,
      stage_name: stages.find(s => s.id === o.stage_id)?.name || '?',
    }));
    pReport.inStage2 = inStage2.map(o => ({ id: o.id, name: o.name }));
    if (orphans.length > 0) {
      console.log(`  Orphan samples:`);
      for (const o of orphans.slice(0, 10)) {
        const stageName = stages.find(s => s.id === o.stage_id)?.name || '?';
        console.log(`    - ${o.id} | ${o.name} | stage=${stageName} | created=${o.created_at}`);
      }
    }

    // --- 1c. Duplicate name+contact_id+DATE(created_at) ---
    const nameContactDateMap = new Map<string, any[]>();
    for (const o of orders) {
      const dateStr = o.created_at ? o.created_at.substring(0, 10) : 'null';
      const key = `${o.name || ''}|${o.contact_id || 'null'}|${dateStr}`;
      if (!nameContactDateMap.has(key)) nameContactDateMap.set(key, []);
      nameContactDateMap.get(key)!.push(o);
    }
    const dupNameDate = [...nameContactDateMap.entries()].filter(([_, arr]) => arr.length > 1);
    const dupNameDateTotal = dupNameDate.reduce((s, [_, a]) => s + a.length, 0);
    console.log(`  Duplicate name+contact+date: ${dupNameDate.length} combos con ${dupNameDateTotal} órdenes total`);

    // Check how many of these are ALSO bigin_id duplicates vs different bigin_ids
    let sameBiginCount = 0;
    let diffBiginCount = 0;
    for (const [_, arr] of dupNameDate) {
      const biginIds = new Set(arr.map((o: any) => o.custom_fields?.bigin_id).filter(Boolean));
      if (biginIds.size < arr.length && biginIds.size > 0) sameBiginCount++;
      else if (biginIds.size === arr.length && biginIds.size > 1) diffBiginCount++;
    }
    console.log(`    Mismo bigin_id (duplicados script): ${sameBiginCount}`);
    console.log(`    Diferente bigin_id (legítimos de Bigin): ${diffBiginCount}`);

    pReport.duplicateNameContactDate = dupNameDate.slice(0, 20).map(([key, arr]) => ({
      key,
      count: arr.length,
      bigin_ids: [...new Set(arr.map((o: any) => o.custom_fields?.bigin_id))],
      orders: arr.map((o: any) => ({ id: o.id, bigin_id: o.custom_fields?.bigin_id, created_at: o.created_at })),
    }));

    report.pipelines[pipeline.name] = pReport;
  }

  // --- 1d. Check which duplicates have order_products ---
  console.log('\n--- Checking order_products for duplicates ---');
  const allDupOrderIds: string[] = [];
  for (const pName of Object.keys(report.pipelines)) {
    const pReport = report.pipelines[pName];
    for (const dup of pReport.duplicateBiginIds) {
      for (const o of dup.orders) allDupOrderIds.push(o.id);
    }
    for (const o of pReport.orphansNoBiginId) allDupOrderIds.push(o.id);
  }

  if (allDupOrderIds.length > 0) {
    const withProducts = await fetchOrderProducts(allDupOrderIds);
    console.log(`  De ${allDupOrderIds.length} órdenes duplicadas/huérfanas, ${withProducts.size} tienen order_products`);

    // Annotate report
    for (const pName of Object.keys(report.pipelines)) {
      const pReport = report.pipelines[pName];
      for (const dup of pReport.duplicateBiginIds) {
        for (const o of dup.orders) o.has_products = withProducts.has(o.id);
      }
      for (const o of pReport.orphansNoBiginId) o.has_products = withProducts.has(o.id);
    }
  }

  // ============================================================
  // TAREA 2: SOURCE_ORDER_ID LINKING
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('TAREA 2: AUDITORÍA DE VINCULACIÓN (source_order_id)');
  console.log('='.repeat(60));

  // Fetch all orders with source_order_id
  const allLinkedOrders: any[] = [];
  let lOffset = 0;
  while (true) {
    const { data } = await supabase
      .from('orders')
      .select('id, source_order_id, pipeline_id, custom_fields')
      .eq('workspace_id', WS_ID)
      .not('source_order_id', 'is', null)
      .range(lOffset, lOffset + 999);
    if (!data || data.length === 0) break;
    allLinkedOrders.push(...data);
    lOffset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`\nTotal órdenes con source_order_id: ${allLinkedOrders.length}`);

  const logLinked = allLinkedOrders.filter(o => o.pipeline_id === PIPELINE_LOGISTICA);
  const envLinked = allLinkedOrders.filter(o => o.pipeline_id === PIPELINE_ENVIOS);
  const otherLinked = allLinkedOrders.filter(o => o.pipeline_id !== PIPELINE_LOGISTICA && o.pipeline_id !== PIPELINE_ENVIOS);

  console.log(`  Logísticas con source_order_id → venta: ${logLinked.length} (esperado: ~22,236)`);
  console.log(`  Envíos con source_order_id → logística: ${envLinked.length} (esperado: ~3,832)`);
  if (otherLinked.length > 0) console.log(`  ⚠ Otras (inesperadas): ${otherLinked.length}`);

  // Check for broken links (source_order_id points to non-existent order)
  console.log('\nChecking broken links...');
  const allOrderIds = new Set<string>();
  let idOffset = 0;
  while (true) {
    const { data } = await supabase
      .from('orders')
      .select('id')
      .eq('workspace_id', WS_ID)
      .range(idOffset, idOffset + 999);
    if (!data || data.length === 0) break;
    for (const d of data) allOrderIds.add(d.id);
    idOffset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`  Total order IDs in DB: ${allOrderIds.size}`);

  const brokenLinks: any[] = [];
  for (const o of allLinkedOrders) {
    if (!allOrderIds.has(o.source_order_id)) {
      brokenLinks.push({ id: o.id, source_order_id: o.source_order_id, pipeline: o.pipeline_id, bigin_id: o.custom_fields?.bigin_id });
    }
  }
  console.log(`  Broken links (source_order_id → non-existent): ${brokenLinks.length}`);
  if (brokenLinks.length > 0) {
    for (const b of brokenLinks.slice(0, 10)) {
      console.log(`    - ${b.id} → ${b.source_order_id} (bigin: ${b.bigin_id})`);
    }
  }

  // Check linked_order_id column
  const { count: linkedOrderIdCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', WS_ID)
    .not('linked_order_id', 'is', null);
  console.log(`\n  Órdenes con linked_order_id (NOT NULL): ${linkedOrderIdCount || 0}`);
  console.log(`  (La migración usó source_order_id, no linked_order_id)`);

  report.linking = {
    totalLinked: allLinkedOrders.length,
    logLinked: logLinked.length,
    envLinked: envLinked.length,
    brokenLinks: brokenLinks.length,
    brokenSamples: brokenLinks.slice(0, 20),
    linkedOrderIdCount: linkedOrderIdCount || 0,
  };

  // ============================================================
  // TAREA 5: TOTAL COUNTS SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('RESUMEN FINAL');
  console.log('='.repeat(60));

  const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID);
  const { count: totalBigin } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID).not('custom_fields->>bigin_id', 'is', null);
  const { count: totalContacts } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID);
  const { count: totalProducts } = await supabase.from('order_products').select('*', { count: 'exact', head: true });

  console.log(`\n  Total órdenes: ${totalOrders} (con bigin_id: ${totalBigin})`);
  console.log(`  Esperado total bigin: 52,267 (26,154 + 22,242 + 3,871)`);
  console.log(`  Diferencia: ${(totalBigin || 0) - 52267}`);
  console.log(`  Contactos: ${totalContacts}`);
  console.log(`  Products: ${totalProducts}`);

  // Orders to delete summary
  let totalToDelete = 0;
  for (const pName of Object.keys(report.pipelines)) {
    const p = report.pipelines[pName];
    const dupExtras = p.duplicateBiginIds.reduce((s: number, d: any) => s + d.count - 1, 0);
    const orphans = p.orphansNoBiginId.length;
    totalToDelete += dupExtras + orphans;
    console.log(`\n  ${pName}:`);
    console.log(`    Duplicados bigin_id a eliminar: ${dupExtras}`);
    console.log(`    Huérfanas sin bigin_id: ${orphans}`);
  }
  console.log(`\n  TOTAL A ELIMINAR: ${totalToDelete}`);

  report.summary = {
    totalOrders, totalBigin, totalContacts, totalProducts,
    totalToDelete,
  };

  // Save report
  const logDir = path.resolve(__dirname, 'data/upload-log');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    path.resolve(logDir, 'post-audit-report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(`\nReporte guardado: data/upload-log/post-audit-report.json`);
  console.log('\n=== AUDIT COMPLETE ===');
}

main().catch(console.error);
