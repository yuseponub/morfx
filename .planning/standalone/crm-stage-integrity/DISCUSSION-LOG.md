# Standalone: CRM Stage Integrity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Origin:** User reported production bug: "aveces se devuelven pedidos de un stage a otro despues de haberlos movido"
**Areas discussed:** DB locking, Cycle detection, Inngest concurrency, Audit log, Kanban UX, Scope, Feature flags

---

## Pre-discussion Audit

Two parallel Explore agents ran a code audit before the discuss step, producing findings across:
- Stage mutation paths (domain, server actions, agents, webhooks, automations)
- Race condition surface (concurrent writes, optimistic UI, cache revalidation)
- Cycle detection in Builder validation
- Inngest runner concurrency
- Kanban drag-and-drop bounce-back logic

Hypotheses ranked:
- H1: Automatizacion circular (60-70% probabilidad)
- H2: Race condition webhook + manual (20-25%)
- H3: Kanban bounce-back cache stale (10-15%)

See pre-discussion transcript for full audit findings.

---

## Gray Area Selection

**Question presented:** ¿Qué áreas quieres discutir para el fix?

| Option | Description | Selected |
|--------|-------------|----------|
| DB-level locking | Optimistic CAS, version field, or advisory lock | Claude's discretion |
| Cycle detection | Rewrite conditionsPreventActivation, runtime kill-switch, or cap cascade | Claude's discretion |
| Inngest concurrency | Per-orderId limit or DB lock inside action | Claude's discretion |
| Audit log stages | New table order_stage_history vs ephemeral logging | ✓ User confirmed: crear tabla |
| Kanban UX | Realtime subscription, extend timeout, or toast rollback | Claude's discretion |
| Scope / fases | All-in-one vs P0/P1 split | Claude's discretion |
| Feature flag | Behind flag vs direct deploy with rollback plan | Claude's discretion |

**User response:** "no entiendo nada de esto, tocaria que tu investigues; segun el codigo que tenemos, el domain layer(para unir acciones de bots y crm) y lo que encuentres en internet para arreglar los bugs que podamos llegar a tener. respecto al audit log, si, crealo"

**User response (follow-up):** "esto tampoco lo se, revisa si ya se aplican estos sistemas antes de implementarlos y hazlo lo mas funcional posible sin bugs"

**Interpretation:** User delegates technical implementation decisions to Claude (founder/visionary role per discuss-phase philosophy). Mandatos explicitos:
1. ✓ Crear audit log (tabla `order_stage_history`)
2. ✓ Investigar lo que ya existe antes de implementar
3. ✓ Funcional sin bugs (calidad sobre velocidad, Regla 0)
4. ✓ Leveragear domain layer como punto unico de enforcement

---

## Claude's Discretion Areas

User explicitly deferred the following to Claude. Decisions locked in CONTEXT.md:

### DB-level locking
**Alternatives considered:**
| Option | Pros | Cons | Chosen |
|--------|------|------|--------|
| Optimistic compare-and-swap (`.eq('stage_id', prev)`) | Simple, no schema migration, atomic | Caller must handle retry | ✓ |
| Version field incremental | Works for any column | Requires migration + all callers must pass version | |
| Advisory lock (pg_try_advisory_lock) | Strongest guarantee | Operational complexity, lock bookkeeping | |

**Rationale:** CAS is the simplest pattern that solves the observed bug. Stage_id is a single column; version field would be overkill.

### Cycle detection
**Alternatives considered:**
| Option | Pros | Cons | Chosen |
|--------|------|------|--------|
| Fix `conditionsPreventActivation` only | Addresses root cause in Builder | Won't catch loops that depend on runtime data | Partial (layer 1) |
| Runtime kill-switch (count changes/minute) | Catches any loop regardless of build-time analysis | Reactive, not preventive; may block legit rapid changes | ✓ (layer 2) |
| Lower MAX_CASCADE_DEPTH to 1 for change_stage | Simple | Breaks legit cascades (create order → assign → move) | Partial (layer 3) |

**Rationale:** Defense-in-depth — no single layer catches everything; combined they provide both prevention (build-time) and containment (runtime).

### Inngest concurrency
**Alternatives considered:**
| Option | Pros | Cons | Chosen |
|--------|------|------|--------|
| Concurrency `event.data.orderId`, limit=1 | Native to Inngest, zero new infra | Reduces parallelism for different orders in same workspace? No — different orderIds scale independently | ✓ |
| DB advisory lock inside action | Works even if Inngest orders out of sequence | Adds query round-trip, potential deadlocks | |
| Leave as-is, rely on CAS alone | No changes | CAS rejects but retries could cascade chaos | |

**Rationale:** Serialization at Inngest level is cheap and complements CAS at domain level (belt + suspenders).

### Audit log shape
**Alternatives considered:**
| Option | Pros | Cons | Chosen |
|--------|------|------|--------|
| New dedicated `order_stage_history` table | First-class columns indexable, UI-ready | Schema migration | ✓ |
| Extend `mutation_audit` with `source`/`actor_id` | Single audit surface | Schema change affects all audited tables | |
| Ephemeral logs only (Vercel/Inngest) | No DB cost | Not queryable, no user-facing timeline possible | |

**Rationale:** User explicitly asked for audit log. Dedicated table enables future UI timeline and kill-switch queries without scanning JSONB.

### Kanban UX
**Alternatives considered:**
| Option | Pros | Cons | Chosen |
|--------|------|------|--------|
| Supabase Realtime subscription + toast on CAS reject | Full solution, user always sees truth | New subscription pattern in Kanban | ✓ |
| Extend bounce-back timeout from 2s to 5s | Trivial | Band-aid, doesn't fix external source changes | Complementary (kept 2s) |
| Remove optimistic updates entirely | Simplest | Worst UX, every drag feels laggy | |

**Rationale:** Pattern already used in WhatsApp inbox — proven approach in this codebase.

### Feature flags
**Alternatives considered:**
| Option | Pros | Cons | Chosen |
|--------|------|------|--------|
| Flag compare-and-swap only | Most surgical | Other changes go direct | ✓ |
| Flag everything | Maximum safety | Coordination overhead | |
| No flags | Fastest delivery | Violates Regla 6 | |

**Rationale:** CAS changes observable behavior (rejections surface as errors). Audit log + Inngest concurrency are additive — no regression risk.

### Scope
**Alternatives considered:**
| Option | Pros | Cons | Chosen |
|--------|------|------|--------|
| All-in-one standalone | Coherent fix, no gaps | Longer to ship | ✓ |
| P0 hotfix (CAS + kill-switch) + P1 (UI + audit) later | Faster P0 delivery | Leaves observability gap, can't diagnose if fix works | |

**Rationale:** User said "muy solido" — all-in-one matches. Regla 0: calidad sobre eficiencia.

---

## Deferred Ideas

- UI timeline visual de `order_stage_history` en sheet del pedido.
- Backfill history desde `mutation_audit`.
- Generalizar kill-switch a otros triggers (tag.assigned, contact.created).
- Refactor completo del cycle detector.
- Presence indicators en Kanban (ver quien esta viendo pedido).
- Idempotency mejorada para agents (ya cubierto por two-step).

---

*Log generado 2026-04-21 al final de discuss-phase para standalone crm-stage-integrity.*
