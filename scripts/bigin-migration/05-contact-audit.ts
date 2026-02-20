/**
 * Contact ↔ Order Assignment Audit + RECO Tag Assignment
 *
 * TAREA 1: Audit contact-order relationships
 *   - Count orders per contact in DB (all pipelines)
 *   - Compare with normalized contacts.json order_count
 *   - Identify orphan contacts (0 orders) and orphan orders (no contact)
 *   - Distribution report
 *
 * TAREA 2: Create "RECO" tag and assign to contacts with >1 venta
 *   - Only runs with --tag flag
 *   - Counts ventas per contact (pipeline Ventas only)
 *   - Creates tag + assigns via contact_tags
 *
 * Usage:
 *   npx tsx scripts/bigin-migration/05-contact-audit.ts          # audit only
 *   npx tsx scripts/bigin-migration/05-contact-audit.ts --tag     # audit + create RECO tag + assign
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
const PIPELINE_LOGISTICA = 'b1c955ab-2db5-4c2e-972b-e7f1b2b99f89';
const PIPELINE_ENVIOS = '02d98c52-0e26-4f6e-88da-66b02aafa03e';

const RUN_TAG = process.argv.includes('--tag');
const BATCH = 500;

// ============================================================================
// HELPERS
// ============================================================================

async function fetchAllPaginated<T>(
  table: string,
  select: string,
  filters: Record<string, any>,
  orderBy?: string
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    let query = supabase.from(table).select(select);
    for (const [key, val] of Object.entries(filters)) {
      if (val === null) query = query.is(key, null);
      else query = query.eq(key, val);
    }
    if (orderBy) query = query.order(orderBy, { ascending: true });
    query = query.range(offset, offset + 999);

    const { data, error } = await query;
    if (error) { console.error(`Fetch error on ${table} at offset ${offset}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    offset += data.length;
    if (data.length < 1000) break;
  }
  return all;
}

// ============================================================================
// TAREA 1: AUDIT
// ============================================================================

async function runAudit() {
  console.log('=== TAREA 1: AUDITORÍA CONTACTO ↔ ÓRDENES ===\n');

  // 1a. Fetch all contacts in workspace
  console.log('1a. Fetching all contacts...');
  const contacts = await fetchAllPaginated<{
    id: string; name: string; phone: string; custom_fields: any;
  }>('contacts', 'id, name, phone, custom_fields', { workspace_id: WS_ID });
  console.log(`  Total contacts in DB: ${contacts.length}`);

  // 1b. Fetch all orders with contact_id
  console.log('1b. Fetching all orders...');
  const orders = await fetchAllPaginated<{
    id: string; contact_id: string | null; pipeline_id: string; custom_fields: any;
  }>('orders', 'id, contact_id, pipeline_id, custom_fields', { workspace_id: WS_ID });
  console.log(`  Total orders in DB: ${orders.length}`);

  // 1c. Count orders per contact (all pipelines)
  const ordersPerContact = new Map<string, number>();
  const ventasPerContact = new Map<string, number>();
  let ordersWithoutContact = 0;
  const ordersByPipeline = { ventas: 0, logistica: 0, envios: 0, other: 0 };

  for (const o of orders) {
    // Pipeline count
    if (o.pipeline_id === PIPELINE_VENTAS) ordersByPipeline.ventas++;
    else if (o.pipeline_id === PIPELINE_LOGISTICA) ordersByPipeline.logistica++;
    else if (o.pipeline_id === PIPELINE_ENVIOS) ordersByPipeline.envios++;
    else ordersByPipeline.other++;

    if (!o.contact_id) {
      ordersWithoutContact++;
      continue;
    }
    ordersPerContact.set(o.contact_id, (ordersPerContact.get(o.contact_id) || 0) + 1);
    if (o.pipeline_id === PIPELINE_VENTAS) {
      ventasPerContact.set(o.contact_id, (ventasPerContact.get(o.contact_id) || 0) + 1);
    }
  }

  // 1d. Load reference contacts.json
  console.log('1c. Loading reference contacts.json...');
  const jsonPath = path.resolve(__dirname, 'data/normalized/contacts.json');
  const refContacts: Array<{
    id: string; phone: string; name: string; order_count: number;
    first_order_date: string; last_order_date: string;
  }> = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`  Reference contacts: ${refContacts.length}`);

  // Build phone→refContact map for matching
  const refByPhone = new Map<string, typeof refContacts[0]>();
  for (const rc of refContacts) {
    if (rc.phone) refByPhone.set(rc.phone, rc);
  }

  // ---- REPORT ----

  console.log('\n' + '='.repeat(60));
  console.log('REPORTE DE AUDITORÍA');
  console.log('='.repeat(60));

  // Orders by pipeline
  console.log('\n--- Órdenes por Pipeline ---');
  console.log(`  Ventas:    ${ordersByPipeline.ventas}`);
  console.log(`  Logística: ${ordersByPipeline.logistica}`);
  console.log(`  Envíos:    ${ordersByPipeline.envios}`);
  console.log(`  Otros:     ${ordersByPipeline.other}`);
  console.log(`  TOTAL:     ${orders.length}`);

  // Orders without contact
  console.log(`\n--- Órdenes sin contact_id ---`);
  console.log(`  Total: ${ordersWithoutContact}`);
  // Break down by pipeline
  const noContactByPipeline = { ventas: 0, logistica: 0, envios: 0 };
  for (const o of orders) {
    if (o.contact_id) continue;
    if (o.pipeline_id === PIPELINE_VENTAS) noContactByPipeline.ventas++;
    else if (o.pipeline_id === PIPELINE_LOGISTICA) noContactByPipeline.logistica++;
    else if (o.pipeline_id === PIPELINE_ENVIOS) noContactByPipeline.envios++;
  }
  console.log(`    Ventas: ${noContactByPipeline.ventas}`);
  console.log(`    Logística: ${noContactByPipeline.logistica}`);
  console.log(`    Envíos: ${noContactByPipeline.envios}`);

  // Contacts distribution by total orders
  console.log('\n--- Distribución de contactos por # total de órdenes (todos pipelines) ---');
  const contactIds = new Set(contacts.map(c => c.id));
  const dist = { zero: 0, one_three: 0, four_nine: 0, ten_plus: 0 };
  const distDetail: Record<number, number> = {};
  for (const c of contacts) {
    const count = ordersPerContact.get(c.id) || 0;
    distDetail[count] = (distDetail[count] || 0) + 1;
    if (count === 0) dist.zero++;
    else if (count <= 3) dist.one_three++;
    else if (count <= 9) dist.four_nine++;
    else dist.ten_plus++;
  }
  console.log(`  0 órdenes (huérfanos):  ${dist.zero}`);
  console.log(`  1-3 órdenes:            ${dist.one_three}`);
  console.log(`  4-9 órdenes:            ${dist.four_nine}`);
  console.log(`  10+ órdenes:            ${dist.ten_plus}`);
  console.log(`\n  Detalle:`)
  for (const n of Object.keys(distDetail).map(Number).sort((a, b) => a - b)) {
    console.log(`    ${n} órdenes: ${distDetail[n]} contactos`);
  }

  // Contacts distribution by VENTAS only
  console.log('\n--- Distribución de contactos por # de VENTAS ---');
  const ventasDist: Record<number, number> = {};
  let contactsWithVentas = 0;
  let contactsWithMultipleVentas = 0;
  for (const c of contacts) {
    const count = ventasPerContact.get(c.id) || 0;
    ventasDist[count] = (ventasDist[count] || 0) + 1;
    if (count > 0) contactsWithVentas++;
    if (count > 1) contactsWithMultipleVentas++;
  }
  for (const n of Object.keys(ventasDist).map(Number).sort((a, b) => a - b)) {
    console.log(`    ${n} ventas: ${ventasDist[n]} contactos`);
  }
  console.log(`\n  Contactos con al menos 1 venta: ${contactsWithVentas}`);
  console.log(`  Contactos con >1 venta (RECOMPRA): ${contactsWithMultipleVentas}`);

  // Compare with JSON reference
  console.log('\n--- Comparación con contacts.json (referencia pre-migración) ---');
  const jsonDist = { one: 0, two_three: 0, four_plus: 0 };
  for (const rc of refContacts) {
    if (rc.order_count === 1) jsonDist.one++;
    else if (rc.order_count <= 3) jsonDist.two_three++;
    else jsonDist.four_plus++;
  }
  console.log(`  JSON: 1 orden: ${jsonDist.one}, 2-3: ${jsonDist.two_three}, 4+: ${jsonDist.four_plus}`);
  console.log(`  (order_count en JSON = # transacciones/groups, no órdenes individuales)`);

  // Match contacts DB vs JSON by phone
  let matched = 0;
  let unmatched_db = 0;
  let unmatched_json = 0;
  const dbByPhone = new Map<string, typeof contacts[0]>();
  for (const c of contacts) dbByPhone.set(c.phone, c);

  for (const rc of refContacts) {
    if (dbByPhone.has(rc.phone)) matched++;
    else unmatched_json++;
  }
  for (const c of contacts) {
    if (!refByPhone.has(c.phone)) unmatched_db++;
  }
  console.log(`\n  Matched by phone: ${matched}`);
  console.log(`  In JSON but NOT in DB: ${unmatched_json} (no insertados — probablemente phone=null)`);
  console.log(`  In DB but NOT in JSON: ${unmatched_db} (creados post-migración o manualmente)`);

  // Proportionality check: for matched contacts, compare JSON order_count vs DB ventas count
  console.log('\n--- Verificación proporcional (JSON order_count vs DB ventas) ---');
  let proportional_match = 0;
  let proportional_mismatch = 0;
  const mismatches: Array<{ phone: string; name: string; json_count: number; db_ventas: number }> = [];

  for (const rc of refContacts) {
    const dbContact = dbByPhone.get(rc.phone);
    if (!dbContact) continue;
    const dbVentas = ventasPerContact.get(dbContact.id) || 0;
    // JSON order_count = # transacciones (groups), each group = 1 venta
    // So JSON order_count should ~ equal DB ventas count
    if (dbVentas === rc.order_count) {
      proportional_match++;
    } else {
      proportional_mismatch++;
      if (mismatches.length < 20) {
        mismatches.push({ phone: rc.phone, name: rc.name, json_count: rc.order_count, db_ventas: dbVentas });
      }
    }
  }
  console.log(`  Match (JSON order_count == DB ventas): ${proportional_match}`);
  console.log(`  Mismatch: ${proportional_mismatch}`);
  if (mismatches.length > 0) {
    console.log(`  Sample mismatches (first ${mismatches.length}):`);
    for (const m of mismatches) {
      console.log(`    ${m.phone} (${m.name}): JSON=${m.json_count}, DB ventas=${m.db_ventas}`);
    }
  }

  // Orphan contacts with bigin data but 0 orders
  const orphanContactsBigin: Array<{ id: string; phone: string; name: string }> = [];
  for (const c of contacts) {
    if ((ordersPerContact.get(c.id) || 0) === 0 && c.custom_fields?.bigin_match_method) {
      orphanContactsBigin.push({ id: c.id, phone: c.phone, name: c.name });
    }
  }
  console.log(`\n--- Contactos huérfanos (bigin, 0 órdenes) ---`);
  console.log(`  Total: ${orphanContactsBigin.length}`);
  if (orphanContactsBigin.length > 0 && orphanContactsBigin.length <= 20) {
    for (const c of orphanContactsBigin) {
      console.log(`    ${c.phone} (${c.name})`);
    }
  }

  // Save audit report
  const report = {
    timestamp: new Date().toISOString(),
    contacts_db: contacts.length,
    contacts_json: refContacts.length,
    orders_total: orders.length,
    orders_by_pipeline: ordersByPipeline,
    orders_without_contact: ordersWithoutContact,
    orders_without_contact_by_pipeline: noContactByPipeline,
    contacts_distribution_all_orders: distDetail,
    contacts_distribution_ventas: ventasDist,
    contacts_with_ventas: contactsWithVentas,
    contacts_with_multiple_ventas: contactsWithMultipleVentas,
    json_vs_db_phone_match: matched,
    json_not_in_db: unmatched_json,
    db_not_in_json: unmatched_db,
    proportional_match: proportional_match,
    proportional_mismatch: proportional_mismatch,
    sample_mismatches: mismatches,
    orphan_contacts_bigin: orphanContactsBigin.length,
  };

  const logDir = path.resolve(__dirname, 'data/upload-log');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.resolve(logDir, 'contact-audit.json'), JSON.stringify(report, null, 2));
  console.log(`\nReporte guardado: data/upload-log/contact-audit.json`);

  return { contacts, ventasPerContact, contactsWithMultipleVentas };
}

// ============================================================================
// TAREA 2: RECO TAG
// ============================================================================

async function runRecoTag(
  contacts: Array<{ id: string; name: string; phone: string; custom_fields: any }>,
  ventasPerContact: Map<string, number>
) {
  console.log('\n\n' + '='.repeat(60));
  console.log('TAREA 2: CREAR TAG "RECO" Y ASIGNAR');
  console.log('='.repeat(60) + '\n');

  // 2a. Create tag (upsert by workspace_id + name)
  console.log('2a. Creando tag RECO...');
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id')
    .eq('workspace_id', WS_ID)
    .eq('name', 'RECO')
    .maybeSingle();

  let tagId: string;
  if (existingTag) {
    tagId = existingTag.id;
    console.log(`  Tag RECO ya existe: ${tagId}`);
  } else {
    const { data: newTag, error } = await supabase
      .from('tags')
      .insert({
        workspace_id: WS_ID,
        name: 'RECO',
        color: '#f59e0b', // amber-500 — destaca en listas
        applies_to: 'both',
      })
      .select('id')
      .single();
    if (error) { console.error('  ERROR creando tag:', error.message); return; }
    tagId = newTag.id;
    console.log(`  Tag RECO creado: ${tagId} (color: #f59e0b amber)`);
  }

  // 2b. Identify contacts with >1 venta
  const recoContactIds: string[] = [];
  const recoDistribution: Record<number, number> = {};

  for (const c of contacts) {
    const ventas = ventasPerContact.get(c.id) || 0;
    if (ventas > 1) {
      recoContactIds.push(c.id);
      recoDistribution[ventas] = (recoDistribution[ventas] || 0) + 1;
    }
  }

  console.log(`\n2b. Contactos con >1 venta (recompra): ${recoContactIds.length}`);
  console.log('  Distribución:');
  for (const n of Object.keys(recoDistribution).map(Number).sort((a, b) => a - b)) {
    console.log(`    ${n} ventas: ${recoDistribution[n]} contactos`);
  }

  if (recoContactIds.length === 0) {
    console.log('  No hay contactos de recompra. Nada que asignar.');
    return;
  }

  // 2c. Check existing assignments (to avoid duplicates)
  console.log('\n2c. Verificando asignaciones existentes...');
  const existingAssignments = new Set<string>();
  for (let i = 0; i < recoContactIds.length; i += 500) {
    const batch = recoContactIds.slice(i, i + 500);
    const { data } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .eq('tag_id', tagId)
      .in('contact_id', batch);
    if (data) for (const d of data) existingAssignments.add(d.contact_id);
  }
  console.log(`  Ya asignados: ${existingAssignments.size}`);

  const toAssign = recoContactIds.filter(id => !existingAssignments.has(id));
  console.log(`  Por asignar: ${toAssign.length}`);

  if (toAssign.length === 0) {
    console.log('  Todos ya tienen el tag. Nada que hacer.');
    return;
  }

  // 2d. Batch insert contact_tags
  console.log(`\n2d. Insertando ${toAssign.length} asignaciones en batches de ${BATCH}...`);
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toAssign.length; i += BATCH) {
    const batch = toAssign.slice(i, i + BATCH);
    const rows = batch.map(contact_id => ({ contact_id, tag_id: tagId }));

    const { error } = await supabase.from('contact_tags').insert(rows);
    if (error) {
      console.log(`  Batch ${i} error: ${error.message} — retrying individually...`);
      for (const row of rows) {
        const { error: e } = await supabase.from('contact_tags').insert(row);
        if (e) { errors++; }
        else { inserted++; }
      }
    } else {
      inserted += batch.length;
    }
    if ((i + batch.length) % 1000 === 0 || i + batch.length === toAssign.length) {
      console.log(`  ${Math.min(i + batch.length, toAssign.length)}/${toAssign.length}`);
    }
  }

  console.log(`\n=== RESULTADO TAG RECO ===`);
  console.log(`  Tag ID: ${tagId}`);
  console.log(`  Insertados: ${inserted}`);
  console.log(`  Errores: ${errors}`);
  console.log(`  Ya existían: ${existingAssignments.size}`);
  console.log(`  Total con tag RECO: ${inserted + existingAssignments.size}`);

  // Verify
  const { count: verifyCount } = await supabase
    .from('contact_tags')
    .select('*', { count: 'exact', head: true })
    .eq('tag_id', tagId);
  console.log(`  Verificación en DB: ${verifyCount} contact_tags con tag RECO`);

  // Save tag report
  const tagReport = {
    timestamp: new Date().toISOString(),
    tag_id: tagId,
    tag_name: 'RECO',
    tag_color: '#f59e0b',
    total_recompra_contacts: recoContactIds.length,
    already_assigned: existingAssignments.size,
    newly_assigned: inserted,
    errors: errors,
    distribution: recoDistribution,
    verified_count: verifyCount,
  };
  const logDir = path.resolve(__dirname, 'data/upload-log');
  fs.writeFileSync(path.resolve(logDir, 'reco-tag-report.json'), JSON.stringify(tagReport, null, 2));
  console.log(`  Reporte guardado: data/upload-log/reco-tag-report.json`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { contacts, ventasPerContact, contactsWithMultipleVentas } = await runAudit();

  if (RUN_TAG) {
    await runRecoTag(contacts, ventasPerContact);
  } else {
    console.log(`\n--- Para crear tag RECO y asignar a ${contactsWithMultipleVentas} contactos, ejecuta: ---`);
    console.log(`npx tsx scripts/bigin-migration/05-contact-audit.ts --tag`);
  }

  console.log('\n=== COMPLETO ===');
}

main().catch(console.error);
