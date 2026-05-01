---
plan: 04
phase: somnio-sales-v4
wave: 1
depends_on: [01, 02]
files_modified:
  - package.json
  - pnpm-lock.yaml
  - src/lib/agents/somnio-v4/knowledge-base/parser.ts
  - src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts
  - src/lib/agents/somnio-v4/knowledge-base/embed.ts
  - src/lib/agents/somnio-v4/knowledge-base/sync.ts
  - src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts
  - src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts
  - scripts/knowledge-sync.ts
  - src/lib/agents/somnio-v4/config.ts
addresses_decisions: [D-04, D-13, D-23, D-24, D-45, D-46, D-47, D-48, D-49, D-51, D-55]
addresses_research_pitfalls: [Pitfall 7]
autonomous: true
estimated_tasks: 6
must_haves:
  truths:
    - "gray-matter está instalado como dependencia de package.json"
    - "Script `pnpm knowledge:sync` está registrado y es ejecutable"
    - "parseKbDoc() valida frontmatter contra Zod schema y extrae las 4 secciones (Respuesta canónica / Si el cliente insiste / NUNCA decir / Sources)"
    - "coherenceCheck() lanza si la categoría del frontmatter no coincide con la carpeta padre"
    - "syncKbDoc() hashea el body con SHA-256 y skip-rebuilds embedding si hash no cambió (Pitfall 7)"
    - "syncKbDoc() persiste `nunca_decir: parsed.sections.nuncaDecir` en cada upsert (W-09 — alimenta el post-gen check del sub-loop)"
    - "Cero importaciones de @/lib/agents/somnio-v3/* en src/lib/agents/somnio-v4/knowledge-base/** (D-24)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/knowledge-base/parser.ts"
      provides: "parseKbDoc + FrontmatterSchema"
      exports: ["parseKbDoc", "FrontmatterSchema", "Frontmatter", "ParsedKbDoc"]
    - path: "src/lib/agents/somnio-v4/knowledge-base/sync.ts"
      provides: "generateEmbedding + syncKbDoc — escribe nunca_decir column"
      exports: ["generateEmbedding", "syncKbDoc", "SOMNIO_WORKSPACE_ID"]
    - path: "scripts/knowledge-sync.ts"
      provides: "CLI ejecutable de pnpm knowledge:sync"
    - path: "src/lib/agents/somnio-v4/config.ts"
      provides: "SOMNIO_V4_AGENT_ID + somnioV4Config (parcial — completion en Plan 06)"
      exports: ["SOMNIO_V4_AGENT_ID"]
  key_links:
    - from: "syncKbDoc"
      to: "parseKbDoc"
      via: "import desde ./parser"
      pattern: "from './parser'"
    - from: "syncKbDoc"
      to: "OpenAI text-embedding-3-small"
      via: "openai.embeddings.create({ model, dimensions: 1536 })"
      pattern: "text-embedding-3-small"
    - from: "syncKbDoc upsert payload"
      to: "agent_knowledge_base.nunca_decir column"
      via: "parsed.sections.nuncaDecir → upsertPayload.nunca_decir"
      pattern: "nunca_decir:"
---

<objective>
Wave 1 (utilidades compartidas — parte 1 de 3). Construir la capa de Knowledge Base sync:
1. Instalar `gray-matter` y agregar script `pnpm knowledge:sync`
2. Parser que valida frontmatter (D-45) + extrae secciones (D-49)
3. Coherence check carpeta vs categoría (D-48)
4. Embed wrapper (OpenAI text-embedding-3-small, dim=1536)
5. Sync core con hash SHA-256 (Pitfall 7) + upsert + **persistencia de `nunca_decir`** (W-09 / D-51)
6. CLI tsx wrapper para `pnpm knowledge:sync` local
7. `config.ts` arrancando (SOMNIO_V4_AGENT_ID literal — D-13)

Purpose: Plan 11 (corpus inicial) y Plan 09 (Inngest sync hook) dependen de esta capa. También Plan 05 (kb-search-tool del sub-loop) reusa `generateEmbedding` y consume la columna `nunca_decir` que esta capa persiste.

Output: 9 archivos nuevos + 2 modificaciones (package.json + lockfile). Commit atómico al cierre.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@src/lib/agents/somnio-v3/config.ts
</context>

<interfaces>
<!-- Sourced from RESEARCH §Pattern 4 + PATTERNS.md sections -->

```typescript
// FrontmatterSchema (D-45 — 7 fields)
{
  topic: string,
  keywords: string[],
  category: 'product' | 'policies' | 'edge-cases' | 'faqs-no-templated',
  last_reviewed: string (YYYY-MM-DD),
  reviewed_by: string,
  escalate_if?: string[],
  related_topics?: string[]
}

// Body sections (D-49)
'## Respuesta canónica'   → canonica (string)
'## Si el cliente insiste' → alternativa (string opcional)
'## NUNCA decir'           → nuncaDecir (string[])  ← persistido en DB column nunca_decir (W-09)
'## Sources'               → sources (string opcional)

// Workspace literal (D-23)
const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'

// Agent ID (D-13)
const SOMNIO_V4_AGENT_ID = 'somnio-sales-v4'
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Instalar gray-matter + script pnpm knowledge:sync</name>
  <files>package.json, pnpm-lock.yaml</files>
  <read_first>
    - package.json (verificar que `tsx` y `openai` ya están en dependencies)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Standard Stack — gray-matter ^4.0.3)
  </read_first>
  <action>
1. Verificar versión más reciente de gray-matter:
```bash
npm view gray-matter version
```
Si la salida es ≥ 4.0.3, usar esa. Si no, usar `^4.0.3`.

2. Instalar:
```bash
pnpm add gray-matter
```

3. Agregar script a `package.json` en el bloque `"scripts"`:
```json
"knowledge:sync": "tsx scripts/knowledge-sync.ts"
```

Editar `package.json` con la herramienta Edit; respetar formato (tabs/spaces igual que el resto del archivo).
  </action>
  <verify>
    <automated>grep -q "\"gray-matter\":" package.json && grep -q "\"knowledge:sync\":" package.json && test -f pnpm-lock.yaml && grep -q "gray-matter" pnpm-lock.yaml</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` contiene `"gray-matter":` en dependencies
    - `package.json` contiene `"knowledge:sync": "tsx scripts/knowledge-sync.ts"` en scripts
    - `pnpm-lock.yaml` contiene gray-matter
    - `pnpm install --frozen-lockfile` no falla
  </acceptance_criteria>
  <done>Dependencia instalada + script registrado.</done>
</task>

<task type="auto">
  <name>Task 2: Crear config.ts mínimo + parser.ts + coherence-check.ts</name>
  <files>src/lib/agents/somnio-v4/config.ts, src/lib/agents/somnio-v4/knowledge-base/parser.ts, src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/config.ts (analog para SOMNIO_V3_AGENT_ID export)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "config.ts", "knowledge-base/parser.ts", "knowledge-base/coherence-check.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-13, D-45, D-48, D-49)
  </read_first>
  <action>
**A) `src/lib/agents/somnio-v4/config.ts`** (mínimo viable — completar en Plan 06 con AgentConfig):
```typescript
// Standalone: somnio-sales-v4
// D-13: agent_id literal locked
// D-23: scope = workspace Somnio exclusivo
// D-24: cero imports desde @/lib/agents/somnio-v3/*

export const SOMNIO_V4_AGENT_ID = 'somnio-sales-v4' as const

// Workspace Somnio (D-23). Hardcoded porque v4 SOLO opera aquí.
export const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490' as const

// La AgentConfig completa (id, name, intentDetector, etc.) se agrega en Plan 06
// cuando state-machine + comprehension estén listos.
```

**B) `src/lib/agents/somnio-v4/knowledge-base/parser.ts`**:
```typescript
import matter from 'gray-matter'
import { z } from 'zod'

export const FrontmatterSchema = z.object({
  topic: z.string().min(1),
  keywords: z.array(z.string()),
  category: z.enum(['product', 'policies', 'edge-cases', 'faqs-no-templated']),
  last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'last_reviewed debe ser YYYY-MM-DD'),
  reviewed_by: z.string().min(1),
  escalate_if: z.array(z.string()).optional(),
  related_topics: z.array(z.string()).optional(),
})

export type Frontmatter = z.infer<typeof FrontmatterSchema>

export interface ParsedKbDoc {
  frontmatter: Frontmatter
  body: string
  sections: {
    canonica?: string
    alternativa?: string
    nuncaDecir: string[]
    sources?: string
  }
}

/**
 * Parsea un .md de knowledge base (D-45 frontmatter + D-49 body sections).
 * Lanza si frontmatter inválido (Zod schema fail).
 */
export function parseKbDoc(raw: string, filePath: string): ParsedKbDoc {
  const { data, content } = matter(raw)
  const parsed = FrontmatterSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(
      `Frontmatter inválido en ${filePath}: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    )
  }
  return {
    frontmatter: parsed.data,
    body: content,
    sections: parseSections(content),
  }
}

/**
 * Extrae secciones por header `## ` (D-49).
 * Headers reconocidos: 'Respuesta canónica', 'Si el cliente insiste', 'NUNCA decir', 'Sources'.
 * Cualquier header desconocido se ignora silenciosamente (extensibilidad D-46).
 * 'NUNCA decir' se parsea como lista bullet `- item` → string[].
 */
function parseSections(body: string): ParsedKbDoc['sections'] {
  const lines = body.split('\n')
  const sections: ParsedKbDoc['sections'] = { nuncaDecir: [] }
  let current: string | null = null
  let buffer: string[] = []

  const flush = () => {
    if (!current) return
    const text = buffer.join('\n').trim()
    if (current === 'canonica') sections.canonica = text || undefined
    else if (current === 'alternativa') sections.alternativa = text || undefined
    else if (current === 'sources') sections.sources = text || undefined
    else if (current === 'nuncaDecir') {
      sections.nuncaDecir = buffer
        .map((l) => l.trim())
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).trim())
        .filter(Boolean)
    }
    buffer = []
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush()
      const header = line.slice(3).trim().toLowerCase()
      if (header.includes('respuesta canónica') || header.includes('respuesta canonica')) current = 'canonica'
      else if (header.includes('si el cliente insiste')) current = 'alternativa'
      else if (header.includes('nunca decir')) current = 'nuncaDecir'
      else if (header.includes('sources') || header.includes('notas')) current = 'sources'
      else current = null
    } else if (current) {
      buffer.push(line)
    }
  }
  flush()
  return sections
}
```

**C) `src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts`**:
```typescript
/**
 * D-48: valida que la carpeta padre del archivo coincida con frontmatter.category.
 * E.g. `knowledge/product/foo.md` con frontmatter.category='product' → pass.
 *      `knowledge/product/foo.md` con frontmatter.category='policies' → throw.
 *
 * Se llama desde syncKbDoc antes de embed/upsert.
 */
export function coherenceCheck(filePath: string, frontmatterCategory: string): void {
  // filePath ejemplo: 'src/lib/agents/somnio-v4/knowledge/product/precio_comparativo.md'
  const parts = filePath.replace(/\\/g, '/').split('/')
  const folderCategory = parts[parts.length - 2]
  if (frontmatterCategory !== folderCategory) {
    throw new Error(
      `Coherence fail: ${filePath} folder=${folderCategory} frontmatter.category=${frontmatterCategory}`
    )
  }
}
```

**Anti-patterns aplicados:**
- D-24: NO importar nada desde `@/lib/agents/somnio-v3/*`. Verificable: `grep -r "from '@/lib/agents/somnio-v3" src/lib/agents/somnio-v4/` debe dar 0 matches.
- NO custom-parse YAML — usar gray-matter (RESEARCH Don't Hand-Roll).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/config.ts && grep -q "SOMNIO_V4_AGENT_ID = 'somnio-sales-v4'" src/lib/agents/somnio-v4/config.ts && test -f src/lib/agents/somnio-v4/knowledge-base/parser.ts && grep -q "gray-matter" src/lib/agents/somnio-v4/knowledge-base/parser.ts && grep -q "FrontmatterSchema" src/lib/agents/somnio-v4/knowledge-base/parser.ts && test -f src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts && grep -q "Coherence fail" src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/ | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/somnio-v4/config.ts` exporta `SOMNIO_V4_AGENT_ID = 'somnio-sales-v4'` literal
    - `src/lib/agents/somnio-v4/config.ts` exporta `SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'`
    - `parser.ts` importa `gray-matter` y `zod`
    - `parser.ts` exporta `parseKbDoc`, `FrontmatterSchema`, `Frontmatter`, `ParsedKbDoc`
    - `parser.ts` reconoce los 4 headers de D-49 (case-insensitive con/sin tilde)
    - `coherence-check.ts` lanza Error con string `Coherence fail`
    - `grep -rE "from '@/lib/agents/somnio-v3" src/lib/agents/somnio-v4/` retorna 0 (D-24)
    - `pnpm typecheck` exits 0 (no errores en archivos nuevos)
  </acceptance_criteria>
  <done>Parser + coherence-check + config mínimo creados, sin imports prohibidos.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Tests de parser.ts y coherence-check.ts</name>
  <files>src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts, src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/parser.ts (acabado de crear)
    - src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts (acabado de crear)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-45, D-48, D-49)
  </read_first>
  <behavior>
    parser.test.ts:
    - Test 1: parseKbDoc con frontmatter válido + body completo → retorna struct con todos los campos
    - Test 2: frontmatter sin `topic` → throws con mensaje legible
    - Test 3: `category` fuera del enum → throws
    - Test 4: `last_reviewed` con formato MM-DD-YYYY → throws (regex YYYY-MM-DD)
    - Test 5: body con `## NUNCA decir` con bullets `- a\n- b\n- c` → sections.nuncaDecir = ['a','b','c']
    - Test 6: body sin `## NUNCA decir` → sections.nuncaDecir = []
    - Test 7: header `## Respuesta canonica` (sin tilde) reconocido como `canonica`
    - Test 8: header desconocido `## Otro` ignorado silenciosamente

    coherence-check.test.ts:
    - Test 1: filePath `knowledge/product/foo.md` + cat 'product' → no throw
    - Test 2: filePath `knowledge/policies/foo.md` + cat 'product' → throws con mensaje
    - Test 3: paths con backslash Windows tratados igual que con forward-slash
  </behavior>
  <action>
Crear tests con vitest. Estructura:
```typescript
// parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseKbDoc } from '../parser'

describe('parseKbDoc', () => {
  it('parses valid frontmatter and body', () => {
    const raw = `---
topic: precio
keywords: [precio, costo]
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Respuesta canónica
50 USD.

## NUNCA decir
- comparar con competencia
- mentir sobre stock
`
    const result = parseKbDoc(raw, 'kb/product/precio.md')
    expect(result.frontmatter.topic).toBe('precio')
    expect(result.sections.canonica).toContain('50 USD')
    expect(result.sections.nuncaDecir).toEqual(['comparar con competencia', 'mentir sobre stock'])
  })

  it('throws on missing topic', () => {
    const raw = `---
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---
body
`
    expect(() => parseKbDoc(raw, 'kb/product/x.md')).toThrow(/topic/)
  })

  // ... tests 3-8 (siguiendo el behavior block)
})
```

```typescript
// coherence-check.test.ts
import { describe, it, expect } from 'vitest'
import { coherenceCheck } from '../coherence-check'

describe('coherenceCheck', () => {
  it('passes when folder matches category', () => {
    expect(() => coherenceCheck('src/lib/agents/somnio-v4/knowledge/product/x.md', 'product')).not.toThrow()
  })
  it('throws when mismatch', () => {
    expect(() => coherenceCheck('src/lib/agents/somnio-v4/knowledge/policies/x.md', 'product')).toThrow(/Coherence fail/)
  })
  it('handles backslash paths', () => {
    expect(() => coherenceCheck('src\\lib\\agents\\somnio-v4\\knowledge\\product\\x.md', 'product')).not.toThrow()
  })
})
```

Ejecutar:
```bash
pnpm vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/
```
Todos los tests deben pasar.
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts --reporter=basic 2>&1 | grep -E "Test Files.*(passed|failed)"</automated>
  </verify>
  <acceptance_criteria>
    - 8 tests en parser.test.ts pasan
    - 3 tests en coherence-check.test.ts pasan
    - vitest exit code 0
  </acceptance_criteria>
  <done>Capa de parsing testeada.</done>
</task>

<task type="auto">
  <name>Task 4: embed.ts + sync.ts (OpenAI + upsert con hash + nunca_decir column)</name>
  <files>src/lib/agents/somnio-v4/knowledge-base/embed.ts, src/lib/agents/somnio-v4/knowledge-base/sync.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "knowledge-base/sync.ts" — pattern completo)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (§Pattern 4, Pitfall 7)
    - src/lib/agents/somnio-v4/config.ts (SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID)
    - src/lib/agents/somnio-v4/knowledge-base/parser.ts (acabado de crear — `parsed.sections.nuncaDecir`)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-51 — NUNCA-decir post-gen check)
  </read_first>
  <action>
**A) `src/lib/agents/somnio-v4/knowledge-base/embed.ts`**:
```typescript
import OpenAI from 'openai'

let client: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada')
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}

/**
 * Genera embedding 1536-dim para `text` con OpenAI text-embedding-3-small.
 * Reusable por sync (Plan 04) y kb-search-tool del sub-loop (Plan 05).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const r = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  })
  return r.data[0].embedding
}
```

**B) `src/lib/agents/somnio-v4/knowledge-base/sync.ts`**:
```typescript
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseKbDoc } from './parser'
import { coherenceCheck } from './coherence-check'
import { generateEmbedding } from './embed'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from '../config'

export interface SyncResult {
  filePath: string
  topic: string
  action: 'inserted' | 'updated_meta_only' | 'updated_with_embedding' | 'skipped_no_change'
}

/**
 * Sincroniza un único archivo .md con la tabla agent_knowledge_base.
 * Hash SHA-256 del body — skip embedding regeneration si hash no cambió (Pitfall 7).
 * Frontmatter changes solamente → re-upsert metadata, embedding cacheado.
 *
 * W-09 / D-51: persiste `parsed.sections.nuncaDecir` en la columna `nunca_decir TEXT[]`
 * (creada por Plan 01). Plan 05 kb-search-tool lee esta columna desde el RPC y la
 * pasa al post-gen check del sub-loop.
 */
export async function syncKbDoc(filePath: string, raw: string): Promise<SyncResult> {
  const parsed = parseKbDoc(raw, filePath)
  coherenceCheck(filePath, parsed.frontmatter.category)

  const bodyHash = createHash('sha256').update(parsed.body).digest('hex')
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('agent_knowledge_base')
    .select('id, body_hash, embedding')
    .eq('topic', parsed.frontmatter.topic)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('workspace_id', SOMNIO_WORKSPACE_ID)
    .maybeSingle()

  let embedding: number[]
  let action: SyncResult['action']
  if (existing && existing.body_hash === bodyHash) {
    embedding = existing.embedding as number[]
    action = 'updated_meta_only'  // body sin cambios; metadata puede haber cambiado
  } else {
    embedding = await generateEmbedding(parsed.body)
    action = existing ? 'updated_with_embedding' : 'inserted'
  }

  const upsertPayload = {
    workspace_id: SOMNIO_WORKSPACE_ID,
    agent_id: SOMNIO_V4_AGENT_ID,
    topic: parsed.frontmatter.topic,
    keywords: parsed.frontmatter.keywords,
    category: parsed.frontmatter.category,
    embedding,
    canonical_response: parsed.sections.canonica ?? null,
    nunca_decir: parsed.sections.nuncaDecir,            // W-09: alimenta post-gen check (Plan 05)
    escalate_triggers: parsed.frontmatter.escalate_if ?? [],
    related_topics: parsed.frontmatter.related_topics ?? [],
    source_md_path: filePath,
    body_hash: bodyHash,
    last_reviewed_at: parsed.frontmatter.last_reviewed,
    reviewed_by: parsed.frontmatter.reviewed_by,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('agent_knowledge_base')
    .upsert(upsertPayload, { onConflict: 'topic,agent_id,workspace_id' })

  if (error) throw new Error(`upsert failed for ${filePath}: ${error.message}`)

  return { filePath, topic: parsed.frontmatter.topic, action }
}
```

**Anti-patterns aplicados:**
- Pitfall 7: hash body, skip embedding si no cambió.
- Regla 3: `createAdminClient` se usa AQUÍ (capa de domain efectiva para esta tabla nueva — RESEARCH Shared Patterns sección "Domain layer + workspace isolation" autoriza esta excepción cuando no hay wrapper de domain todavía y la tabla es nueva del agente).
- Singleton OpenAI client (no re-init por llamada).
- W-09: persiste `nunca_decir` desde el parser sin transformación — array exacto del .md.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/knowledge-base/embed.ts && grep -q "text-embedding-3-small" src/lib/agents/somnio-v4/knowledge-base/embed.ts && grep -q "dimensions: 1536" src/lib/agents/somnio-v4/knowledge-base/embed.ts && test -f src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -q "createHash('sha256')" src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -q "body_hash === bodyHash" src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -q "onConflict: 'topic,agent_id,workspace_id'" src/lib/agents/somnio-v4/knowledge-base/sync.ts && grep -q "nunca_decir: parsed.sections.nuncaDecir" src/lib/agents/somnio-v4/knowledge-base/sync.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/ | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - `embed.ts` usa `text-embedding-3-small` con `dimensions: 1536`
    - `sync.ts` hace SHA-256 del body
    - `sync.ts` skip-rebuild embedding cuando hash coincide (Pitfall 7)
    - `sync.ts` upsert con `onConflict: 'topic,agent_id,workspace_id'`
    - `sync.ts` upsertPayload incluye `nunca_decir: parsed.sections.nuncaDecir` (W-09)
    - Cero imports desde `somnio-v3`
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
  <done>Sync core completo y funcional contra Supabase, con persistencia nunca_decir.</done>
</task>

<task type="auto">
  <name>Task 5: CLI scripts/knowledge-sync.ts</name>
  <files>scripts/knowledge-sync.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "scripts/knowledge-sync.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-55)
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts (acabado de crear)
  </read_first>
  <action>
Crear `scripts/knowledge-sync.ts`:
```typescript
#!/usr/bin/env tsx
/**
 * CLI para `pnpm knowledge:sync` (D-55).
 * Pre-PR / dev local. Para auto-sync post-deploy ver Plan 09 (Inngest function).
 *
 * Uso:
 *   pnpm knowledge:sync
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { syncKbDoc } from '@/lib/agents/somnio-v4/knowledge-base/sync'

const KB_ROOT = path.resolve(process.cwd(), 'src/lib/agents/somnio-v4/knowledge')

async function walkMd(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir).catch(() => [])
  for (const name of entries) {
    const full = path.join(dir, name)
    const st = await stat(full)
    if (st.isDirectory()) {
      out.push(...(await walkMd(full)))
    } else if (st.isFile() && name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

async function main() {
  console.log(`[knowledge:sync] root: ${KB_ROOT}`)
  const files = await walkMd(KB_ROOT)
  if (files.length === 0) {
    console.log('[knowledge:sync] (empty corpus — Plan 11 will populate)')
    return
  }
  console.log(`[knowledge:sync] processing ${files.length} files`)

  let ok = 0
  let fail = 0
  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf8')
      const r = await syncKbDoc(file, raw)
      console.log(`[knowledge:sync] ✓ ${path.relative(process.cwd(), file)} → ${r.action}`)
      ok++
    } catch (err) {
      console.error(`[knowledge:sync] ✗ ${path.relative(process.cwd(), file)}: ${(err as Error).message}`)
      fail++
      process.exitCode = 1
    }
  }
  console.log(`[knowledge:sync] done: ok=${ok} fail=${fail}`)
}

main().catch((err) => {
  console.error('[knowledge:sync] fatal:', err)
  process.exit(1)
})
```

Ejecutar localmente como smoke test (la KB_ROOT estará vacía hasta Plan 11):
```bash
pnpm knowledge:sync
# expect: "(empty corpus — Plan 11 will populate)" + exit 0
```
  </action>
  <verify>
    <automated>test -f scripts/knowledge-sync.ts && grep -q "syncKbDoc" scripts/knowledge-sync.ts && grep -q "src/lib/agents/somnio-v4/knowledge" scripts/knowledge-sync.ts && pnpm knowledge:sync 2>&1 | grep -q "empty corpus\|done:"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `scripts/knowledge-sync.ts` existe
    - Importa `syncKbDoc` desde `@/lib/agents/somnio-v4/knowledge-base/sync`
    - Walk recursivo de archivos `.md`
    - `pnpm knowledge:sync` ejecuta sin errores cuando KB_ROOT está vacía (exits 0)
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
  <done>CLI listo para Plan 11.</done>
</task>

<task type="auto">
  <name>Task 6: Commit + push de Wave 1 parte 1</name>
  <files>(todos los archivos creados en Tasks 1-5)</files>
  <read_first>
    - CLAUDE.md (Reglas 1, 4)
  </read_first>
  <action>
```bash
git add package.json pnpm-lock.yaml src/lib/agents/somnio-v4/config.ts src/lib/agents/somnio-v4/knowledge-base/ scripts/knowledge-sync.ts
git commit -m "feat(somnio-v4): plan-04 — knowledge base sync layer + gray-matter + nunca_decir persistence

- gray-matter dependency + pnpm knowledge:sync script (D-55)
- config.ts con SOMNIO_V4_AGENT_ID + SOMNIO_WORKSPACE_ID literals (D-13, D-23)
- knowledge-base/parser.ts: gray-matter + Zod FrontmatterSchema (D-45) + section parser (D-49)
- knowledge-base/coherence-check.ts: folder vs category (D-48)
- knowledge-base/embed.ts: OpenAI text-embedding-3-small dim=1536
- knowledge-base/sync.ts: SHA-256 hash + skip embedding rebuild (Pitfall 7) + upsert
  - W-09: persiste nunca_decir desde parser.sections.nuncaDecir → DB column (D-51)
- scripts/knowledge-sync.ts: CLI tsx wrapper
- 11 unit tests (parser + coherence-check)

D-24 verificado: cero imports desde @/lib/agents/somnio-v3/*
Revision fix: W-09 (nunca_decir persistido en upsert payload)

Standalone: somnio-sales-v4
Decisions: D-04, D-13, D-23, D-24, D-45, D-46, D-47, D-48, D-49, D-51, D-55

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```

Plan 04 es autónomo — no requiere migración manual (las migraciones de Wave 0 ya están aplicadas, incluyendo la columna `nunca_decir` de Plan 01), así que push es seguro inmediatamente.
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-04"</automated>
  </verify>
  <acceptance_criteria>
    - Commit + push completados
    - Vercel deploy ok (no hay nuevos imports rotos)
  </acceptance_criteria>
  <done>Wave 1 parte 1 shipped a origin/main.</done>
</task>

</tasks>

<verification>
- `pnpm install` reproduce gray-matter
- `pnpm vitest run src/lib/agents/somnio-v4/knowledge-base/` todos pasan
- `pnpm knowledge:sync` ejecuta sin errores (corpus vacío todavía)
- `pnpm typecheck` exits 0
- D-24 verificado vía grep
- W-09 verificado vía grep `nunca_decir: parsed.sections.nuncaDecir` en sync.ts
</verification>

<success_criteria>
- Plan 11 (corpus inicial) puede consumir `syncKbDoc` directamente
- Plan 05 (kb-search-tool) puede consumir `generateEmbedding` y leer `result.nunca_decir` del RPC
- Plan 09 (Inngest knowledge-sync) puede invocar `syncKbDoc` por archivo
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/04-SUMMARY.md` con:
- Versión gray-matter instalada
- Resultado de tests (X/X passed)
- Hash del commit
- Confirmación grep `nunca_decir: parsed.sections.nuncaDecir` en sync.ts (W-09)
</output>
