# Project Research Summary

**Project:** MorfX v3.0 — Logística (Robot Coordinadora + Chat de Comandos)
**Researched:** 2026-02-20
**Confidence:** HIGH

## Executive Summary

MorfX v3 integrates browser automation robots for Colombian shipping carriers into the CRM platform. The critical finding is that **Playwright cannot run in Vercel serverless** (Chromium exceeds 250 MB bundle limit). The recommended architecture is a separate Express.js microservice on Railway ($5-10/mo) orchestrated via Inngest, with a simple command chat in the MorfX UI for operations teams.

The existing MorfX infrastructure is well-suited for this integration: orders already have carrier/tracking fields, Inngest provides durable orchestration, domain layer ensures automation triggers fire on updates, and Supabase Realtime enables live progress tracking.

## Key Findings

### Stack
- **Playwright must run as separate service** on Railway/Render (Docker with official Playwright image)
- **Zero new deps in MorfX** — Chat de Comandos is pure React+Tailwind, orchestration via existing Inngest
- **Cookie persistence** via Playwright `storageState` API on Railway persistent disk
- **Do NOT add** xterm.js, puppeteer, WebSocket, Redis/BullMQ — all overkill

### Features
- **Table stakes:** Pipeline stage→robot trigger, city validation (DANE codes), command interface, carrier config per workspace, bulk processing, real-time progress
- **Differentiators:** Inline command chat (replaces Slack), live robot progress, cross-pipeline tracking
- **Anti-features:** Carrier API integration (Playwright is battle-tested, APIs are unreliable), autonomous scheduling, WMS, rate shopping
- **DANE code database** is foundation — blocks all carrier integrations

### Architecture
- **Data flow:** User command → API route → Inngest event → Robot service (HTTP) → Per-order callback → Domain layer → Supabase Realtime → UI
- **New tables:** `dane_municipalities`, `carrier_coverage`, `robot_jobs`, `robot_job_items`
- **New domain functions:** `updateOrderShipping()`, `createRobotJob()`, `updateRobotJobItem()`
- **Robot service:** Express + Playwright in Docker, ~6 endpoints, stateless except cookies
- **Multi-tenant:** Credentials per workspace, passed per-request, never stored by robot

### Critical Pitfalls
1. **Playwright on Vercel** — BLOCKER, must be separate service
2. **Partial batch failures** — Need per-order tracking, idempotency, resume capability
3. **MUI Autocomplete** — Specific interaction sequence required (type slowly, wait for listbox, click option, verify)
4. **Portal UI changes** — Externalize selectors, use ARIA over CSS, health checks
5. **Domain layer bypass** — Robot MUST update through MorfX API → domain layer (not direct DB)
6. **Cookie expiration** — Validate session before batch, re-login strategy with backoff
7. **Progress updates** — Use Supabase Realtime (proven), NOT SSE/WebSocket

## Implications for Roadmap

### Suggested 5-phase structure:

| Phase | Name | Risk | Key Deliverables |
|-------|------|------|-----------------|
| 21 | DB + Domain Foundation | LOW | dane_municipalities, carrier_coverage, robot_jobs tables; domain functions; Inngest events |
| 22 | Robot Service | MEDIUM | Express + Playwright on Railway; Coordinadora adapter; cookie management; selector system |
| 23 | Inngest Orchestrator + API | LOW | robot-job-orchestrator function; /api/robots/* endpoints; callback → domain integration |
| 24 | Chat de Comandos UI | LOW | Command panel; command parser; Supabase Realtime progress; job history |
| 25 | Pipeline Integration + Polish | LOW | Stage → robot trigger; carrier config UI; workspace credential management |

### Build Order Rationale
- Phase 21 first: DB schema is dependency for everything else
- Phase 22 is critical path: most risk (Playwright, portal interaction)
- Phase 23 connects MorfX ↔ Robot: enables end-to-end testing
- Phase 24 is UI: can partly develop in parallel with 22-23
- Phase 25 ties everything together: pipeline automation + config

## Sources

### High Confidence
- Vercel Functions Limits docs (verified 2026-02-20)
- MorfX codebase analysis (domain layer, Inngest patterns, orders model)
- Existing robot-coordinadora codebase (Playwright patterns, selectors, city data)
- Playwright storageState API (official docs)

### Medium Confidence
- Railway deployment patterns and pricing (training data)
- Playwright exact latest version (needs npm verification)
- Coordinadora portal stability (needs live testing)

---
*Research completed: 2026-02-20*
*Ready for requirements: yes*
