# Technology Stack for v3: Logistics Robot Integration

**Project:** MorfX - Robot Coordinadora + Chat de Comandos
**Researched:** 2026-02-20
**Confidence:** HIGH

## Executive Summary

Playwright CANNOT run in Vercel serverless functions. Chromium (~280-400 MB) exceeds Vercel's 250 MB bundle limit. Cookie persistence requires long-lived process.

**Architecture:** Separate Express.js microservice for Playwright on Railway/Render, orchestrated from MorfX via Inngest.

## Critical Constraint: Vercel + Playwright

| Constraint | Vercel Limit | Playwright Needs | Verdict |
|------------|-------------|------------------|---------|
| Bundle size | 250 MB | ~280-400 MB (Chromium) | EXCEEDS |
| Max duration | 300s Hobby / 800s Pro | 30-120s per batch | Marginal |
| File system | Ephemeral | Cookie persistence | INCOMPATIBLE |

## Stack Additions

### 1. Robot Microservice (Separate Deployment)

| Package | Version | Purpose |
|---------|---------|---------|
| `playwright` | ^1.50 | Browser automation for Coordinadora portal |
| `express` | ^5.0 | HTTP server for robot API |
| `cors` | ^2.8 | CORS middleware |
| `helmet` | ^8.0 | Security headers |
| `pino` | ^10.3 | Structured logging |

### 2. MorfX <-> Robot Communication

No new deps. Use existing Inngest (`step.run` → HTTP POST to robot).

### 3. Chat de Comandos

No new deps. Pure React + Tailwind (~200 lines). Do NOT use xterm.js.

### 4. City Data

Supabase table `coordinadora_cities` (1,488 rows). Seeded via migration.

### 5. Pipeline Integration

No new deps. Extend existing `order.stage_changed` trigger + domain layer.

## Deployment Architecture

```
VERCEL (MorfX Next.js)          RAILWAY (Robot Service)
  - CRM UI                        - Express + Playwright
  - Chat de Comandos               - Cookie persistence
  - API routes                     - /data/cookies/
  - Inngest serve
        |                               |
        +--- Inngest (orchestration) ---+
        |                               |
        +--- Supabase (shared DB) ------+
```

## Cookie/Session Persistence

```typescript
// Save after login
await context.storageState({ path: '/data/cookies/coordinadora.json' });
// Restore
const context = await browser.newContext({ storageState: '/data/cookies/coordinadora.json' });
```

## Long-Running Operations via Inngest

```
Event: robot/coordinadora.batch_create
  step.run('validate-orders')  → Validate in MorfX DB
  step.run('call-robot-batch') → HTTP POST to robot (30-120s on Railway)
  step.run('update-orders')    → Update orders with tracking numbers
```

Progress: Robot writes to `robot_executions` table → Supabase Realtime → Chat UI.

## What NOT to Add

| Technology | Why NOT |
|-----------|---------|
| xterm.js | 100+ KB overkill for fixed commands |
| puppeteer | Inferior to Playwright for MUI automation |
| WebSocket | HTTP + Inngest simpler with built-in durability |
| n8n | Being replaced by Inngest |
| BullMQ/Redis | Inngest provides queue functionality |
| axios/got | Native fetch() sufficient |

---
*Research completed: 2026-02-20*
