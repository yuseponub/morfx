---
phase: 03-action-dsl-core
plan: 01
subsystem: api
tags: [ajv, pino, jose, json-schema, tool-system, rls]

# Dependency graph
requires:
  - phase: 02-workspaces-roles
    provides: workspaces table, workspace_members with RLS
provides:
  - Tool type definitions for Action DSL
  - tool_executions table for forensic logging
  - api_keys table for external authentication
  - ajv/pino/jose dependencies for validation and logging
affects: [03-02, 03-03, 03-04, 04-crm-core, 07-whatsapp-integration]

# Tech tracking
tech-stack:
  added: [ajv 8.17, ajv-formats 3.0, pino 10.3, pino-http 11.0, jose 6.1, json-schema-to-typescript 15.0]
  patterns: [JSON Schema validation, forensic audit logging, MCP-compatible tool schemas]

key-files:
  created:
    - src/lib/tools/types.ts
    - src/lib/tools/index.ts
    - supabase/migrations/20260128000002_tool_executions.sql
    - supabase/migrations/20260128000003_api_keys.sql
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Use pnpm (project already uses it, not npm)"
  - "jose 6.1 for Edge Runtime compatibility (not jsonwebtoken)"
  - "Forensic logging with before/after snapshots for reversibility"
  - "API keys use bcrypt hash (never store plaintext)"
  - "validate_api_key() is SECURITY DEFINER for RLS bypass"

patterns-established:
  - "Tool naming: module.entity.action (e.g., crm.contact.create)"
  - "ExecutionContext always includes workspaceId and requestContext"
  - "All tool schemas include ToolMetadata with permissions array"
  - "Tool types use Permission from @/lib/permissions"

# Metrics
duration: 17min
completed: 2026-01-28
---

# Phase 3 Plan 01: Action DSL Foundation Summary

**Installed ajv/pino/jose dependencies, created tool_executions and api_keys tables with RLS, and defined MCP-compatible TypeScript types for the tool system**

## Performance

- **Duration:** 17 min
- **Started:** 2026-01-28T20:58:20Z
- **Completed:** 2026-01-28T21:14:58Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

- All 6 dependencies installed (ajv, ajv-formats, pino, pino-http, jose, json-schema-to-typescript)
- tool_executions table with forensic audit logging (inputs, outputs, snapshots, timing)
- api_keys table with secure hash storage and validate_api_key() function
- Comprehensive TypeScript types for MCP-compatible tool definitions
- RLS policies ensuring workspace isolation for both tables

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Action DSL Dependencies** - `a897df3` (chore)
2. **Task 2: Create Database Tables for Tool System** - `4820187` (feat)
3. **Task 3: Define Tool Type System** - `d1527bd` (feat)

## Files Created/Modified

- `package.json` - Added 6 new dependencies for tool system
- `pnpm-lock.yaml` - Lock file updated with new packages
- `supabase/migrations/20260128000002_tool_executions.sql` - Forensic audit log table
- `supabase/migrations/20260128000003_api_keys.sql` - API authentication table with validate function
- `src/lib/tools/types.ts` - Complete type definitions (ToolSchema, ExecutionContext, etc.)
- `src/lib/tools/index.ts` - Barrel export for clean imports

## Decisions Made

1. **pnpm instead of npm** - Project already uses pnpm (pnpm-lock.yaml exists), continued with same package manager
2. **jose 6.1 for JWT** - Edge Runtime compatible, plan specified avoiding jsonwebtoken
3. **SECURITY DEFINER for validate_api_key** - Function needs to bypass RLS to validate keys before authentication

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used pnpm instead of npm**
- **Found during:** Task 1 (Install dependencies)
- **Issue:** npm install failed repeatedly with "Cannot read properties of null (reading 'matches')" - npm 11.x bug
- **Fix:** Used pnpm which was already the project's package manager (pnpm-lock.yaml exists)
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** pnpm ls shows all packages installed
- **Committed in:** a897df3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required to unblock installation. Correct approach since project already uses pnpm.

## Issues Encountered

- npm 11.x has a bug with certain package structures causing "Cannot read properties of null" error
- Resolved by using pnpm (project's actual package manager)

## User Setup Required

None - no external service configuration required. Database migrations will be applied during Supabase deployment.

## Next Phase Readiness

- Types ready for Tool Registry implementation (03-02)
- Database tables ready for execution logging
- Dependencies ready for JSON Schema validation and structured logging
- No blockers for proceeding to Tool Registry

---
*Phase: 03-action-dsl-core*
*Plan: 01*
*Completed: 2026-01-28*
