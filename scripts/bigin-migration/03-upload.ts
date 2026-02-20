/**
 * Phase 3B: Full Bigin → MorfX Migration (v3 — Batch Optimized)
 *
 * Strategy: 3-pass batch inserts instead of per-record sequential inserts
 * Pass 1: All ventas (batch 200) → build bigin_id→morfx_id map
 * Pass 2: All logísticas (batch 200) → use venta map, build log map
 * Pass 3: All envíos (batch 200) → use logística map
 *
 * ~300 batch requests instead of ~61,000 individual requests
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

// --- Constants ---
const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const BATCH = 200;

const PIPELINE_VENTAS = 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8';
const PIPELINE_LOGISTICA = 'b1c955ab-1ef9-4b0e-a7e6-e4dec37d9597';
const PIPELINE_ENVIOS = '02d98c52-92f9-4c54-9dfc-c3b2164bf72f';

const VENTAS_STAGE_MAP: Record<string, string> = {
  'AGENDADO':        'dd7435c1-055b-4bba-bb68-5c3edbff678f',
  'FALTA INFO':      '05c1f783-8d5a-492d-86c2-c660e8e23332',
  'FALTA CONFIRMAR': 'e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd',
  'CONFIRMA':        '4770a36e-5feb-4eec-a71c-75d54cb2797c',
  'CANCELA':         'cfd5e5d1-77bb-41ee-980e-2a872a911665',
};
const LOGISTICA_STAGE_MAP: Record<string, string> = {
  'FALTA ACCION':    '35d8c37f-ba2a-4ff3-b252-49fb2a422c17',
  'SOMNIO ENVIOS':   '23ab2b55-9197-4122-9395-efec5720a6ca',
  'ROBOT ENVIA':     'b2d8987b-8192-43d3-a844-92af119950a9',
  'ROBOT INTER':     'f3cb2d93-4e99-419f-a05d-590c69e8c3e3',
  'ESPERANDO GUIAS': '865e5fd1-7279-4a1d-8bd9-8de316e23388',
  'COORDINADORA':    'b8f209ac-c251-4f43-b9ea-37051e722898',
  'ENVIA':           '3c7c4dd7-7c33-4fab-b679-99631442c48e',
  'OFI INTER':       '729bcd13-d9a0-4f0e-9992-80d55a8b1585',
  'REPARTO':         '3218507c-39a8-4fe4-a9ef-391580accbdb',
  'NOVEDAD':         'de45fe89-46df-4b05-92fc-ebd1e4f04c0a',
  'SOLUCIONADA':     '9e5651ff-5a3c-45d6-80d3-28ce038e7bd7',
  'ENTREGADO':       '175332dc-f505-4764-bee0-e3c94a29be67',
  'DEVOLUCION':      '3b4c9ad4-7db7-41bf-8a8c-3384fb56daae',
  'CANCELA':         '2f4ec2b9-0ac4-468c-befe-058e197caae0',
};
const ENVIOS_STAGE_MAP: Record<string, string> = {
  'AGENDADO':    '4aeb235e-5065-40a8-b42d-5bc4515db7bd',
  'BOGOTA':      '3d5b2000-203d-43d5-a44e-ed40ac8b5b11',
  'BUCARAMANGA': '63f990ef-f334-4339-8f4f-e3b828aec638',
  'REPARTO':     'b5206a7b-7453-485a-9ade-4e34b9fc380c',
  'NOVEDAD':     '649fd3ee-5a39-4e2e-a091-7ec2a2f19507',
  'SOLUCIONADA': 'ad71495a-2e1e-4c02-8d47-a0886fd03611',
  'ENTREGADO':   'debfa1a7-42a0-48b2-aa4a-ebe840d64f7f',
  'DEVOLUCION':  '138e64b0-19d1-4c7a-8cb5-b12e47fac840',
  'CANCELA':     '9b87f63f-14c7-43cf-9a41-d805bd12f9b5',
};

const PRODUCT_MAP: Record<number, { id: string; sku: string; title: string; price: number }> = {
  77900:  { id: '7e669b44-f438-4c24-97a3-373b17d37171', sku: '001', title: 'Elixir', price: 77900 },
  109900: { id: 'c24407ea-94eb-49ea-b96c-f6d15fb07bb7', sku: '002', title: '2 X ELIXIR DEL SUEÑO', price: 109900 },
  139900: { id: 'a1a0c632-23ea-4368-8cda-116145fba8d6', sku: '003', title: '3 X ELIXIR DEL SUEÑO', price: 139900 },
};

interface BiginDeal {
  id: string; Deal_Name: string; Stage: string; Amount: number | null;
  Description: string | null; Telefono: string | null; CallBell: string | null;
  Direcci_n: string | null; Municipio_Dept: string | null; Departamento: string | null;
  Transportadora: string | null; Guia: string | null; Created_Time: string;
  Modified_Time: string; Closing_Date: string | null; [key: string]: any;
}

const stats = {
  contactsInserted: 0, contactsNullPhone: 0, contactsExisted: 0, contactsErrors: 0,
  ventasCreated: 0, ventasErrors: 0,
  logisticaCreated: 0, logisticaErrors: 0,
  enviosCreated: 0, enviosErrors: 0,
  productsAssigned: 0, updatedAtFixed: 0,
};
const errorLog: { step: string; id: string; error: string }[] = [];

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let p = phone.replace(/\s+/g, '').replace(/-/g, '');
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

function dealToOrderRow(
  deal: BiginDeal, pipelineId: string, stageId: string,
  contactId: string | null, sourceOrderId: string | null,
) {
  return {
    workspace_id: WS_ID, contact_id: contactId, pipeline_id: pipelineId,
    stage_id: stageId, name: deal.Deal_Name || null,
    total_value: deal.Amount || 0, description: deal.Description || null,
    carrier: deal.Transportadora || null, tracking_number: deal.Guia || null,
    shipping_address: deal.Direcci_n || null, shipping_city: deal.Municipio_Dept || null,
    shipping_department: deal.Departamento || null, closing_date: deal.Closing_Date || null,
    source_order_id: sourceOrderId,
    custom_fields: { bigin_id: deal.id, bigin_callbell: deal.CallBell || null },
    created_at: deal.Created_Time, updated_at: deal.Modified_Time,
  };
}

/** Batch insert rows, returning array of {id, custom_fields} for mapping */
async function batchInsert(
  rows: any[], stepName: string, statKey: 'ventasCreated' | 'logisticaCreated' | 'enviosCreated',
): Promise<{ id: string; bigin_id: string }[]> {
  const results: { id: string; bigin_id: string }[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('orders')
      .insert(batch)
      .select('id, custom_fields');

    if (error) {
      // Retry individually
      console.log(`  Batch ${i} error: ${error.message} — retrying individually...`);
      for (const row of batch) {
        const { data: single, error: sErr } = await supabase
          .from('orders').insert(row).select('id, custom_fields').single();
        if (sErr) {
          errorLog.push({ step: stepName, id: row.custom_fields?.bigin_id || '?', error: sErr.message });
          (stats as any)[statKey.replace('Created', 'Errors')]++;
        } else if (single) {
          results.push({ id: single.id, bigin_id: single.custom_fields?.bigin_id });
          stats[statKey]++;
        }
      }
    } else if (data) {
      for (const d of data) {
        results.push({ id: d.id, bigin_id: d.custom_fields?.bigin_id });
      }
      stats[statKey] += data.length;
    }

    if (i % 2000 === 0 || i + BATCH >= rows.length) {
      console.log(`  ${stepName}: ${Math.min(i + batch.length, rows.length)}/${rows.length} (${stats[statKey]} ok)`);
    }
  }

  return results;
}

async function main() {
  const startTime = Date.now();
  console.log('=== FASE 3B: MIGRACIÓN COMPLETA (v3 BATCH) ===');
  console.log(`Inicio: ${new Date().toISOString()}\n`);

  // Load data
  console.log('Cargando datos...');
  const contacts = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/normalized/contacts.json'), 'utf-8'));
  const orderGroups = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/normalized/order-groups.json'), 'utf-8'));
  const unmatched = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/normalized/unmatched.json'), 'utf-8'));
  const rematchCandidates = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/normalized/rematch-candidates.json'), 'utf-8'));

  console.log('Indexando deals raw...');
  const rawDeals: BiginDeal[] = Object.values(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/pipelines.json'), 'utf-8'))
  );
  const rawDealsMap = new Map<string, BiginDeal>();
  for (const deal of rawDeals) { if (deal.id) rawDealsMap.set(deal.id, deal); }
  console.log(`  ${rawDealsMap.size} deals`);

  // ==============================================================
  // STEP 1: CONTACTS
  // ==============================================================
  console.log('\n=== STEP 1: CONTACTS ===');
  const phoneToContactId = new Map<string, string>();

  // Load existing
  let off = 0;
  while (true) {
    const { data: ex } = await supabase.from('contacts').select('id, phone').eq('workspace_id', WS_ID).range(off, off + 999);
    if (!ex || ex.length === 0) break;
    for (const c of ex) phoneToContactId.set(c.phone, c.id);
    off += ex.length;
    if (ex.length < 1000) break;
  }
  console.log(`  ${phoneToContactId.size} pre-existentes`);

  const newContacts = contacts.filter((c: any) => {
    if (!c.phone || c.phone.trim() === '') { stats.contactsNullPhone++; return false; }
    if (phoneToContactId.has(c.phone)) { stats.contactsExisted++; return false; }
    return true;
  });
  console.log(`  ${newContacts.length} nuevos (${stats.contactsNullPhone} sin phone, ${stats.contactsExisted} existentes)`);

  for (let i = 0; i < newContacts.length; i += 500) {
    const batch = newContacts.slice(i, i + 500);
    const rows = batch.map((c: any) => ({
      workspace_id: WS_ID, phone: c.phone, name: c.name, email: c.email,
      address: c.address, city: c.city, department: c.department,
      custom_fields: {
        callbell_id: c.callbell_id || null,
        bigin_match_method: c.match_method || null,
        all_addresses: JSON.stringify(c.all_addresses || []),
      },
    }));

    const { data: result, error } = await supabase.from('contacts').insert(rows).select('id, phone');
    if (error) {
      console.log(`  Batch ${i} error: ${error.message} — retrying...`);
      for (const row of rows) {
        const { data: s, error: e } = await supabase.from('contacts').insert(row).select('id, phone').single();
        if (e) { stats.contactsErrors++; errorLog.push({ step: 'contact', id: row.phone, error: e.message }); }
        else if (s) { phoneToContactId.set(s.phone, s.id); stats.contactsInserted++; }
      }
    } else if (result) {
      for (const r of result) phoneToContactId.set(r.phone, r.id);
      stats.contactsInserted += result.length;
    }
    if (i % 5000 === 0) console.log(`  ${Math.min(i + batch.length, newContacts.length)}/${newContacts.length}`);
  }
  console.log(`  Insertados: ${stats.contactsInserted} | Mapa: ${phoneToContactId.size}`);

  // ==============================================================
  // STEP 2: PREPARE ALL ORDER ROWS (3 arrays)
  // ==============================================================
  console.log('\n=== STEP 2: PREPARE ORDER ROWS ===');

  // Arrays of {row, biginVentaId} for linking
  const ventaRows: { row: any; biginVentaId: string; amount: number; modifiedTime: string }[] = [];
  const logRows: { row: any; biginVentaId: string; biginLogId: string }[] = [];
  const envRows: { row: any; biginLogId: string }[] = [];

  // From order-groups (skip 392 groups with null venta — those are standalone log/env)
  let skippedNullVenta = 0;
  for (const group of orderGroups) {
    if (!group.venta) { skippedNullVenta++; continue; }
    const venta: BiginDeal = group.venta;
    const logistica: BiginDeal | null = group.logistica;
    const envios: BiginDeal | null = group.envios_somnio;

    const phone = normalizePhone(venta.Telefono);
    const contactId = phone ? phoneToContactId.get(phone) || null : null;

    const ventaStageId = VENTAS_STAGE_MAP[venta.Stage];
    if (!ventaStageId) {
      errorLog.push({ step: 'prep-venta', id: venta.id, error: `Unknown stage: ${venta.Stage}` });
      stats.ventasErrors++;
      continue;
    }

    ventaRows.push({
      row: dealToOrderRow(venta, PIPELINE_VENTAS, ventaStageId, contactId, null),
      biginVentaId: venta.id,
      amount: venta.Amount || 0,
      modifiedTime: venta.Modified_Time,
    });

    if (logistica) {
      const logStageId = LOGISTICA_STAGE_MAP[logistica.Stage];
      if (!logStageId) {
        errorLog.push({ step: 'prep-log', id: logistica.id, error: `Unknown stage: ${logistica.Stage}` });
        stats.logisticaErrors++;
      } else {
        logRows.push({
          row: dealToOrderRow(logistica, PIPELINE_LOGISTICA, logStageId, contactId, null), // source_order_id set later
          biginVentaId: venta.id,
          biginLogId: logistica.id,
        });

        if (envios) {
          const envStageId = ENVIOS_STAGE_MAP[envios.Stage];
          if (!envStageId) {
            errorLog.push({ step: 'prep-env', id: envios.id, error: `Unknown stage: ${envios.Stage}` });
            stats.enviosErrors++;
          } else {
            envRows.push({
              row: dealToOrderRow(envios, PIPELINE_ENVIOS, envStageId, contactId, null), // source_order_id set later
              biginLogId: logistica.id,
            });
          }
        }
      }
    }
  }

  // Add standalone ventas
  const ventasSinLog = unmatched.ventasSinLogistica;
  for (const item of ventasSinLog) {
    const rawDeal = rawDealsMap.get(item.id);
    const stageId = VENTAS_STAGE_MAP[item.stage];
    if (!stageId) { errorLog.push({ step: 'prep-standalone-v', id: item.id, error: `Unknown stage: ${item.stage}` }); stats.ventasErrors++; continue; }
    const phone = normalizePhone(item.phone);
    const contactId = phone ? phoneToContactId.get(phone) || null : null;

    if (rawDeal) {
      ventaRows.push({ row: dealToOrderRow(rawDeal, PIPELINE_VENTAS, stageId, contactId, null), biginVentaId: rawDeal.id, amount: rawDeal.Amount || 0, modifiedTime: rawDeal.Modified_Time });
    } else {
      ventaRows.push({
        row: { workspace_id: WS_ID, contact_id: contactId, pipeline_id: PIPELINE_VENTAS, stage_id: stageId, name: item.name, total_value: 0, custom_fields: { bigin_id: item.id }, created_at: item.created, updated_at: item.created },
        biginVentaId: item.id, amount: 0, modifiedTime: item.created,
      });
    }
  }

  // Add standalone logísticas (6)
  const standaloneLog = rematchCandidates.logisticaSinVenta.filter(
    (c: any) => c.recommendation === 'truly_unmatched' || c.recommendation === 'review'
  );
  const standaloneLogRows: any[] = [];
  for (const item of standaloneLog) {
    const rawDeal = rawDealsMap.get(item.id);
    const stageId = LOGISTICA_STAGE_MAP[item.stage];
    if (!stageId) { errorLog.push({ step: 'prep-standalone-l', id: item.id, error: `Unknown stage: ${item.stage}` }); stats.logisticaErrors++; continue; }
    const phone = normalizePhone(item.phone);
    const contactId = phone ? phoneToContactId.get(phone) || null : null;
    standaloneLogRows.push(
      rawDeal
        ? dealToOrderRow(rawDeal, PIPELINE_LOGISTICA, stageId, contactId, null)
        : { workspace_id: WS_ID, contact_id: contactId, pipeline_id: PIPELINE_LOGISTICA, stage_id: stageId, name: item.name, total_value: 0, custom_fields: { bigin_id: item.id }, created_at: item.created, updated_at: item.created }
    );
  }

  // Add standalone envíos (39)
  const standaloneEnv = rematchCandidates.enviosSinLogistica.filter(
    (c: any) => c.recommendation === 'truly_unmatched'
  );
  const standaloneEnvRows: any[] = [];
  for (const item of standaloneEnv) {
    const rawDeal = rawDealsMap.get(item.id);
    const stageId = ENVIOS_STAGE_MAP[item.stage];
    if (!stageId) { errorLog.push({ step: 'prep-standalone-e', id: item.id, error: `Unknown stage: ${item.stage}` }); stats.enviosErrors++; continue; }
    const phone = normalizePhone(item.phone);
    const contactId = phone ? phoneToContactId.get(phone) || null : null;
    standaloneEnvRows.push(
      rawDeal
        ? dealToOrderRow(rawDeal, PIPELINE_ENVIOS, stageId, contactId, null)
        : { workspace_id: WS_ID, contact_id: contactId, pipeline_id: PIPELINE_ENVIOS, stage_id: stageId, name: item.name, total_value: 0, custom_fields: { bigin_id: item.id }, created_at: item.created, updated_at: item.created }
    );
  }

  console.log(`  Skipped null-venta groups: ${skippedNullVenta}`);
  console.log(`  Ventas: ${ventaRows.length} | Logísticas: ${logRows.length} + ${standaloneLogRows.length} | Envíos: ${envRows.length} + ${standaloneEnvRows.length}`);

  // ==============================================================
  // STEP 3: BATCH INSERT VENTAS
  // ==============================================================
  console.log('\n=== STEP 3: INSERT VENTAS ===');
  const allVentaRowsOnly = ventaRows.map(v => v.row);
  const ventaResults = await batchInsert(allVentaRowsOnly, 'ventas', 'ventasCreated');

  // Build bigin_venta_id → morfx_id map
  const biginVentaToMorfx = new Map<string, string>();
  for (const r of ventaResults) {
    if (r.bigin_id) biginVentaToMorfx.set(r.bigin_id, r.id);
  }
  console.log(`  Map bigin→morfx: ${biginVentaToMorfx.size}`);

  // ==============================================================
  // STEP 4: BATCH INSERT LOGÍSTICAS (set source_order_id)
  // ==============================================================
  console.log('\n=== STEP 4: INSERT LOGÍSTICAS ===');

  // Set source_order_id from venta map
  for (const lr of logRows) {
    const ventaMorfxId = biginVentaToMorfx.get(lr.biginVentaId);
    if (ventaMorfxId) {
      lr.row.source_order_id = ventaMorfxId;
    } else {
      // Venta failed, insert logística without link
      errorLog.push({ step: 'log-link', id: lr.biginLogId, error: `Venta ${lr.biginVentaId} not found in map` });
    }
  }

  const allLogRows = [...logRows.map(l => l.row), ...standaloneLogRows];
  const logResults = await batchInsert(allLogRows, 'logística', 'logisticaCreated');

  // Build bigin_log_id → morfx_id map
  const biginLogToMorfx = new Map<string, string>();
  for (const r of logResults) {
    if (r.bigin_id) biginLogToMorfx.set(r.bigin_id, r.id);
  }
  console.log(`  Map log bigin→morfx: ${biginLogToMorfx.size}`);

  // ==============================================================
  // STEP 5: BATCH INSERT ENVÍOS (set source_order_id)
  // ==============================================================
  console.log('\n=== STEP 5: INSERT ENVÍOS ===');

  for (const er of envRows) {
    const logMorfxId = biginLogToMorfx.get(er.biginLogId);
    if (logMorfxId) {
      er.row.source_order_id = logMorfxId;
    } else {
      errorLog.push({ step: 'env-link', id: er.row.custom_fields?.bigin_id, error: `Log ${er.biginLogId} not found` });
    }
  }

  const allEnvRows = [...envRows.map(e => e.row), ...standaloneEnvRows];
  await batchInsert(allEnvRows, 'envíos', 'enviosCreated');

  // ==============================================================
  // STEP 6: ASSIGN PRODUCTS
  // ==============================================================
  console.log('\n=== STEP 6: PRODUCTS ===');

  const ventasWithProducts: { orderId: string; amount: number; modifiedTime: string }[] = [];
  for (let i = 0; i < ventaRows.length; i++) {
    const v = ventaRows[i];
    if (v.amount && PRODUCT_MAP[v.amount]) {
      const morfxId = biginVentaToMorfx.get(v.biginVentaId);
      if (morfxId) {
        ventasWithProducts.push({ orderId: morfxId, amount: v.amount, modifiedTime: v.modifiedTime });
      }
    }
  }
  console.log(`  ${ventasWithProducts.length} ventas con producto`);

  for (let i = 0; i < ventasWithProducts.length; i += BATCH) {
    const batch = ventasWithProducts.slice(i, i + BATCH);
    const rows = batch.map(v => {
      const p = PRODUCT_MAP[v.amount];
      return { order_id: v.orderId, product_id: p.id, sku: p.sku, title: p.title, unit_price: p.price, quantity: 1 };
    });

    const { error } = await supabase.from('order_products').insert(rows);
    if (error) {
      for (const row of rows) {
        const { error: e } = await supabase.from('order_products').insert(row);
        if (e) errorLog.push({ step: 'product', id: row.order_id, error: e.message });
        else stats.productsAssigned++;
      }
    } else {
      stats.productsAssigned += rows.length;
    }
    if (i % 2000 === 0) console.log(`  ${Math.min(i + batch.length, ventasWithProducts.length)}/${ventasWithProducts.length}`);
  }
  console.log(`  Productos: ${stats.productsAssigned}`);

  // ==============================================================
  // STEP 7: FIX updated_at
  // ==============================================================
  console.log('\n=== STEP 7: FIX updated_at ===');

  for (let i = 0; i < ventasWithProducts.length; i += BATCH) {
    const batch = ventasWithProducts.slice(i, i + BATCH);
    // Individual updates (no batch update with different values in Supabase)
    for (const v of batch) {
      const { error } = await supabase.from('orders').update({ updated_at: v.modifiedTime }).eq('id', v.orderId);
      if (error) errorLog.push({ step: 'fix-updated', id: v.orderId, error: error.message });
      else stats.updatedAtFixed++;
    }
    if (i % 2000 === 0) console.log(`  ${Math.min(i + batch.length, ventasWithProducts.length)}/${ventasWithProducts.length}`);
  }
  console.log(`  Fixed: ${stats.updatedAtFixed}`);

  // ==============================================================
  // STEP 8: VERIFICATION
  // ==============================================================
  console.log('\n=== STEP 8: VERIFICACIÓN ===');

  const { count: totalC } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID);
  const { count: totalO } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID);
  const { count: biginO } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID).not('custom_fields->>bigin_id', 'is', null);
  const { count: linked } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID).not('source_order_id', 'is', null);
  const { count: noCtc } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID).is('contact_id', null).not('custom_fields->>bigin_id', 'is', null);
  const { count: totalOP } = await supabase.from('order_products').select('*', { count: 'exact', head: true });

  for (const [name, id] of [['Ventas', PIPELINE_VENTAS], ['Logística', PIPELINE_LOGISTICA], ['Envíos', PIPELINE_ENVIOS]] as const) {
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID).eq('pipeline_id', id).not('custom_fields->>bigin_id', 'is', null);
    console.log(`  ${name}: ${count} órdenes migradas`);
  }

  console.log(`\n  Total contactos: ${totalC}`);
  console.log(`  Total órdenes: ${totalO} (bigin: ${biginO})`);
  console.log(`  Vinculadas: ${linked}`);
  console.log(`  Sin contacto: ${noCtc}`);
  console.log(`  Products: ${totalOP}`);
  console.log('\n  Stats:', JSON.stringify(stats, null, 2));

  if (errorLog.length > 0) {
    console.log(`\n  Errores (${errorLog.length}):`);
    for (const e of errorLog.slice(0, 30)) console.log(`    [${e.step}] ${e.id}: ${e.error}`);
    if (errorLog.length > 30) console.log(`    ... y ${errorLog.length - 30} más`);
  }

  const logDir = path.resolve(__dirname, 'data/upload-log');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.resolve(logDir, 'migration-results.json'),
    JSON.stringify({ stats, errors: errorLog, timestamp: new Date().toISOString() }, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== MIGRACIÓN COMPLETADA en ${elapsed} minutos ===`);
}

main().catch(console.error);
