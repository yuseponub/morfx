/**
 * Phase 3B Test: Insert custom field definitions + 1 complete order-group
 * Test subject: Anibal Ortiz Acero (+573143363303)
 * Group: venta (CONFIRMA) → logística (SOMNIO ENVIOS) → envíos (ENTREGADO)
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

// Stage mapping: Bigin stage name → MorfX stage_id
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

// Pipeline IDs
const PIPELINE_VENTAS = 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8';
const PIPELINE_LOGISTICA = 'b1c955ab-1ef9-4b0e-a7e6-e4dec37d9597';
const PIPELINE_ENVIOS = '02d98c52-92f9-4c54-9dfc-c3b2164bf72f';

// Product mapping: Amount → product
const PRODUCT_MAP: Record<number, { id: string; sku: string; title: string; price: number }> = {
  77900:  { id: '7e669b44-f438-4c24-97a3-373b17d37171', sku: '001', title: 'Elixir', price: 77900 },
  109900: { id: 'c24407ea-94eb-49ea-b96c-f6d15fb07bb7', sku: '002', title: '2 X ELIXIR DEL SUEÑO', price: 109900 },
  139900: { id: 'a1a0c632-23ea-4368-8cda-116145fba8d6', sku: '003', title: '3 X ELIXIR DEL SUEÑO', price: 139900 },
};

async function main() {
  console.log('=== FASE 3B TEST: 1 ORDER-GROUP COMPLETO ===\n');

  // -------------------------------------------------------
  // PART A: Create custom field definitions
  // -------------------------------------------------------
  console.log('--- A) CUSTOM FIELD DEFINITIONS ---');

  const fieldDefs = [
    // Contact fields
    { name: 'Callbell ID', key: 'callbell_id', field_type: 'text', display_order: 1 },
    { name: 'Bigin Match Method', key: 'bigin_match_method', field_type: 'text', display_order: 2 },
    { name: 'Historial de Direcciones', key: 'all_addresses', field_type: 'text', display_order: 3 },
    // Order fields
    { name: 'Bigin ID', key: 'bigin_id', field_type: 'text', display_order: 10 },
    { name: 'Bigin Callbell', key: 'bigin_callbell', field_type: 'text', display_order: 11 },
  ];

  for (const def of fieldDefs) {
    const { data, error } = await supabase
      .from('custom_field_definitions')
      .upsert(
        { workspace_id: WS_ID, ...def },
        { onConflict: 'workspace_id,key' }
      )
      .select()
      .single();

    if (error) {
      console.log(`  ERROR creating ${def.key}:`, error.message);
    } else {
      console.log(`  Created: ${def.key} → ${data.id}`);
    }
  }

  // -------------------------------------------------------
  // PART B: Insert 1 complete order-group
  // -------------------------------------------------------
  console.log('\n--- B) TEST INSERT: Anibal Ortiz Acero ---\n');

  // Contact data from normalized contacts.json
  const contactData = {
    phone: '+573143363303',
    name: 'Anibal Ortiz Acero',
    email: 'Ortizacero1@hotmail.com',
    address: 'Transversal 70g # 78-31 barrio bonanza',
    city: 'Bogotá',
    department: 'Cundinamarca',
    callbell_id: '92524205',
    match_method: 'phone+callbell',
    all_addresses: [
      { address: 'Transversal 70g # 78-31 barrio bonanza', city: 'Bogotá', department: 'Cundinamarca' },
      { address: 'Transversal 70g- # 78-31 bonanza', city: 'Bogotá', department: 'Cundinamarca' },
    ],
  };

  // Step 1: Upsert contact
  console.log('1. Upserting contact...');
  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .upsert(
      {
        workspace_id: WS_ID,
        phone: contactData.phone,
        name: contactData.name,
        email: contactData.email,
        address: contactData.address,
        city: contactData.city,
        department: contactData.department,
        custom_fields: {
          callbell_id: contactData.callbell_id,
          bigin_match_method: contactData.match_method,
          all_addresses: JSON.stringify(contactData.all_addresses),
        },
      },
      { onConflict: 'workspace_id,phone' }
    )
    .select()
    .single();

  if (contactErr) {
    console.log('  ERROR:', contactErr.message);
    return;
  }
  console.log(`  Contact ID: ${contact.id}`);
  console.log(`  Name: ${contact.name}, Phone: ${contact.phone}`);

  const contactId = contact.id;

  // Step 2: Create Venta order
  console.log('\n2. Creating Venta order (CONFIRMA)...');
  const ventaDeal = {
    biginId: '6331846000008761434',
    name: 'Anibal Ortiz Acero',
    description: 'wpp',
    stage: 'CONFIRMA',
    amount: 77900,
    callbell: 'https://dash.callbell.eu/chat/92524205',
    address: 'Transversal 70g- # 78-31 bonanza',
    city: 'Bogotá',
    department: 'Cundinamarca',
    carrier: null as string | null,
    guia: null as string | null,
    createdTime: '2024-08-15T10:35:04-05:00',
    modifiedTime: '2024-08-15T11:52:28-05:00',
    closingDate: '2024-08-15',
  };

  const ventaStageId = VENTAS_STAGE_MAP[ventaDeal.stage];
  if (!ventaStageId) {
    console.log(`  ERROR: No stage mapping for "${ventaDeal.stage}"`);
    return;
  }

  const { data: ventaOrder, error: ventaErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: WS_ID,
      contact_id: contactId,
      pipeline_id: PIPELINE_VENTAS,
      stage_id: ventaStageId,
      name: ventaDeal.name,
      total_value: ventaDeal.amount,
      description: ventaDeal.description,
      carrier: ventaDeal.carrier,
      tracking_number: ventaDeal.guia,
      shipping_address: ventaDeal.address,
      shipping_city: ventaDeal.city,
      shipping_department: ventaDeal.department,
      closing_date: ventaDeal.closingDate,
      custom_fields: {
        bigin_id: ventaDeal.biginId,
        bigin_callbell: ventaDeal.callbell,
      },
      created_at: ventaDeal.createdTime,
      updated_at: ventaDeal.modifiedTime,
    })
    .select()
    .single();

  if (ventaErr) {
    console.log('  ERROR:', ventaErr.message);
    return;
  }
  console.log(`  Venta ID: ${ventaOrder.id}`);
  console.log(`  Stage: ${ventaDeal.stage} → ${ventaStageId}`);
  console.log(`  Amount: $${ventaOrder.total_value}`);
  console.log(`  created_at: ${ventaOrder.created_at}`);

  // Step 3: Create Logística order
  console.log('\n3. Creating Logística order (SOMNIO ENVIOS)...');
  const logDeal = {
    biginId: '6331846000008762631',
    name: 'Anibal Ortiz Acero',
    description: 'wpp',
    stage: 'SOMNIO ENVIOS',
    amount: 77900,
    callbell: 'https://dash.callbell.eu/chat/92524205',
    address: 'Transversal 70g- # 78-31 bonanza',
    city: 'Bogotá',
    department: 'Cundinamarca',
    carrier: null as string | null,
    guia: null as string | null,
    createdTime: '2024-08-15T11:52:29-05:00',
    modifiedTime: '2024-08-15T12:17:54-05:00',
    closingDate: '2024-08-15',
  };

  const logStageId = LOGISTICA_STAGE_MAP[logDeal.stage];
  if (!logStageId) {
    console.log(`  ERROR: No stage mapping for "${logDeal.stage}"`);
    return;
  }

  const { data: logOrder, error: logErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: WS_ID,
      contact_id: contactId,
      pipeline_id: PIPELINE_LOGISTICA,
      stage_id: logStageId,
      name: logDeal.name,
      total_value: logDeal.amount,
      description: logDeal.description,
      carrier: logDeal.carrier,
      tracking_number: logDeal.guia,
      shipping_address: logDeal.address,
      shipping_city: logDeal.city,
      shipping_department: logDeal.department,
      closing_date: logDeal.closingDate,
      source_order_id: ventaOrder.id,  // ← linked to venta
      custom_fields: {
        bigin_id: logDeal.biginId,
        bigin_callbell: logDeal.callbell,
      },
      created_at: logDeal.createdTime,
      updated_at: logDeal.modifiedTime,
    })
    .select()
    .single();

  if (logErr) {
    console.log('  ERROR:', logErr.message);
    return;
  }
  console.log(`  Logística ID: ${logOrder.id}`);
  console.log(`  source_order_id: ${logOrder.source_order_id} (→ venta)`);
  console.log(`  Stage: ${logDeal.stage} → ${logStageId}`);

  // Step 4: Create Envíos Somnio order
  console.log('\n4. Creating Envíos Somnio order (ENTREGADO)...');
  const envDeal = {
    biginId: '6331846000008788482',
    name: 'Anibal Ortiz Acero',
    description: 'wpp',
    stage: 'ENTREGADO',
    amount: 77900,
    callbell: 'https://dash.callbell.eu/chat/92524205',
    address: 'Transversal 70g- # 78-31 bonanza',
    city: 'Bogotá',
    department: 'Cundinamarca',
    carrier: null as string | null,
    guia: null as string | null,
    createdTime: '2024-08-15T12:17:55-05:00',
    modifiedTime: '2024-08-17T10:33:13-05:00',
    closingDate: '2024-08-15',
  };

  const envStageId = ENVIOS_STAGE_MAP[envDeal.stage];
  if (!envStageId) {
    console.log(`  ERROR: No stage mapping for "${envDeal.stage}"`);
    return;
  }

  const { data: envOrder, error: envErr } = await supabase
    .from('orders')
    .insert({
      workspace_id: WS_ID,
      contact_id: contactId,
      pipeline_id: PIPELINE_ENVIOS,
      stage_id: envStageId,
      name: envDeal.name,
      total_value: envDeal.amount,
      description: envDeal.description,
      carrier: envDeal.carrier,
      tracking_number: envDeal.guia,
      shipping_address: envDeal.address,
      shipping_city: envDeal.city,
      shipping_department: envDeal.department,
      closing_date: envDeal.closingDate,
      source_order_id: logOrder.id,  // ← linked to logística
      custom_fields: {
        bigin_id: envDeal.biginId,
        bigin_callbell: envDeal.callbell,
      },
      created_at: envDeal.createdTime,
      updated_at: envDeal.modifiedTime,
    })
    .select()
    .single();

  if (envErr) {
    console.log('  ERROR:', envErr.message);
    return;
  }
  console.log(`  Envíos ID: ${envOrder.id}`);
  console.log(`  source_order_id: ${envOrder.source_order_id} (→ logística)`);
  console.log(`  Stage: ${envDeal.stage} → ${envStageId}`);

  // Step 5: Assign product (Amount = 77900 → SKU 001)
  console.log('\n5. Assigning product (77900 → SKU 001)...');
  const product = PRODUCT_MAP[ventaDeal.amount];
  if (product) {
    const { data: op, error: opErr } = await supabase
      .from('order_products')
      .insert({
        order_id: ventaOrder.id,
        product_id: product.id,
        sku: product.sku,
        title: product.title,
        unit_price: product.price,
        quantity: 1,
      })
      .select()
      .single();

    if (opErr) {
      console.log('  ERROR:', opErr.message);
    } else {
      console.log(`  order_product ID: ${op.id}`);
      console.log(`  product: ${product.sku} - ${product.title} @ $${product.price}`);
    }
  } else {
    console.log(`  No product mapping for amount ${ventaDeal.amount}`);
  }

  // -------------------------------------------------------
  // VERIFICATION
  // -------------------------------------------------------
  console.log('\n--- VERIFICACIÓN ---\n');

  // Verify contact
  const { data: verContact } = await supabase
    .from('contacts')
    .select('id, name, phone, email, address, city, department, custom_fields')
    .eq('id', contactId)
    .single();
  console.log('Contact:', JSON.stringify(verContact, null, 2));

  // Verify orders chain
  const { data: verOrders } = await supabase
    .from('orders')
    .select('id, name, pipeline_id, stage_id, total_value, source_order_id, carrier, tracking_number, shipping_address, shipping_city, shipping_department, custom_fields, created_at, updated_at, closing_date')
    .in('id', [ventaOrder.id, logOrder.id, envOrder.id])
    .order('created_at');
  console.log('\nOrders chain:');
  for (const o of verOrders || []) {
    const pipelineName =
      o.pipeline_id === PIPELINE_VENTAS ? 'Ventas' :
      o.pipeline_id === PIPELINE_LOGISTICA ? 'Logística' :
      o.pipeline_id === PIPELINE_ENVIOS ? 'Envíos' : 'Unknown';
    console.log(`\n  [${pipelineName}] ${o.id}`);
    console.log(`    name: ${o.name}`);
    console.log(`    total_value: ${o.total_value}`);
    console.log(`    source_order_id: ${o.source_order_id || '(none - root)'}`);
    console.log(`    shipping: ${o.shipping_address}, ${o.shipping_city}, ${o.shipping_department}`);
    console.log(`    custom_fields: ${JSON.stringify(o.custom_fields)}`);
    console.log(`    created_at: ${o.created_at} | updated_at: ${o.updated_at}`);
    console.log(`    closing_date: ${o.closing_date}`);
  }

  // Verify order_products
  const { data: verProducts } = await supabase
    .from('order_products')
    .select('id, order_id, product_id, sku, title, unit_price, quantity, subtotal')
    .eq('order_id', ventaOrder.id);
  console.log('\nOrder products:', JSON.stringify(verProducts, null, 2));

  // Total counts
  const { count: totalContacts } = await supabase
    .from('contacts').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID);
  const { count: totalOrders } = await supabase
    .from('orders').select('*', { count: 'exact', head: true }).eq('workspace_id', WS_ID);
  console.log(`\nTotals after test: ${totalContacts} contacts, ${totalOrders} orders`);

  console.log('\n=== TEST COMPLETADO ===');
}

main().catch(console.error);
