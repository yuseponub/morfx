/**
 * Analyze the 1,959 ventas sin logística.
 * Usage: npx tsx scripts/bigin-migration/02c-ventas-analysis.ts
 */

import * as fs from "fs";
import * as path from "path";

const dataDir = path.join(__dirname, "data");
const normDir = path.join(dataDir, "normalized");

// ─── Load data ────────────────────────────────────────────────────
const unmatched = JSON.parse(fs.readFileSync(path.join(normDir, "unmatched.json"), "utf-8"));
const ventasSinLog: Array<{ id: string; name: string; phone: string | null; stage: string; created: string }> =
  unmatched.ventasSinLogistica;

const allRaw = JSON.parse(fs.readFileSync(path.join(dataDir, "pipelines.json"), "utf-8"));
const orderGroups = JSON.parse(fs.readFileSync(path.join(normDir, "order-groups.json"), "utf-8"));
const contacts = JSON.parse(fs.readFileSync(path.join(normDir, "contacts.json"), "utf-8"));

// Build lookups
const dealById = new Map<string, any>();
for (const d of allRaw) dealById.set(d.id, d);

// Contact by id
const contactById = new Map<string, any>();
for (const c of contacts) contactById.set(c.id, c);

// Phone -> contact
const contactByPhone = new Map<string, any>();
for (const c of contacts) {
  if (c.phone) contactByPhone.set(c.phone, c);
}

// Contact id -> order groups
const groupsByContactId = new Map<string, any[]>();
for (const g of orderGroups) {
  if (g.contact_id) {
    const list = groupsByContactId.get(g.contact_id) || [];
    list.push(g);
    groupsByContactId.set(g.contact_id, list);
  }
}

// Venta id -> group (for cross-reference)
const groupByVentaId = new Map<string, any>();
for (const g of orderGroups) {
  if (g.venta) groupByVentaId.set(g.venta.id, g);
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let p = raw.replace(/[\s\-\(\)\[\]\.]/g, "");
  if (p.length < 7) return null;
  if (p.startsWith("+57") && p.length === 13) return p;
  if (p.startsWith("57") && !p.startsWith("+") && p.length === 12) return "+" + p;
  if (p.startsWith("3") && p.length === 10) return "+57" + p;
  if (p.startsWith("57") && p.length >= 11 && p.length <= 13) return "+" + p;
  if (p.startsWith("+")) return p;
  if (p.length === 10 && /^\d+$/.test(p)) return "+57" + p;
  return p.length >= 10 ? "+57" + p.replace(/\D/g, "").slice(-10) : null;
}

// ─── Enrich with full deal data ───────────────────────────────────
interface EnrichedVenta {
  id: string;
  name: string;
  phone: string | null;
  normalizedPhone: string | null;
  stage: string;
  created: string;
  amount: number | null;
  deal: any;
}

const enriched: EnrichedVenta[] = ventasSinLog.map((v) => {
  const deal = dealById.get(v.id);
  return {
    id: v.id,
    name: v.name,
    phone: v.phone,
    normalizedPhone: normalizePhone(deal?.Telefono),
    stage: v.stage,
    created: v.created,
    amount: deal?.Amount ?? null,
    deal,
  };
});

console.log(`Ventas sin Logística: Análisis Detallado`);
console.log(`${"=".repeat(60)}`);
console.log(`Total: ${enriched.length}\n`);

// ─── 1. Distribución por Stage ────────────────────────────────────
const byStage: Record<string, number> = {};
for (const v of enriched) {
  byStage[v.stage] = (byStage[v.stage] || 0) + 1;
}
const stagesSorted = Object.entries(byStage).sort((a, b) => b[1] - a[1]);

console.log(`1. DISTRIBUCIÓN POR STAGE`);
console.log(`${"─".repeat(50)}`);
for (const [stage, count] of stagesSorted) {
  const pct = ((count / enriched.length) * 100).toFixed(1);
  const bar = "█".repeat(Math.round(count / enriched.length * 40));
  console.log(`  ${stage.padEnd(25)} ${String(count).padStart(5)}  (${pct.padStart(5)}%) ${bar}`);
}

// ─── 2. Distribución Temporal ─────────────────────────────────────
const byMonth: Record<string, number> = {};
for (const v of enriched) {
  const month = v.created.slice(0, 7); // YYYY-MM
  byMonth[month] = (byMonth[month] || 0) + 1;
}
const monthsSorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));

console.log(`\n2. DISTRIBUCIÓN TEMPORAL (por mes)`);
console.log(`${"─".repeat(50)}`);
for (const [month, count] of monthsSorted) {
  const bar = "█".repeat(Math.round(count / 50));
  console.log(`  ${month}  ${String(count).padStart(5)}  ${bar}`);
}

// ─── 3. Amount ────────────────────────────────────────────────────
const withAmount = enriched.filter((v) => v.amount && v.amount > 0);
const withoutAmount = enriched.filter((v) => !v.amount || v.amount === 0);
const amounts = withAmount.map((v) => v.amount!);
const avgAmount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;

console.log(`\n3. AMOUNT`);
console.log(`${"─".repeat(50)}`);
console.log(`  Amount > 0:    ${withAmount.length} (${((withAmount.length / enriched.length) * 100).toFixed(1)}%)`);
console.log(`  Amount 0/null: ${withoutAmount.length} (${((withoutAmount.length / enriched.length) * 100).toFixed(1)}%)`);
console.log(`  Promedio (de los >0): $${Math.round(avgAmount).toLocaleString()}`);

// ─── 4. Pruebas internas ─────────────────────────────────────────
const testPatterns = [
  /jose\s*romero/i,
  /test/i,
  /prueba/i,
  /fake/i,
  /asdf/i,
  /xxx/i,
  /aaa/i,
  /demo/i,
  /ejemplo/i,
  /somnio/i,
  /^[a-z]{1,3}$/i, // very short names
  /vghfg/i,
  /cfgvh/i,
];

const testRecords: EnrichedVenta[] = [];
for (const v of enriched) {
  if (testPatterns.some((p) => p.test(v.name))) {
    testRecords.push(v);
  }
}

console.log(`\n4. POSIBLES PRUEBAS INTERNAS`);
console.log(`${"─".repeat(50)}`);
console.log(`  Total detectadas: ${testRecords.length}`);
if (testRecords.length > 0) {
  // Group by pattern
  const byName: Record<string, number> = {};
  for (const t of testRecords) {
    const key = t.name.toLowerCase().trim();
    byName[key] = (byName[key] || 0) + 1;
  }
  const namesSorted = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of namesSorted.slice(0, 15)) {
    console.log(`    "${name}": ${count}`);
  }
}

// ─── 5. CONFIRMA sin logística ────────────────────────────────────
const confirmaRecords = enriched.filter((v) => v.stage === "CONFIRMA");

console.log(`\n5. VENTAS EN STAGE "CONFIRMA" SIN LOGÍSTICA`);
console.log(`${"─".repeat(50)}`);
console.log(`  Total en CONFIRMA: ${confirmaRecords.length}`);

if (confirmaRecords.length > 0) {
  // For each, check if their phone exists in contacts with other complete groups
  let hasOtherCompleteGroups = 0;
  let phoneNotFoundInContacts = 0;
  let contactHasOnlyThisOrder = 0;
  const confirmaDetails: any[] = [];

  for (const v of confirmaRecords) {
    const contact = v.normalizedPhone ? contactByPhone.get(v.normalizedPhone) : null;

    if (!contact) {
      phoneNotFoundInContacts++;
      confirmaDetails.push({
        id: v.id,
        name: v.name,
        phone: v.normalizedPhone,
        stage: v.stage,
        created: v.created.slice(0, 10),
        amount: v.amount,
        contact_found: false,
        contact_orders: 0,
        complete_groups: 0,
        reason: "phone not found in contacts",
      });
      continue;
    }

    const groups = groupsByContactId.get(contact.id) || [];
    const completeGroups = groups.filter((g: any) => g.venta && g.logistica);

    if (completeGroups.length > 0) {
      hasOtherCompleteGroups++;
    } else {
      contactHasOnlyThisOrder++;
    }

    confirmaDetails.push({
      id: v.id,
      name: v.name,
      phone: v.normalizedPhone,
      stage: v.stage,
      created: v.created.slice(0, 10),
      amount: v.amount,
      contact_found: true,
      contact_name: contact.name,
      contact_orders: contact.order_count,
      complete_groups: completeGroups.length,
      reason: completeGroups.length > 0
        ? `contact has ${completeGroups.length} complete groups — this venta is likely a duplicate or re-order that wasn't mirrored to logistica`
        : "contact has no complete groups — likely entire chain is broken",
    });
  }

  console.log(`  Con contacto que tiene otros grupos V+L: ${hasOtherCompleteGroups}`);
  console.log(`  Con contacto sin grupos completos: ${contactHasOnlyThisOrder}`);
  console.log(`  Teléfono no encontrado en contactos: ${phoneNotFoundInContacts}`);

  // Sample
  console.log(`\n  Sample (primeras 10):`);
  for (const d of confirmaDetails.slice(0, 10)) {
    console.log(
      `    ${d.name.padEnd(35)} ${d.created}  $${(d.amount || 0).toLocaleString().padStart(8)}  orders=${d.contact_orders}  complete=${d.complete_groups}  ${d.reason.slice(0, 60)}`
    );
  }
}

// ─── 6. Contactos con otras transacciones completas ───────────────
let contactsWithOtherVL = 0;
let contactsWithOnlyUnmatched = 0;
let noContactFound = 0;
const detailedRecords: any[] = [];

for (const v of enriched) {
  const contact = v.normalizedPhone ? contactByPhone.get(v.normalizedPhone) : null;

  if (!contact) {
    noContactFound++;
    detailedRecords.push({
      id: v.id,
      name: v.name,
      phone: v.normalizedPhone,
      stage: v.stage,
      created: v.created.slice(0, 10),
      amount: v.amount,
      contact_found: false,
      contact_total_orders: 0,
      contact_complete_groups: 0,
      category: "no_contact",
    });
    continue;
  }

  const groups = groupsByContactId.get(contact.id) || [];
  const completeGroups = groups.filter((g: any) => g.venta && g.logistica);

  if (completeGroups.length > 0) {
    contactsWithOtherVL++;
    detailedRecords.push({
      id: v.id,
      name: v.name,
      phone: v.normalizedPhone,
      stage: v.stage,
      created: v.created.slice(0, 10),
      amount: v.amount,
      contact_found: true,
      contact_name: contact.name,
      contact_total_orders: contact.order_count,
      contact_complete_groups: completeGroups.length,
      category: "has_other_complete",
    });
  } else {
    contactsWithOnlyUnmatched++;
    detailedRecords.push({
      id: v.id,
      name: v.name,
      phone: v.normalizedPhone,
      stage: v.stage,
      created: v.created.slice(0, 10),
      amount: v.amount,
      contact_found: true,
      contact_name: contact.name,
      contact_total_orders: contact.order_count,
      contact_complete_groups: 0,
      category: "no_complete_groups",
    });
  }
}

console.log(`\n6. CONTACTOS CON OTRAS TRANSACCIONES COMPLETAS (V+L)`);
console.log(`${"─".repeat(50)}`);
console.log(`  Contacto tiene otros V+L completos: ${contactsWithOtherVL} (${((contactsWithOtherVL / enriched.length) * 100).toFixed(1)}%)`);
console.log(`  Contacto sin grupos completos:      ${contactsWithOnlyUnmatched} (${((contactsWithOnlyUnmatched / enriched.length) * 100).toFixed(1)}%)`);
console.log(`  Sin contacto (no phone):            ${noContactFound} (${((noContactFound / enriched.length) * 100).toFixed(1)}%)`);

// ─── Summary table by stage × category ────────────────────────────
console.log(`\n7. CRUCE: STAGE × CATEGORÍA`);
console.log(`${"─".repeat(70)}`);
const crossTab: Record<string, Record<string, number>> = {};
for (const d of detailedRecords) {
  if (!crossTab[d.stage]) crossTab[d.stage] = {};
  crossTab[d.stage][d.category] = (crossTab[d.stage][d.category] || 0) + 1;
}
const categories = ["has_other_complete", "no_complete_groups", "no_contact"];
console.log(`  ${"Stage".padEnd(25)} ${"other_V+L".padStart(10)} ${"no_V+L".padStart(10)} ${"no_contact".padStart(10)} ${"total".padStart(8)}`);
for (const [stage, cats] of Object.entries(crossTab).sort((a, b) => {
  const totalA = Object.values(a[1]).reduce((s, n) => s + n, 0);
  const totalB = Object.values(b[1]).reduce((s, n) => s + n, 0);
  return totalB - totalA;
})) {
  const total = Object.values(cats).reduce((s, n) => s + n, 0);
  console.log(
    `  ${stage.padEnd(25)} ${String(cats["has_other_complete"] || 0).padStart(10)} ${String(cats["no_complete_groups"] || 0).padStart(10)} ${String(cats["no_contact"] || 0).padStart(10)} ${String(total).padStart(8)}`
  );
}

// ─── Recommendation ───────────────────────────────────────────────
const testIds = new Set(testRecords.map((t) => t.id));
const cancela = enriched.filter((v) => v.stage === "CANCELA" || v.stage === "DEVOLUCION");
const noAmount = enriched.filter((v) => !v.amount || v.amount === 0);

console.log(`\n${"=".repeat(60)}`);
console.log(`RECOMENDACIÓN PARA MIGRACIÓN`);
console.log(`${"=".repeat(60)}`);
console.log(`  Pruebas internas (descartar):  ${testRecords.length}`);
console.log(`  CANCELA/DEVOLUCION (descartar): ${cancela.length}`);
console.log(`  Amount 0/null (descartar):      ${withoutAmount.length}`);
console.log(`  Overlap (algunos caen en varias): ver análisis`);
console.log(`  → El resto son ventas que no generaron logística`);
console.log(`    (probablemente no se confirmaron en Bigin)`);

// ─── Save ─────────────────────────────────────────────────────────
const report = {
  generatedAt: new Date().toISOString(),
  total: enriched.length,
  byStage: Object.fromEntries(stagesSorted),
  byMonth: Object.fromEntries(monthsSorted),
  amount: { withAmount: withAmount.length, withoutAmount: withoutAmount.length, avgAmount: Math.round(avgAmount) },
  testRecords: { count: testRecords.length, names: [...new Set(testRecords.map((t) => t.name))] },
  confirmaAnalysis: {
    total: confirmaRecords.length,
    hasOtherCompleteGroups: enriched.filter((v) => v.stage === "CONFIRMA").length > 0 ? undefined : 0,
  },
  crossTab,
  contactAnalysis: {
    hasOtherComplete: contactsWithOtherVL,
    noCompleteGroups: contactsWithOnlyUnmatched,
    noContact: noContactFound,
  },
  records: detailedRecords,
};

const outPath = path.join(normDir, "ventas-sin-logistica-analysis.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nSaved: ${outPath}`);
