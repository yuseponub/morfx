# Phase 43 Plan 12 — Postgres FTS Measurement Plan

Status: **STUB — awaiting seed + measurement run**

This document settles Research Open Question #1 ("Search backend: Postgres
FTS vs external index") with measured evidence, not hand-waving. The plan
ships Postgres FTS as the default path. This file defines the exact
measurement procedure and the escalation criterion that decides whether to
keep FTS or add Meilisearch/Typesense in a follow-up phase.

The migration (`supabase/migrations/20260410_messages_fts.sql`, commit
`78f0577`) was applied to production **2026-04-20** per user confirmation.
The search endpoint (`src/app/api/mobile/search/route.ts`) and mobile UI
ship in Plan 43-12 and are live as of this document's creation. Numbers
below must be collected against a representative workspace AFTER seeding
synthetic traffic.

## 1. Seed Plan

Seed ~50,000 synthetic messages into a dev workspace. This is roughly the
upper bound of what a mature MorfX workspace accumulates over a year of
moderate-to-heavy WhatsApp traffic. Pick a dev workspace with < 100
existing messages so the seed dominates the signal.

### 1.1 Pick a dev workspace id

```sql
-- Find a low-traffic dev workspace.
SELECT id, name, (SELECT COUNT(*) FROM messages m WHERE m.workspace_id = w.id) AS msg_count
FROM workspaces w
ORDER BY msg_count ASC
LIMIT 5;
```

Record the chosen workspace id here: `__________` (fill before running).

### 1.2 Seed ~50k synthetic messages

Run in Supabase SQL Editor. Uses `generate_series` to create predictable
synthetic bodies that exercise the Spanish dictionary (stopwords,
accented tokens, plurals) — so FTS measurements reflect real behaviour,
not a degenerate one-word corpus.

```sql
-- Replace the two placeholders before running.
WITH params AS (
  SELECT
    '__WORKSPACE_ID__'::uuid       AS workspace_id,
    '__CONVERSATION_ID__'::uuid    AS conversation_id,
    50000                          AS n_messages
),
-- Vocabulary: Spanish words of varying lengths so the tsvector has
-- realistic token variety. Stopwords ("de", "la") get stripped by
-- to_tsvector('spanish', ...) so they should NOT influence FTS scores.
vocab(word) AS (
  VALUES
    ('pedido'), ('producto'), ('envio'), ('pago'), ('factura'),
    ('cliente'), ('descuento'), ('ubicacion'), ('direccion'), ('telefono'),
    ('whatsapp'), ('confirmacion'), ('entrega'), ('devolucion'),
    ('contrareembolso'), ('transferencia'), ('garantia'), ('promocion'),
    ('hola'), ('gracias'), ('por favor'), ('buenas tardes')
),
-- Precompute a deterministic body per series index using 4 random vocab
-- words. Repeatable with the same seed for auditability.
bodies AS (
  SELECT
    i,
    (SELECT word FROM vocab ORDER BY md5(i::text || '1') LIMIT 1) || ' ' ||
    (SELECT word FROM vocab ORDER BY md5(i::text || '2') LIMIT 1) || ' ' ||
    (SELECT word FROM vocab ORDER BY md5(i::text || '3') LIMIT 1) || ' ' ||
    (SELECT word FROM vocab ORDER BY md5(i::text || '4') LIMIT 1) AS body
  FROM generate_series(1, (SELECT n_messages FROM params)) i
)
INSERT INTO messages (
  workspace_id, conversation_id, direction, type, content,
  timestamp, created_at
)
SELECT
  params.workspace_id,
  params.conversation_id,
  CASE WHEN i % 2 = 0 THEN 'inbound' ELSE 'outbound' END,
  'text',
  jsonb_build_object('body', bodies.body),
  NOW() - (i || ' seconds')::interval,
  NOW() - (i || ' seconds')::interval
FROM bodies, params;
```

**Expected duration:** 30–120s depending on DB size. The `GENERATED ALWAYS
... STORED` `fts` column is built at write time, so the GIN index gets
populated during the INSERT.

**Cleanup after measurements (optional but recommended):**

```sql
DELETE FROM messages
WHERE workspace_id = '__WORKSPACE_ID__'::uuid
  AND content->>'body' LIKE '%pedido%producto%envio%pago%';  -- adjust to hit the seed pattern
```

## 2. Measurement Procedure

Each of the 5 queries below runs twice:
  - **Warm cache** — run the query once to warm the cache, then EXPLAIN ANALYZE.
  - **Cold cache** — after `DISCARD ALL; SELECT pg_stat_reset();` (Supabase
    may or may not permit this — record whether you got cold numbers).

Record execution time from the `Execution Time: X.Y ms` footer of EXPLAIN
ANALYZE. Run each query 5 times and compute p50 (median) + p95 (5th-of-5).

### 2.1 Query A — single common token

```sql
EXPLAIN ANALYZE
SELECT m.id, m.content->>'body', m.created_at
FROM messages m
WHERE m.workspace_id = '__WORKSPACE_ID__'::uuid
  AND m.fts @@ websearch_to_tsquery('spanish', 'pedido')
ORDER BY m.created_at DESC
LIMIT 30;
```

### 2.2 Query B — two-token AND

```sql
EXPLAIN ANALYZE
SELECT m.id, m.content->>'body', m.created_at
FROM messages m
WHERE m.workspace_id = '__WORKSPACE_ID__'::uuid
  AND m.fts @@ websearch_to_tsquery('spanish', 'pedido envio')
ORDER BY m.created_at DESC
LIMIT 30;
```

### 2.3 Query C — rare token (tail of vocabulary)

```sql
EXPLAIN ANALYZE
SELECT m.id, m.content->>'body', m.created_at
FROM messages m
WHERE m.workspace_id = '__WORKSPACE_ID__'::uuid
  AND m.fts @@ websearch_to_tsquery('spanish', 'contrareembolso')
ORDER BY m.created_at DESC
LIMIT 30;
```

### 2.4 Query D — phrase search

```sql
EXPLAIN ANALYZE
SELECT m.id, m.content->>'body', m.created_at
FROM messages m
WHERE m.workspace_id = '__WORKSPACE_ID__'::uuid
  AND m.fts @@ websearch_to_tsquery('spanish', '"por favor"')
ORDER BY m.created_at DESC
LIMIT 30;
```

### 2.5 Query E — contact ILIKE (fallback path, not FTS)

This exercises the contact-name fast path the search endpoint uses
alongside the message FTS query.

```sql
EXPLAIN ANALYZE
SELECT c.id, c.name, c.phone
FROM contacts c
WHERE c.workspace_id = '__WORKSPACE_ID__'::uuid
  AND (c.name ILIKE '%maria%' OR c.phone ILIKE '%3001234%')
LIMIT 20;
```

## 3. Results Table

Fill after measurements. All times in milliseconds (`ms`).

| Query | Description           | Result Count | p50 (warm) | p95 (warm) | p50 (cold) | p95 (cold) | Pass/Fail |
| ----- | --------------------- | ------------ | ---------- | ---------- | ---------- | ---------- | --------- |
| A     | single common token   |              |            |            |            |            |           |
| B     | two-token AND         |              |            |            |            |            |           |
| C     | rare token            |              |            |            |            |            |           |
| D     | phrase search         |              |            |            |            |            |           |
| E     | contact ILIKE         |              |            |            |            |            |           |

**Pass criterion per row:** p95 (warm) ≤ 500 ms.

**Overall measurement result:** `_____` (fill: PASS / ESCALATE).

## 4. Escalation Criterion

**If any row's p95 (warm) > 500 ms on a workspace with ≥ 50,000 messages:**
create a follow-up phase (`phase-gaps/meilisearch-search.md` or similar)
documenting the migration to Meilisearch/Typesense. Until that phase lands,
Postgres FTS stays in production and the mobile UI keeps functioning —
search will just feel slow.

**If all rows pass (p95 ≤ 500 ms):** record "PASS — Postgres FTS is
adequate for MorfX's current message volume. Revisit if any workspace
crosses 500k messages."

## 5. Round-Trip Latency (Mobile → Endpoint → DB → Mobile)

The numbers above measure DB-only latency. The mobile client adds:

- Mobile → Vercel edge (~50–200 ms on 4G in Bogota)
- Vercel serverless cold start (~300–1000 ms first hit; ~20 ms warm)
- DB query (measured above)
- JSON serialize + return (~10 ms for 50 rows)

**Budget for end-to-end mobile search latency:**

- Cold path: ≤ 2 s (user accepts a visible spinner for the first query)
- Warm path: ≤ 800 ms (feels responsive)

If the DB p95 passes the 500 ms bar but end-to-end p95 exceeds 2 s, the
culprit is Vercel cold-start — addressable by moving the endpoint to the
Edge runtime (outside this plan's scope).

## 6. Notes

- `ts_headline` is **not** used in the current endpoint implementation —
  snippet extraction runs in TS to avoid a second Regla-5 migration for
  an RPC function. If measurements show the in-TS extraction is a
  bottleneck at 50-row responses (unlikely — it's O(n × body_length) on
  50 rows × ≤ 1 KB each), a follow-up can introduce `search_messages(
  workspace_id, q)` as a plpgsql RPC that runs `ts_headline` server-side.
- The migration uses `coalesce(content ->> 'body', '')` for the tsvector
  expression. Non-text messages (image/audio/etc.) contribute empty
  vectors and are effectively invisible to FTS — which is correct
  behaviour (users don't type text looking for images).
- `messages.created_at` defaults to `timezone('America/Bogota', NOW())`
  per Regla 2, so the ORDER BY in the endpoint returns rows in Bogota
  wall-clock order without any application-side TZ conversion.
