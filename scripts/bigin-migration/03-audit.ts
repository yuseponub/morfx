/**
 * Phase 3A: Audit Supabase production state before migration
 * Reads workspace, pipelines, stages, products, and contact counts
 * Does NOT insert anything — read-only audit
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually (no dotenv dependency)
const envPath = path.resolve(__dirname, '../../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  process.env[key] = val;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
  console.log('=== FASE 3A: AUDITORÍA DE SUPABASE PRODUCCIÓN ===\n');

  // 1. Workspace
  console.log('--- 1. WORKSPACE ---');
  const { data: workspaces, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, name')
    .ilike('name', '%somnio%');

  if (wsErr) throw wsErr;
  console.log('Workspaces encontrados:', workspaces);

  if (!workspaces || workspaces.length === 0) {
    console.error('No se encontró workspace Somnio');
    return;
  }

  const workspaceId = workspaces[0].id;
  console.log(`\nWorkspace ID: ${workspaceId}\n`);

  // 2. Pipelines y Stages
  console.log('--- 2. PIPELINES Y STAGES ---');
  const { data: pipelines, error: pipErr } = await supabase
    .from('pipelines')
    .select('id, name, position')
    .eq('workspace_id', workspaceId)
    .order('position');

  if (pipErr) throw pipErr;

  for (const pipeline of pipelines || []) {
    console.log(`\n📋 Pipeline: ${pipeline.name} (${pipeline.id})`);

    const { data: stages, error: stErr } = await supabase
      .from('pipeline_stages')
      .select('id, name, position, is_closed')
      .eq('pipeline_id', pipeline.id)
      .order('position');

    if (stErr) throw stErr;

    for (const stage of stages || []) {
      // Count orders in this stage
      const { count, error: countErr } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', stage.id);

      if (countErr) throw countErr;

      const closedLabel = stage.is_closed ? ' [CLOSED]' : '';
      console.log(`  ${stage.position}. ${stage.name} | ID: ${stage.id} | is_closed: ${stage.is_closed}${closedLabel} | Órdenes: ${count}`);
    }
  }

  // 3. Productos
  console.log('\n\n--- 3. PRODUCTOS ---');
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, sku, title, price, is_active')
    .eq('workspace_id', workspaceId)
    .order('sku');

  if (prodErr) throw prodErr;
  console.log('Productos existentes:');
  for (const p of products || []) {
    console.log(`  SKU: ${p.sku} | ${p.title} | $${p.price} | active: ${p.is_active} | ID: ${p.id}`);
  }
  if (!products || products.length === 0) {
    console.log('  (ninguno)');
  }

  // 4. Contactos
  console.log('\n--- 4. CONTACTOS ---');
  const { count: contactCount, error: contErr } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  if (contErr) throw contErr;
  console.log(`Total contactos existentes: ${contactCount}`);

  // 5. Órdenes totales
  console.log('\n--- 5. ÓRDENES TOTALES ---');
  const { count: orderCount, error: ordErr } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  if (ordErr) throw ordErr;
  console.log(`Total órdenes existentes: ${orderCount}`);

  // Count orders with source_order_id
  const { count: linkedCount, error: linkErr } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .not('source_order_id', 'is', null);

  if (linkErr) throw linkErr;
  console.log(`Órdenes vinculadas (source_order_id): ${linkedCount}`);

  // Count orders with bigin_id in custom_fields
  const { count: biginCount, error: biginErr } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .not('custom_fields->bigin_id', 'is', null);

  if (biginErr) throw biginErr;
  console.log(`Órdenes con bigin_id (ya migradas): ${biginCount}`);

  console.log('\n=== AUDITORÍA COMPLETADA ===');
}

audit().catch(console.error);
