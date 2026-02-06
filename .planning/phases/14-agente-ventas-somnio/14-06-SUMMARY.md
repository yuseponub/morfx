---
phase: 14-agente-ventas-somnio
plan: 06
subsystem: agents
tags: [somnio-engine, order-creator, api-route, end-to-end, integration]

# Dependency graph
requires:
  - phase: 14-01
    provides: somnioAgentConfig, intent definitions
  - phase: 14-02
    provides: DataExtractor for customer data extraction
  - phase: 14-03
    provides: TemplateManager, variable substitution, SOMNIO_PRICES
  - phase: 14-04
    provides: MessageSequencer for delayed message sending
  - phase: 14-05
    provides: SomnioOrchestrator, TransitionValidator, shouldCreateOrder flag
provides:
  - OrderCreator for contact/order creation on compra_confirmada
  - SomnioEngine as main entry point for Somnio agent
  - API route /api/agents/somnio for webhook integration
affects: [15-agent-sandbox, 16-whatsapp-agent-integration]

# Tech tracking
tech-stack:
  added:
    - zod (request validation in API route)
  patterns:
    - Action DSL tool execution via executeToolFromAgent
    - Phone normalization for contact matching
    - Shipping address builder from captured fields
    - Engine composition pattern (DI via constructor)

key-files:
  created:
    - src/lib/agents/somnio/order-creator.ts
    - src/lib/agents/somnio/somnio-engine.ts
    - src/app/api/agents/somnio/route.ts
  modified:
    - src/lib/agents/somnio/index.ts

key-decisions:
  - "OrderCreator uses executeToolFromAgent for crm.contact.* and crm.order.* tools"
  - "Contact search by phone with normalization (last 10 digits matching)"
  - "Duplicate phone handling with retry search on PHONE_DUPLICATE error"
  - "Pack to product mapping with hardcoded prices (77900/109900/139900)"
  - "SomnioEngine wires shouldCreateOrder to OrderCreator.createContactAndOrder"
  - "API route returns 503 for retryable errors, 500 for non-retryable"

patterns-established:
  - "OrderCreator.findOrCreateContact with phone matching and update"
  - "ContactData interface for typed captured data conversion"
  - "SomnioEngineResult with comprehensive response fields"
  - "Zod schema validation for API request body"

# Metrics
duration: 5min
completed: 2026-02-06
---

# Phase 14 Plan 06: Somnio Engine & API Route Summary

**OrderCreator, SomnioEngine, and API route completing end-to-end Somnio sales agent flow**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T17:15:00Z
- **Completed:** 2026-02-06T17:20:00Z
- **Tasks:** 2 + human verification checkpoint
- **Files modified:** 4

## Accomplishments

- Created OrderCreator with findOrCreateContact and createOrder methods
- Phone normalization for contact matching (last 10 digits comparison)
- Handle duplicate phone error with retry search
- Pack to product mapping (1x/2x/3x -> product name, quantity, price)
- Shipping address builder combining direccion, barrio, ciudad, departamento
- Created SomnioEngine integrating all Somnio components
- Session management via getOrCreateSession
- Intent detection and orchestration flow
- CRITICAL: Wired shouldCreateOrder flag to OrderCreator.createContactAndOrder
- State updates from orchestrator result
- Message sending via MessageSequencer with pending merge
- Created API route /api/agents/somnio with Zod validation
- Error handling with HTTP status mapping (503 retryable, 500 non-retryable)
- Comprehensive logging throughout

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OrderCreator** - `9315d6f` (feat)
2. **Task 2: Create SomnioEngine and API route** - `e75cddf` (feat)

## Files Created/Modified

- `src/lib/agents/somnio/order-creator.ts` - OrderCreator class, ContactData, OrderData, OrderCreationResult
- `src/lib/agents/somnio/somnio-engine.ts` - SomnioEngine class, SomnioProcessMessageInput, SomnioEngineResult
- `src/app/api/agents/somnio/route.ts` - POST handler with Zod validation
- `src/lib/agents/somnio/index.ts` - Export OrderCreator, SomnioEngine and types

## Decisions Made

1. **Action DSL tools for order creation:** Use executeToolFromAgent instead of direct database calls for consistency and tracing
2. **Phone matching normalization:** Compare last 10 digits to handle country codes and formatting differences
3. **Retry on duplicate phone:** If create fails with PHONE_DUPLICATE, search again more broadly and update existing
4. **Hardcoded prices:** SOMNIO_PRICES_NUMERIC matches SOMNIO_PRICES for consistency
5. **contactId fallback:** Use conversationId as contactId if not provided in API request

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - execution proceeded smoothly.

## User Setup Required

1. Insert test templates into `agent_templates` table via Supabase Studio
2. Configure workspace with valid workspaceId
3. Test API endpoint with curl or similar

## Phase 14 Complete

With Plan 06 complete, Phase 14 (Agente Ventas Somnio) is now finished:

- **14-01:** Database schema, 20 intents, system prompts
- **14-02:** DataExtractor with normalization and inference
- **14-03:** TemplateManager with variable substitution
- **14-04:** MessageSequencer with delays and interruption handling
- **14-05:** SomnioOrchestrator with transition validation
- **14-06:** OrderCreator, SomnioEngine, API route

The Somnio sales agent now has:
- 20 intent definitions (22 base + 11 combinations = 33 total)
- Customer data extraction with 8 fields
- Template management with variable substitution
- Message sequencing with delays (2-6 seconds)
- Transition validation per CONTEXT.md rules
- Order creation on compra_confirmada
- API endpoint at /api/agents/somnio

Ready for Phase 15: Agent Sandbox.

---
*Phase: 14-agente-ventas-somnio*
*Completed: 2026-02-06*
