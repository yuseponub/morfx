/**
 * Prep: genera lotes compactos de transcripts para clasificación + detecta
 * plantillas de facto (outbound recurrentes) + lista de primeros mensajes.
 * Run: npx tsx scripts/varix-conversations-prep.ts
 * Output: scripts/varix-data/batch-N.md, defacto-templates.json, first-messages.txt
 */
import * as fs from 'fs'
import * as path from 'path'

const DIR = path.resolve(process.cwd(), 'scripts/varix-data')
const data: any[] = JSON.parse(fs.readFileSync(path.join(DIR, 'conversations.json'), 'utf8'))

// --- 1. Conversations with inbound, compact transcripts ---
const convs = data.filter(c => c.messages.some((m: any) => m.dir === 'inbound'))

function compact(c: any): string {
  const lines: string[] = [`### CONV ${c.id.slice(0, 8)} [${c.channel}]`]
  for (const m of c.messages.slice(0, 40)) {
    let t = (m.text || '').replace(/\s+/g, ' ').trim()
    if (m.type !== 'text') t = `<${m.type}> ${t}`.trim()
    if (t.length > 250) t = t.slice(0, 250) + '…'
    if (!t) continue
    lines.push(`${m.dir === 'inbound' ? 'CLIENTE' : 'VARIX'}: ${t}`)
  }
  if (c.messages.length > 40) lines.push(`(… ${c.messages.length - 40} mensajes más)`)
  return lines.join('\n')
}

const BATCHES = 6
const perBatch = Math.ceil(convs.length / BATCHES)
for (let i = 0; i < BATCHES; i++) {
  const slice = convs.slice(i * perBatch, (i + 1) * perBatch)
  const body = slice.map(compact).join('\n\n')
  fs.writeFileSync(path.join(DIR, `batch-${i}.md`), body)
  console.log(`batch-${i}.md: ${slice.length} convs, ${(body.length / 1024).toFixed(0)}KB`)
}

// --- 2. De facto templates: outbound messages repeated across conversations ---
const outboundCounts = new Map<string, { count: number; sample: string }>()
for (const c of data) {
  const seen = new Set<string>()
  for (const m of c.messages) {
    if (m.dir !== 'outbound' || !m.text) continue
    const key = m.text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120)
    if (key.length < 40 || seen.has(key)) continue
    seen.add(key)
    const e = outboundCounts.get(key) ?? { count: 0, sample: m.text }
    e.count++
    outboundCounts.set(key, e)
  }
}
const defacto = [...outboundCounts.values()]
  .filter(e => e.count >= 3)
  .sort((a, b) => b.count - a.count)
fs.writeFileSync(path.join(DIR, 'defacto-templates.json'), JSON.stringify(defacto, null, 2))
console.log(`defacto-templates.json: ${defacto.length} mensajes outbound usados en >=3 convos`)

// --- 3. First inbound message per conversation ---
const firsts = convs.map(c => {
  const m = c.messages.find((m: any) => m.dir === 'inbound' && m.text)
  return m ? (m.type !== 'text' ? `<${m.type}>` : m.text.replace(/\s+/g, ' ').trim().slice(0, 150)) : null
}).filter(Boolean)
fs.writeFileSync(path.join(DIR, 'first-messages.txt'), firsts.join('\n'))
console.log(`first-messages.txt: ${firsts.length} primeros mensajes`)
