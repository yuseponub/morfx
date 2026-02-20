/**
 * 06-tag-confirmado.ts
 *
 * Finds orders in Bigin data that had tag "CONFIRMADO" in Sub_Pipeline "Ventas Somnio Standard"
 * with Stage "CONFIRMA", then assigns tag "C" to the corresponding MorfX orders.
 *
 * Steps:
 *   1. Read pipelines.json, filter matching records, extract bigin_ids
 *   2. Query MorfX for orders with those bigin_ids
 *   3. Show verification report
 *   4. Ask for confirmation before writing
 *   5. Find/create tag "C" in workspace
 *   6. Assign tag "C" via order_tags junction table
 *   7. Save log
 *
 * Usage: npx tsx scripts/bigin-migration/06-tag-confirmado.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// --- Load .env.local ---
const envPath = path.resolve(__dirname, '../../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  process.env[t.slice(0, eq)] = t.slice(eq + 1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Constants ---
const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490';
const PIPELINE_VENTAS = 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8';
const BATCH = 200;

// --- Helpers ---

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

interface BiginDeal {
  id: string;
  Deal_Name: string;
  Stage: string;
  Sub_Pipeline: string;
  Tag: Array<{ name: string; id: string; color_code: string }> | null;
  [key: string]: any;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('=== 06-tag-confirmado: Asignar tag "C" a órdenes CONFIRMADO de Bigin ===\n');

  // -----------------------------------------------------------------------
  // Step 1: Read and filter Bigin data
  // -----------------------------------------------------------------------
  console.log('Paso 1: Leyendo pipelines.json...');
  const dataPath = path.resolve(__dirname, 'data/pipelines.json');
  const raw: BiginDeal[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`  Total records en pipelines.json: ${raw.length}`);

  const filtered = raw.filter((deal) => {
    if (deal.Sub_Pipeline !== 'Ventas Somnio Standard') return false;
    if (deal.Stage !== 'CONFIRMA') return false;
    if (!deal.Tag || !Array.isArray(deal.Tag)) return false;
    return deal.Tag.some((t) => t.name.toUpperCase() === 'CONFIRMADO');
  });

  console.log(`  Filtrados (Sub_Pipeline=Ventas Somnio Standard, Stage=CONFIRMA, Tag=CONFIRMADO): ${filtered.length}`);

  if (filtered.length === 0) {
    console.log('\nNo se encontraron registros. Saliendo.');
    return;
  }

  const biginIds = filtered.map((d) => d.id);
  console.log(`  Bigin IDs extraídos: ${biginIds.length}`);
  console.log(`  Primeros 5: ${biginIds.slice(0, 5).join(', ')}`);

  // -----------------------------------------------------------------------
  // Step 2: Query MorfX for matching orders
  // -----------------------------------------------------------------------
  console.log('\nPaso 2: Buscando órdenes en MorfX con esos bigin_ids...');

  // Supabase .in() has a practical limit; query in batches
  const morfxOrders: Array<{ id: string; name: string; bigin_id: string; pipeline_id: string; stage_id: string }> = [];

  for (let i = 0; i < biginIds.length; i += BATCH) {
    const chunk = biginIds.slice(i, i + BATCH);

    // Use raw SQL filter for custom_fields->>'bigin_id'
    const { data, error } = await supabase
      .from('orders')
      .select('id, name, pipeline_id, stage_id, custom_fields')
      .eq('workspace_id', WS_ID)
      .eq('pipeline_id', PIPELINE_VENTAS)
      .in('custom_fields->>bigin_id', chunk);

    if (error) {
      console.error(`  Error en batch ${i}: ${error.message}`);
      continue;
    }

    if (data) {
      for (const row of data) {
        morfxOrders.push({
          id: row.id,
          name: row.name,
          bigin_id: (row.custom_fields as any)?.bigin_id ?? '',
          pipeline_id: row.pipeline_id,
          stage_id: row.stage_id,
        });
      }
    }

    if ((i + BATCH) % 1000 === 0) {
      console.log(`  Procesados ${Math.min(i + BATCH, biginIds.length)}/${biginIds.length}...`);
    }
  }

  console.log(`  Órdenes encontradas en MorfX: ${morfxOrders.length}/${biginIds.length}`);

  // -----------------------------------------------------------------------
  // Step 3: Verification report
  // -----------------------------------------------------------------------
  console.log('\nPaso 3: Verificación...');

  const foundBiginIds = new Set(morfxOrders.map((o) => o.bigin_id));
  const missingBiginIds = biginIds.filter((id) => !foundBiginIds.has(id));

  // Sanity check: compare names
  const biginNameMap = new Map(filtered.map((d) => [d.id, d.Deal_Name]));
  let nameMatches = 0;
  let nameMismatches = 0;
  const mismatchSamples: Array<{ bigin_id: string; bigin_name: string; morfx_name: string }> = [];

  for (const order of morfxOrders) {
    const biginName = biginNameMap.get(order.bigin_id);
    if (biginName && biginName === order.name) {
      nameMatches++;
    } else {
      nameMismatches++;
      if (mismatchSamples.length < 5) {
        mismatchSamples.push({
          bigin_id: order.bigin_id,
          bigin_name: biginName ?? '(no encontrado)',
          morfx_name: order.name ?? '(null)',
        });
      }
    }
  }

  console.log(`  Encontrados en MorfX: ${morfxOrders.length}`);
  console.log(`  No encontrados (bigin_id sin match): ${missingBiginIds.length}`);
  console.log(`  Nombres coinciden: ${nameMatches}`);
  console.log(`  Nombres diferentes: ${nameMismatches}`);

  if (mismatchSamples.length > 0) {
    console.log('  Ejemplos de nombres diferentes:');
    for (const s of mismatchSamples) {
      console.log(`    bigin_id=${s.bigin_id}: Bigin="${s.bigin_name}" vs MorfX="${s.morfx_name}"`);
    }
  }

  if (missingBiginIds.length > 0) {
    console.log(`  Primeros 10 bigin_ids sin match: ${missingBiginIds.slice(0, 10).join(', ')}`);
  }

  if (morfxOrders.length === 0) {
    console.log('\nNo hay órdenes para actualizar. Saliendo.');
    return;
  }

  // -----------------------------------------------------------------------
  // Step 4: Ask confirmation
  // -----------------------------------------------------------------------
  const proceed = await askConfirmation(
    `\n¿Asignar tag "C" a ${morfxOrders.length} órdenes en MorfX? (y/N): `
  );

  if (!proceed) {
    console.log('Cancelado por el usuario.');
    return;
  }

  // -----------------------------------------------------------------------
  // Step 5: Find or create tag "C"
  // -----------------------------------------------------------------------
  console.log('\nPaso 5: Buscando tag "C" en workspace...');

  let tagId: string;
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id, name, color')
    .eq('workspace_id', WS_ID)
    .eq('name', 'C')
    .single();

  if (existingTag) {
    tagId = existingTag.id;
    console.log(`  Tag "C" encontrado: ${tagId} (color: ${existingTag.color})`);
  } else {
    console.log('  Tag "C" no existe. Creándolo...');
    const { data: newTag, error: createErr } = await supabase
      .from('tags')
      .insert({ workspace_id: WS_ID, name: 'C', color: '#A8E8AD' })
      .select('id')
      .single();

    if (createErr || !newTag) {
      console.error(`  Error creando tag: ${createErr?.message}`);
      return;
    }
    tagId = newTag.id;
    console.log(`  Tag "C" creado: ${tagId}`);
  }

  // -----------------------------------------------------------------------
  // Step 6: Assign tag "C" to all matched orders
  // -----------------------------------------------------------------------
  console.log('\nPaso 6: Asignando tag "C" a órdenes...');

  let assigned = 0;
  let alreadyAssigned = 0;
  let errors = 0;
  const errorDetails: Array<{ order_id: string; error: string }> = [];

  const orderIds = morfxOrders.map((o) => o.id);

  for (let i = 0; i < orderIds.length; i += BATCH) {
    const chunk = orderIds.slice(i, i + BATCH);
    const rows = chunk.map((orderId) => ({ order_id: orderId, tag_id: tagId }));

    const { error: insertError, count } = await supabase
      .from('order_tags')
      .upsert(rows, { onConflict: 'order_id,tag_id', ignoreDuplicates: true })
      .select('order_id');

    if (insertError) {
      // Retry individually
      console.log(`  Batch ${i} error: ${insertError.message} — reintentando individualmente...`);
      for (const row of rows) {
        const { error: singleErr } = await supabase
          .from('order_tags')
          .insert(row);

        if (singleErr) {
          if (singleErr.code === '23505') {
            alreadyAssigned++;
          } else {
            errors++;
            if (errorDetails.length < 20) {
              errorDetails.push({ order_id: row.order_id, error: singleErr.message });
            }
          }
        } else {
          assigned++;
        }
      }
    } else {
      assigned += chunk.length;
    }

    if ((i + BATCH) % 1000 === 0 || i + BATCH >= orderIds.length) {
      console.log(`  Progreso: ${Math.min(i + BATCH, orderIds.length)}/${orderIds.length}`);
    }
  }

  // -----------------------------------------------------------------------
  // Step 7: Save log
  // -----------------------------------------------------------------------
  console.log('\n=== RESULTADO ===');
  console.log(`  Total bigin con CONFIRMADO: ${filtered.length}`);
  console.log(`  Encontrados en MorfX: ${morfxOrders.length}`);
  console.log(`  Tag "C" asignado: ${assigned}`);
  console.log(`  Ya tenían tag "C": ${alreadyAssigned}`);
  console.log(`  Errores: ${errors}`);

  const logData = {
    timestamp: new Date().toISOString(),
    tagName: 'C',
    tagId,
    biginFilter: {
      Sub_Pipeline: 'Ventas Somnio Standard',
      Stage: 'CONFIRMA',
      Tag: 'CONFIRMADO',
    },
    biginRecordsMatched: filtered.length,
    morfxOrdersFound: morfxOrders.length,
    missingBiginIds: missingBiginIds.length,
    nameMatches,
    nameMismatches,
    assigned,
    alreadyAssigned,
    errors,
    errorDetails,
    missingBiginIdsSample: missingBiginIds.slice(0, 50),
  };

  const logDir = path.resolve(__dirname, 'data/upload-log');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.resolve(logDir, 'tag-confirmado-results.json');
  fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
  console.log(`\nLog guardado en: ${logFile}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
