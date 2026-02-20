/**
 * Generates phone-issues.json with all contacts that have problematic phones.
 * Usage: npx tsx scripts/bigin-migration/02a-phone-issues.ts
 */

import * as fs from "fs";
import * as path from "path";

const dataDir = path.join(__dirname, "data");
const normDir = path.join(dataDir, "normalized");

// Load data
const contacts = JSON.parse(fs.readFileSync(path.join(normDir, "contacts.json"), "utf-8"));
const groups: any[] = JSON.parse(fs.readFileSync(path.join(normDir, "order-groups.json"), "utf-8"));

// Build contact_id -> raw phones map from order groups
const contactRawPhones = new Map<string, Set<string>>();
for (const g of groups) {
  const cid = g.contact_id;
  if (!cid) continue;
  if (!contactRawPhones.has(cid)) contactRawPhones.set(cid, new Set());
  const phones = contactRawPhones.get(cid)!;
  for (const deal of [g.venta, g.logistica, g.envios_somnio]) {
    if (deal?.Telefono) phones.add(deal.Telefono);
  }
}

// Classify issues
interface PhoneIssue {
  issue: string;
  original_phones: string[];
  [key: string]: any;
}

const issues: PhoneIssue[] = [];
const issueCounts: Record<string, number> = {};

for (const c of contacts) {
  const phone: string | null = c.phone;
  let issue: string | null = null;

  // Correct E.164 Colombian mobile: +573XXXXXXXXX = 13 chars
  if (!phone) {
    issue = "null_phone";
  } else if (!phone.startsWith("+57")) {
    issue = "not_colombian";
  } else if (phone.length < 13) {
    issue = "too_short";
  } else if (phone.length > 13) {
    issue = "too_long";
  } else if (phone[3] !== "3") {
    issue = "invalid_prefix";
  }

  if (issue) {
    const rawPhones = contactRawPhones.get(c.id);
    issues.push({
      ...c,
      issue,
      original_phones: rawPhones ? [...rawPhones] : [],
    });
    issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  }
}

// Save
const outPath = path.join(normDir, "phone-issues.json");
fs.writeFileSync(outPath, JSON.stringify(issues, null, 2));

// Report
console.log(`Phone Issues Report`);
console.log(`${"─".repeat(40)}`);
console.log(`Total contactos: ${contacts.length.toLocaleString()}`);
console.log(`Con problemas: ${issues.length} (${((issues.length / contacts.length) * 100).toFixed(1)}%)`);
console.log(`Sin problemas: ${(contacts.length - issues.length).toLocaleString()}`);
console.log(`\nPor tipo de issue:`);
for (const [issue, count] of Object.entries(issueCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${issue}: ${count}`);
}
console.log(`\nSaved: ${outPath}`);
