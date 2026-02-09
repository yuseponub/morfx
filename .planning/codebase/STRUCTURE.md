# Codebase Structure

**Analysis Date:** 2026-02-09

## Directory Layout

```
morfx-new/
├── .claude/                     # Claude Code instructions
│   └── rules/                   # Code change and GSD workflow rules
├── .planning/                   # GSD planning artifacts
│   ├── codebase/                # Architecture docs (this file)
│   ├── phases/                  # Phase plans and learnings
│   └── research/                # Research artifacts
├── docs/                        # Legacy documentation
├── public/                      # Static assets
├── scripts/                     # Build and deployment scripts
├── src/
│   ├── app/                     # Next.js App Router (routes + pages)
│   ├── components/              # React components
│   └── lib/                     # Core business logic
└── [config files]               # package.json, tsconfig.json, etc.
```

## Directory Purposes

**`src/app/` (Next.js App Router):**
- Purpose: Application routing, pages, layouts, API endpoints
- Contains: Route groups, page components, API routes, webhooks
- Key files:
  - `layout.tsx`: Root layout with theme provider
  - `page.tsx`: Root redirect (authenticated → /crm, guest → /login)
  - `(auth)/`: Auth pages (login, signup, forgot-password, reset-password)
  - `(dashboard)/`: Protected dashboard routes with sidebar layout
  - `api/`: API endpoints (webhooks, agent endpoints, tool execution)

**`src/app/(dashboard)/` (Protected Routes):**
- Purpose: Authenticated user dashboard with workspace context
- Contains: CRM, WhatsApp, Analytics, Settings, Sandbox pages
- Key subdirectories:
  - `crm/`: Contact, order, product management
  - `whatsapp/`: WhatsApp inbox and conversation management
  - `sandbox/`: Agent testing environment (Phase 15)
  - `configuracion/`: WhatsApp settings (templates, quick replies, teams)
  - `settings/`: Workspace settings (members, roles)
  - `analytics/`: Analytics and reporting
  - `tareas/`: Task management

**`src/app/api/` (API Routes):**
- Purpose: External API endpoints and webhook handlers
- Contains: REST endpoints, webhook receivers
- Key files:
  - `webhooks/whatsapp/route.ts`: 360dialog webhook handler (GET verification, POST events)
  - `webhooks/shopify/route.ts`: Shopify webhook handler (order sync)
  - `agents/somnio/route.ts`: Somnio agent API endpoint (direct message processing)
  - `sandbox/process/route.ts`: Sandbox message processing (in-memory)
  - `sandbox/crm-agents/route.ts`: Sandbox CRM agent execution
  - `v1/tools/route.ts`: Tool discovery endpoint (list all tools)
  - `v1/tools/[toolName]/route.ts`: Tool execution endpoint
  - `inngest/route.ts`: Inngest function endpoint (background jobs)

**`src/lib/` (Core Business Logic):**
- Purpose: Domain logic, infrastructure, utilities
- Contains: Agents, tools, database clients, external API wrappers
- Key subdirectories:
  - `agents/`: Agent engine and implementations
  - `tools/`: Action DSL tool registry and handlers
  - `sandbox/`: In-memory sandbox components
  - `supabase/`: Database clients and middleware
  - `whatsapp/`: WhatsApp API integration
  - `shopify/`: Shopify API integration
  - `audit/`: Logging and forensic tracking
  - `permissions.ts`: Role-based permission checking

**`src/lib/agents/` (Agent System):**
- Purpose: Conversational AI agent infrastructure
- Contains: Engine, orchestrator, intent detector, session manager, Claude client
- Key files:
  - `engine.ts`: Main AgentEngine coordinator
  - `orchestrator.ts`: Base Orchestrator (decision-making)
  - `intent-detector.ts`: Intent classification with Claude Haiku
  - `claude-client.ts`: Anthropic API wrapper
  - `session-manager.ts`: Session CRUD with optimistic locking
  - `token-budget.ts`: Token usage tracking
  - `registry.ts`: Agent registry (maps agent_id to config)
  - `types.ts`: Shared types for agent system

**`src/lib/agents/somnio/` (Somnio Sales Agent):**
- Purpose: Somnio-specific agent implementation
- Contains: SomnioEngine, SomnioOrchestrator, ingest system, template management
- Key files:
  - `somnio-engine.ts`: Specialized engine with ingest and order creation
  - `somnio-orchestrator.ts`: Somnio-specific orchestration logic
  - `ingest-manager.ts`: Data collection workflow manager
  - `message-classifier.ts`: Classify messages as datos/pregunta/mixto/irrelevante
  - `data-extractor.ts`: Extract structured fields from messages
  - `template-manager.ts`: Template selection and variable substitution
  - `transition-validator.ts`: State machine transition validation
  - `order-creator.ts`: Order creation with product lookup
  - `message-sequencer.ts`: Queue and sequence response messages
  - `config.ts`: Somnio agent configuration and state machine
  - `prompts.ts`: System prompts for Claude
  - `intents.ts`: Intent definitions and combination logic

**`src/lib/agents/crm/` (CRM Agents):**
- Purpose: Domain-specific agents for CRM operations
- Contains: BaseCrmAgent, OrderManager, CrmOrchestrator
- Key files:
  - `crm-orchestrator.ts`: Routes CRM commands to appropriate agents
  - `crm-agent-registry.ts`: Registry for CRM agent handlers
  - `base-crm-agent.ts`: Base class for CRM agents
  - `order-manager/agent.ts`: Order creation agent with product lookup
  - `order-manager/tools.ts`: Order-specific tool definitions
  - `types.ts`: CRM agent types (commands, results, execution modes)

**`src/lib/tools/` (Action DSL):**
- Purpose: Tool registry, validation, execution
- Contains: Registry, executor, handlers, schemas, rate limiter
- Key files:
  - `registry.ts`: Tool registration with JSON Schema validation
  - `executor.ts`: Tool execution with dry-run, permissions, timeouts
  - `rate-limiter.ts`: Token bucket rate limiting per workspace/module
  - `types.ts`: Tool types (schemas, handlers, metadata)
  - `schemas/crm.tools.ts`: CRM tool schemas (contact, order, product)
  - `schemas/whatsapp.tools.ts`: WhatsApp tool schemas (send message, template)
  - `handlers/crm/index.ts`: CRM tool handlers
  - `handlers/whatsapp/index.ts`: WhatsApp tool handlers
  - `init.ts`: Tool registration on startup

**`src/lib/sandbox/` (Sandbox System):**
- Purpose: In-memory agent testing without database writes
- Contains: SandboxEngine, SandboxSession, IngestTimerSimulator
- Key files:
  - `sandbox-engine.ts`: In-memory version of SomnioEngine
  - `sandbox-session.ts`: In-memory session management
  - `ingest-timer.ts`: Pure-logic timer simulator (5 levels)
  - `types.ts`: Sandbox-specific types (SandboxState, TimerConfig)
  - `index.ts`: Public API for sandbox components

**`src/lib/supabase/` (Database Layer):**
- Purpose: Supabase client initialization and middleware
- Contains: Server client, browser client, admin client, middleware
- Key files:
  - `server.ts`: Server-side client with cookie-based auth
  - `client.ts`: Browser client for client components
  - `admin.ts`: Admin client for bypassing RLS
  - `middleware.ts`: Session refresh middleware

**`src/lib/whatsapp/` (WhatsApp Integration):**
- Purpose: 360dialog API integration
- Contains: API client, webhook handler, template API, cost utilities
- Key files:
  - `api.ts`: WhatsApp API client (send messages, templates)
  - `webhook-handler.ts`: Process 360dialog webhook payloads
  - `templates-api.ts`: Template management API
  - `cost-utils.ts`: Cost calculation for messages
  - `types.ts`: WhatsApp API types

**`src/lib/shopify/` (Shopify Integration):**
- Purpose: Shopify webhook handling and order sync
- Contains: Webhook handler, order mapper, contact matcher
- Key files:
  - `webhook-handler.ts`: Process Shopify webhooks
  - `order-mapper.ts`: Map Shopify orders to CRM format
  - `contact-matcher.ts`: Match Shopify customers to CRM contacts
  - `hmac.ts`: HMAC validation for webhook security
  - `types.ts`: Shopify API types

**`src/lib/audit/` (Forensic Logging):**
- Purpose: Structured logging and audit trails
- Contains: Logger factory, tool logger, activity formatters
- Key files:
  - `logger.ts`: Pino logger factory (module-specific loggers)
  - `tool-logger.ts`: Tool execution logging to database
  - `index.ts`: Public API for logging functions

**`src/components/` (React Components):**
- Purpose: Reusable UI components
- Contains: Auth forms, layout components, domain components, UI primitives
- Key subdirectories:
  - `ui/`: shadcn/ui primitives (button, input, dialog, etc.)
  - `layout/`: Sidebar, header, theme toggle, user menu
  - `providers/`: React context providers (theme, workspace)
  - `auth/`: Login, signup, forgot password forms
  - `workspace/`: Workspace switcher, create workspace form
  - `contacts/`: Contact-specific components (phone input, tag input)
  - `tasks/`: Task components (create button, task item)
  - `custom-fields/`: Custom field input and display
  - `search/`: Global search components

**`src/app/(dashboard)/sandbox/` (Sandbox UI):**
- Purpose: Agent testing interface
- Contains: Sandbox page, chat UI, debug panels
- Key files:
  - `page.tsx`: Sandbox page with split layout
  - `components/sandbox-layout.tsx`: Allotment split panel container
  - `components/sandbox-chat.tsx`: Chat message display
  - `components/sandbox-input.tsx`: Message input with send button
  - `components/debug-panel/`: Debug tabs (intent, tools, tokens, state, config, ingest)
  - `components/session-controls.tsx`: Timer controls, session save/load
  - `components/sandbox-header.tsx`: Header with agent mode toggles

## Key File Locations

**Entry Points:**
- `src/app/page.tsx`: Root redirect
- `src/app/(dashboard)/crm/page.tsx`: CRM dashboard (default authenticated landing)
- `src/app/(dashboard)/sandbox/page.tsx`: Agent sandbox
- `src/app/api/webhooks/whatsapp/route.ts`: WhatsApp message ingestion
- `src/app/api/agents/somnio/route.ts`: Direct Somnio agent API

**Configuration:**
- `package.json`: Dependencies and scripts
- `tsconfig.json`: TypeScript configuration
- `tailwind.config.ts`: Tailwind CSS configuration
- `.env.local`: Environment variables (not committed)
- `src/lib/agents/somnio/config.ts`: Somnio agent configuration
- `src/lib/tools/init.ts`: Tool registration

**Core Logic:**
- `src/lib/agents/engine.ts`: Main agent engine
- `src/lib/agents/somnio/somnio-engine.ts`: Somnio-specific engine
- `src/lib/agents/orchestrator.ts`: Base orchestrator
- `src/lib/agents/somnio/somnio-orchestrator.ts`: Somnio orchestrator
- `src/lib/tools/registry.ts`: Tool registry
- `src/lib/tools/executor.ts`: Tool execution

**Testing:**
- `src/lib/sandbox/sandbox-engine.ts`: In-memory test engine
- `src/app/api/sandbox/process/route.ts`: Sandbox API endpoint
- `src/app/(dashboard)/sandbox/page.tsx`: Sandbox UI

## Naming Conventions

**Files:**
- React components: PascalCase (e.g., `SandboxLayout.tsx`, `ContactForm.tsx`)
- TypeScript modules: kebab-case (e.g., `somnio-engine.ts`, `data-extractor.ts`)
- API routes: `route.ts` (Next.js App Router convention)
- Types: `types.ts` (shared types) or `*.types.ts` (module-specific)
- Configuration: `config.ts` or `*.config.ts`

**Directories:**
- Route groups: `(group-name)/` (e.g., `(dashboard)/`, `(auth)/`)
- Feature modules: kebab-case (e.g., `somnio/`, `custom-fields/`)
- UI components: kebab-case (e.g., `components/ui/button.tsx`)

**Variables:**
- React components: PascalCase (e.g., `SandboxEngine`, `ContactList`)
- Functions: camelCase (e.g., `executeToolFromAgent`, `processMessage`)
- Constants: SCREAMING_SNAKE_CASE (e.g., `TIMER_MINIMUM_FIELDS`, `MAX_VERSION_CONFLICT_RETRIES`)
- Types: PascalCase (e.g., `AgentSession`, `ToolExecutionResult`)

**Types:**
- Interfaces: PascalCase with descriptive name (e.g., `ProcessMessageInput`, `SomnioOrchestratorResult`)
- Enums: PascalCase (e.g., `TimerLevel`, `CrmExecutionMode`)
- Type aliases: PascalCase (e.g., `SomnioState`, `PackSelection`)

## Where to Add New Code

**New Agent:**
- Primary code: `src/lib/agents/{agent-name}/`
- Engine: `src/lib/agents/{agent-name}/{agent-name}-engine.ts`
- Orchestrator: `src/lib/agents/{agent-name}/{agent-name}-orchestrator.ts`
- Configuration: `src/lib/agents/{agent-name}/config.ts`
- Register in: `src/lib/agents/registry.ts`

**New CRM Agent:**
- Primary code: `src/lib/agents/crm/{agent-name}/`
- Agent implementation: `src/lib/agents/crm/{agent-name}/agent.ts`
- Tools: `src/lib/agents/crm/{agent-name}/tools.ts`
- Register in: `src/lib/agents/crm/crm-agent-registry.ts`

**New Tool:**
- Schema: `src/lib/tools/schemas/{module}.tools.ts` (add to existing or create new)
- Handler: `src/lib/tools/handlers/{module}/index.ts` (add to existing or create new)
- Register in: `src/lib/tools/init.ts` (import and call `toolRegistry.register()`)

**New Dashboard Page:**
- Implementation: `src/app/(dashboard)/{feature}/page.tsx`
- Layout (if needed): `src/app/(dashboard)/{feature}/layout.tsx`
- Components: `src/app/(dashboard)/{feature}/components/` (co-located) or `src/components/{feature}/` (shared)
- Server Actions: `src/app/actions/{feature}.ts`

**New API Endpoint:**
- Implementation: `src/app/api/{path}/route.ts`
- Types: Define request/response schemas with Zod in the route file
- Handlers: Call domain logic from `src/lib/` (don't put business logic in route handlers)

**New Component:**
- Shared helpers: `src/components/{category}/{ComponentName}.tsx`
- Page-specific: `src/app/(dashboard)/{page}/components/{ComponentName}.tsx`
- UI primitives: `src/components/ui/{component-name}.tsx` (shadcn/ui pattern)

**Utilities:**
- Shared helpers: `src/lib/utils.ts` (general) or `src/lib/{domain}/` (domain-specific)
- Type utilities: `src/lib/types/` (shared type definitions)
- Data utilities: `src/lib/data/` (static data like city lists)

## Special Directories

**`.planning/` (GSD Artifacts):**
- Purpose: Planning documents, research, phase learnings
- Generated: By GSD commands (`/gsd:plan-phase`, `/gsd:research-phase`)
- Committed: Yes - part of project documentation
- Structure:
  - `phases/{phase-number}-{phase-name}/`: Phase plans and learnings
  - `codebase/`: Architecture documentation (this file)
  - `research/`: Research artifacts
  - `templates/`: Template files for GSD workflow

**`.claude/` (Claude Code Instructions):**
- Purpose: Project-specific instructions for Claude Code
- Generated: Manually created during setup
- Committed: Yes - critical for consistent AI assistance
- Structure:
  - `rules/`: Code change rules, GSD workflow rules
  - `CLAUDE.md`: Main instruction file (loaded by Claude Code)

**`.next/` (Next.js Build Output):**
- Purpose: Compiled Next.js application
- Generated: During `npm run dev` or `npm run build`
- Committed: No - added to `.gitignore`

**`node_modules/` (Dependencies):**
- Purpose: Installed npm packages
- Generated: By `npm install`
- Committed: No - added to `.gitignore`

**`public/` (Static Assets):**
- Purpose: Publicly accessible static files
- Generated: Manually added or by build process
- Committed: Yes - images, icons, fonts, etc.
- URL mapping: `/public/image.png` → `https://example.com/image.png`

## Import Path Patterns

**Absolute Imports:**
- Configured in `tsconfig.json` with `"@/*": ["./src/*"]`
- Used throughout codebase for clarity
- Examples:
  - `import { createClient } from '@/lib/supabase/server'`
  - `import { AgentEngine } from '@/lib/agents/engine'`
  - `import { Button } from '@/components/ui/button'`

**Relative Imports:**
- Used only for co-located files in same directory
- Examples:
  - `import { SomnioOrchestrator } from './somnio-orchestrator'` (within `src/lib/agents/somnio/`)
  - `import { buildAction } from './helpers'` (co-located helper)

**Import Organization:**
1. External packages (React, Next, third-party)
2. Absolute imports from `@/lib/`
3. Absolute imports from `@/components/`
4. Relative imports (co-located files)
5. Type-only imports (using `import type`)

---

*Structure analysis: 2026-02-09*
