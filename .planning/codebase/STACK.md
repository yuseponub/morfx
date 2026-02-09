# Technology Stack

**Analysis Date:** 2026-02-09

## Languages

**Primary:**
- TypeScript 5.x - All application code (strict mode enabled)
- JavaScript (ES2017+) - Config files (.mjs, .config.ts)

**Secondary:**
- SQL - Supabase migrations and RLS policies
- CSS - Tailwind utility classes, global styles

## Runtime

**Environment:**
- Node.js 20+ (inferred from Next.js 16 requirements)
- Next.js 16.1.5 with App Router
- React 19.2.3 (19.x server components)

**Package Manager:**
- npm (package-lock.json expected)
- Lockfile: Not visible in repo (likely gitignored or npm workspaces)

**Development Server:**
- Port: 3020 (configured in `package.json` scripts)

## Frameworks

**Core:**
- Next.js 16.1.5 - App Router, Server Actions, Server Components
  - Turbopack enabled for dev (`next.config.ts`)
  - 20MB body size limit for Server Actions
  - Image optimization for Supabase Storage domains
- React 19.2.3 - Server and Client Components
- TypeScript 5.x - Strict mode, path aliases (`@/*` → `./src/*`)

**Testing:**
- None configured - No Jest, Vitest, or testing dependencies detected

**Build/Dev:**
- Next.js 16.1.5 - Built-in bundler with Turbopack
- ESLint 9.x - Next.js config (eslint-config-next)
- TypeScript Compiler 5.x - Type checking (noEmit mode)

**UI Component Framework:**
- Radix UI (headless primitives) - 15+ components
  - Alert Dialog, Avatar, Checkbox, Dialog, Dropdown Menu
  - Label, Popover, Progress, Radio Group, Scroll Area
  - Select, Separator, Slot, Switch, Tabs, Toggle Group, Tooltip
- shadcn/ui patterns (inferred from Radix usage)

**Styling:**
- Tailwind CSS 4.x - Utility-first CSS framework
  - PostCSS plugin: `@tailwindcss/postcss` v4
  - Custom variant: `.dark` class support
  - tw-animate-css 1.4.0 - Animation utilities
- class-variance-authority 0.7.1 - CVA for component variants
- tailwind-merge 3.4.0 - Merge Tailwind classes
- clsx 2.1.1 - Conditional class names
- next-themes 0.4.6 - Dark mode support

**State Management & Data:**
- @tanstack/react-table 8.21.3 - Table state and UI
- @tanstack/react-virtual 3.13.18 - Virtual scrolling
- react-hook-form 7.71.1 - Form state management
- @hookform/resolvers 5.2.2 - Zod integration for forms
- Zod 4.3.6 - Schema validation and type inference

**UI Libraries:**
- lucide-react 0.563.0 - Icon library
- recharts 3.7.0 - Chart components
- sonner 2.0.7 - Toast notifications
- cmdk 1.1.1 - Command palette
- emblor 1.4.8 - Tag input component
- allotment 1.20.5 - Split pane layouts
- react-day-picker 9.13.0 - Date picker
- @webscopeio/react-textarea-autocomplete 4.9.2 - Autocomplete textarea

**Drag & Drop:**
- @dnd-kit/core 6.3.1 - Drag and drop framework
- @dnd-kit/sortable 10.0.0 - Sortable lists
- @dnd-kit/utilities 3.2.2 - DnD utilities

**Data Utilities:**
- date-fns 4.1.0 - Date manipulation (Colombia timezone: America/Bogota)
- libphonenumber-js 1.12.35 - Phone number parsing/validation
- fuse.js 7.1.0 - Fuzzy search
- papaparse 5.5.3 - CSV parsing
- react-csv-importer 0.8.1 - CSV import UI

## Key Dependencies

**Critical:**
- @anthropic-ai/sdk 0.73.0 - Claude API client for agent engine
  - Used in: Intent detection, orchestration, data extraction
  - Models: claude-haiku-4-5, claude-sonnet-4-5 (mapped to claude-sonnet-4-20250514)
  - Location: `src/lib/agents/claude-client.ts`
- @supabase/supabase-js 2.93.1 - Supabase client SDK
  - Auth, Database queries, RLS, Storage
  - Location: `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`, `middleware.ts`
- @supabase/ssr 0.8.0 - Server-side rendering support for Supabase
- inngest 3.51.0 - Durable workflow orchestration
  - Agent timer workflows (data collection, promos timeout)
  - Location: `src/inngest/client.ts`, `src/inngest/functions/agent-timers.ts`
  - Serve endpoint: `src/app/api/inngest/route.ts`

**Infrastructure:**
- pino 10.3.0 - Structured logging with GDPR-compliant redaction
  - Location: `src/lib/audit/logger.ts`
  - Redacts: passwords, tokens, API keys, email, phone, cookies
- pino-http 11.0.0 - HTTP request logging middleware
- ajv 8.17.1 - JSON Schema validation for Action DSL tools
  - Location: `src/lib/tools/registry.ts`
  - 10x faster with compiled validators
- ajv-formats 3.0.1 - Additional formats for Ajv (email, uri, date-time)
- jose 6.1.3 - JWT/JWE/JWS operations
- browser-image-compression 2.0.2 - Client-side image compression
- talisman 1.1.4 - Security headers middleware

**External Integration SDKs:**
- @shopify/shopify-api 12.3.0 - Shopify API client
  - Location: `src/lib/shopify/`
  - Webhook handler: `src/app/api/webhooks/shopify/route.ts`
- 360dialog WhatsApp Cloud API - Custom implementation (no SDK)
  - Location: `src/lib/whatsapp/api.ts`
  - Base URL: https://waba-v2.360dialog.io
  - Webhook handler: `src/app/api/webhooks/whatsapp/route.ts`

**Development Tools:**
- json-schema-to-typescript 15.0.4 - Generate TypeScript types from JSON schemas
- @types/node 20.x - Node.js type definitions
- @types/react 19.x - React type definitions
- @types/react-dom 19.x - React DOM type definitions
- @types/papaparse 5.5.2 - Papaparse type definitions

**Visualization & Debug:**
- @uiw/react-json-view 2.0.0-alpha.41 - JSON viewer component
  - Used in: Sandbox debug panel for agent state inspection
- frimousse 0.3.0 - Purpose unclear (facial expression library?)

## Configuration

**Environment:**
- Required variables (from `process.env` usage):
  - `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon public key
  - `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only)
  - `ANTHROPIC_API_KEY` - Claude API key for agent engine
  - `WHATSAPP_API_KEY` - 360dialog API key
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Webhook verification token
  - `WHATSAPP_DEFAULT_WORKSPACE_ID` - Default workspace for webhooks
  - `WHATSAPP_PHONE_NUMBER_ID` - 360dialog phone number ID
  - `INNGEST_EVENT_KEY` - Inngest event key (production)
  - `INNGEST_SIGNING_KEY` - Inngest webhook signature verification
  - `MORFX_OWNER_USER_ID` - Super admin user ID
  - `NODE_ENV` - Environment (development/production)
  - `NEXT_PUBLIC_APP_URL` - Application public URL
- Environment files:
  - `.env.local` - Local development (gitignored)
  - `.env.example` - Example template (only shows Supabase vars)

**Build:**
- `next.config.ts` - Next.js configuration
  - Turbopack enabled
  - Server Actions body size: 20MB
  - Image domains: `*.supabase.co/storage/v1/object/public/**`
- `tsconfig.json` - TypeScript configuration
  - Target: ES2017
  - Strict mode: enabled
  - Path aliases: `@/*` → `./src/*`
  - JSX: react-jsx (React 19)
  - Module resolution: bundler
- `eslint.config.mjs` - ESLint configuration (flat config format)
  - Extends: eslint-config-next/core-web-vitals, eslint-config-next/typescript
  - Ignores: .next, out, build, next-env.d.ts
- `postcss.config.mjs` - PostCSS configuration
  - Plugin: @tailwindcss/postcss v4 only
- `supabase/config.toml` - Supabase local development configuration
  - API port: 54321, DB port: 54322, Studio port: 54323
  - Auth site URL: http://localhost:3020
  - Storage limit: 50MiB
  - Postgres version: 15

**TypeScript Path Aliases:**
- `@/*` maps to `./src/*` (enables absolute imports)

## Platform Requirements

**Development:**
- Node.js 20+ (required for Next.js 16)
- npm 8+ or compatible package manager
- Supabase CLI (for local database)
- Git (for version control)

**Production:**
- Deployment target: Vercel (inferred from `.gitignore` `.vercel` entry)
- Hosting: Vercel Edge Network
- Database: Supabase Cloud (Postgres 15)
- Agent Workflows: Inngest Cloud
- Environment: Node.js 20+ runtime

**Browser Support:**
- Modern browsers with ES2017 support
- React 19 compatible browsers

**Colombia-Specific:**
- Timezone: America/Bogota (UTC-5) - Critical for all date operations
- Phone format: E.164 (+57 prefix for Colombia)
- Locale: es-CO (Spanish Colombia)

---

*Stack analysis: 2026-02-09*
