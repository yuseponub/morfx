# Codebase Concerns

**Analysis Date:** 2026-02-09

## Tech Debt

**Stale Closure Issues in React Components:**
- Issue: Timer callbacks and async handlers capture stale state from closures, causing bugs like timer reading old `timerEnabled` value
- Files: `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` (200+ lines, 42 useEffect/useState/useCallback/useRef hooks)
- Impact: Timer doesn't start retroactively, expired timers use wrong context, user toggles don't affect running timers
- Fix approach: Systematically convert all state reads in async callbacks to useRef pattern (Phase 15.7 established pattern: `timerEnabledRef.current`, `stateRef.current`, `messagesRef.current`)

**State Rebuilding Loses Fields:**
- Issue: When constructing new state objects with spread operator, optional fields from previous state are lost (happened with `ingestStatus` 3+ times across phases)
- Files: `src/lib/sandbox/sandbox-engine.ts`, `src/lib/agents/somnio/somnio-engine.ts`
- Impact: Ingest tracking breaks, debug UI shows stale data, timer evaluation fails
- Fix approach: Create helper function `mergeState(prev, updates)` that explicitly preserves all fields; add TypeScript exhaustiveness checks

**41 Hotfixes in Phase 15.x:**
- Issue: Research and planning phases didn't anticipate integration edge cases, resulting in 17 hotfixes in Phase 15.7 alone
- Files: All of `src/lib/agents/somnio/`, `src/lib/sandbox/`, `src/app/(dashboard)/sandbox/`
- Impact: Extended development time, increased risk of regression bugs, scattered fixes across codebase
- Fix approach: Improve `/gsd:research-phase` to explore integration points more deeply; add integration tests before Phase 16

**Model ID Inconsistencies:**
- Issue: Model IDs have inconsistent naming (`claude-sonnet-4-5` vs `claude-sonnet-4-20250514`), caused production bug when wrong ID used
- Files: `src/lib/agents/claude-client.ts:27` (MODEL_MAP hardcodes mapping), `src/lib/agents/types.ts:17` (type definition), scattered usage across 15+ files
- Impact: Haiku fallback to Sonnet happened silently, incorrect model used until caught
- Fix approach: Create `src/lib/agents/models.ts` with exported constants `HAIKU_MODEL`, `SONNET_MODEL`; refactor all usages to import from single source

**No Tests for Agent Components:**
- Issue: 2007 test files found, but zero unit tests for agent engine, orchestrator, intent detector, or CRM agents
- Files: `src/lib/agents/` (all files untested), `src/lib/sandbox/` (all files untested)
- Impact: Regression bugs in Phase 15.x, no safety net for refactoring, manual sandbox testing only
- Fix approach: Add unit tests for pure functions (IntentDetector, DataExtractor, MessageClassifier); add integration tests for SandboxEngine with mocked Claude API

**Sandbox LIVE Mode Lacks Safeguards:**
- Issue: LIVE mode can execute real CRM operations (create contacts, orders, send WhatsApp messages) with only `test-` prefix as protection
- Files: `src/lib/agents/crm/order-manager/agent.ts:121` (hardcoded 'sandbox' fallback), `src/lib/agents/crm/base-crm-agent.ts:26` (test- prefixing)
- Impact: Accidental production data creation, no hard boundary between sandbox and production, no rate limiting on sandbox API
- Fix approach: Add explicit SANDBOX_ENABLED env var check; create separate RLS policy for sandbox workspace; add rate limiting to `/api/sandbox/process`

**Tool Registry Requires Manual Initialization:**
- Issue: Each API route must explicitly import and register tools, easy to forget, caused Phase 15 bug
- Files: `src/app/api/sandbox/process/route.ts`, `src/lib/tools/handlers/crm/index.ts` (8 bugs related to uninitialized registry documented in 15-LEARNINGS.md)
- Impact: Tools not found at runtime, LIVE mode fails silently, debugging is difficult
- Fix approach: Create Next.js middleware that auto-registers tools for all `/api/*` routes; add runtime check that throws if registry empty

**Hardcoded Colombia Phone Prefix (+57):**
- Issue: Phone normalization assumes Colombia everywhere, no multi-country support
- Files: `src/lib/utils/phone.ts:42` (hardcoded 'CO'), `src/lib/agents/somnio/normalizers.ts` (assumes 57XXXXXXXXXX format), 8 files with hardcoded +57
- Impact: Cannot expand to other countries without code changes, international numbers rejected
- Fix approach: Add workspace-level country configuration; pass country code to normalizePhone(); update validation to support configurable countries

**Template Selection Uses Post-Intent State:**
- Issue: Template manager selects templates based on `intentsVistos` that already includes current intent, causing "second time" templates on first interaction
- Files: `src/lib/agents/somnio/template-manager.ts` (Phase 15 bug documented in 15-LEARNINGS.md line 25)
- Impact: Wrong templates sent to customers, confusing UX
- Fix approach: Pass pre-intent state to template selection; add unit tests for first-time vs returning customer scenarios

**Anthropic API Key in Multiple Locations:**
- Issue: `process.env.ANTHROPIC_API_KEY` accessed directly in 5+ files instead of centralized configuration
- Files: `src/lib/agents/claude-client.ts:47`, `src/lib/agents/somnio/message-classifier.ts:131`, plus 3 more
- Impact: Difficult to rotate keys, no validation on startup, unclear which components need API key
- Fix approach: Create `src/lib/config/env.ts` with validated env vars; centralize all API key access; add startup check that fails fast if missing

## Known Bugs

**Timer L4 Evaluates Wrong Mode:**
- Symptoms: Timer level 4 (pack without confirmation) checks for `ofrecer_promos` mode but should check `resumen` mode
- Files: `src/lib/sandbox/ingest-timer.ts` (TIMER_LEVELS array level 4)
- Trigger: User enters resumen mode without confirming pack selection, timer never fires
- Workaround: Documented in 15.7-LEARNINGS.md line 23, fixed in commit but pattern may recur

**ingestStatus Lost on State Rebuild:**
- Symptoms: Ingest timeline goes blank, timer doesn't start, debug panel shows empty ingest data
- Files: `src/lib/sandbox/sandbox-engine.ts` (processMessage newState construction)
- Trigger: Any operation that rebuilds state object without explicit `ingestStatus: currentState.ingestStatus`
- Workaround: Always include ingestStatus in spread operations; verify after each state mutation

**TODO: Check if Current User is Admin/Owner:**
- Symptoms: Assignment actions don't verify user has permission to reassign conversations
- Files: `src/app/actions/assignment.ts:174` (TODO comment), no permission checks in function
- Trigger: Any user can reassign conversations regardless of role
- Workaround: None - security issue pending fix

**Contact Assigned Name Not Fetched:**
- Symptoms: Conversations show `assigned_name: null` instead of actual assignee name
- Files: `src/app/actions/conversations.ts:91` (TODO comment to fetch from profiles)
- Trigger: Loading conversation list, assigned contact ID exists but name not joined
- Workaround: Frontend handles null gracefully but UX is degraded

## Security Considerations

**RLS Policies Allow Service Role Bypass:**
- Risk: Service role (used by agents) bypasses RLS completely, can access any workspace's data
- Files: All Supabase migrations in `supabase/migrations/` enable RLS but service role ignores it
- Current mitigation: Manual workspace_id filtering in all queries using `createAdminClient()`
- Recommendations: Add database-level check constraints on workspace_id; audit all admin client usage; create service role with limited permissions for agent operations only

**API Keys in Workspace Settings:**
- Risk: WhatsApp API keys stored in workspace settings table, visible to all workspace members
- Files: `src/app/actions/messages.ts:147` (reads from workspace settings), `src/app/actions/templates.ts:195`
- Current mitigation: RLS limits to workspace members only
- Recommendations: Encrypt API keys at rest; store in separate table with stricter RLS; rotate keys regularly; add audit log for key access

**No Rate Limiting on Sandbox API:**
- Risk: `/api/sandbox/process` has no rate limiting, can be abused to consume Anthropic API quota
- Files: `src/app/api/sandbox/process/route.ts` (no rate limit check), documented in 15-LEARNINGS.md line 172 as high priority debt
- Current mitigation: Only authenticated users can access, but no per-user limits
- Recommendations: Add rate limiter using `src/lib/tools/rate-limiter.ts` pattern; limit to 60 calls/min per user; add Anthropic API key budget monitoring

**Webhook Verify Token in Environment Variable:**
- Risk: WhatsApp webhook verify token in plain text `.env.local`, shared across team
- Files: `src/app/api/webhooks/whatsapp/route.ts:24` (reads WHATSAPP_WEBHOOK_VERIFY_TOKEN)
- Current mitigation: .env.local not committed to git
- Recommendations: Use Vercel environment variables; rotate token regularly; add webhook signature validation (HMAC)

**No CSRF Protection on Server Actions:**
- Risk: Next.js server actions don't have explicit CSRF tokens, rely on same-origin policy
- Files: All files in `src/app/actions/` (25+ action files)
- Current mitigation: Next.js built-in CSRF protection via POST requests from same origin
- Recommendations: Verify Next.js CSRF protection is enabled; add custom token for sensitive operations (delete workspace, role changes); audit all mutation actions

**Tool Execution Context Logs Sensitive Data:**
- Risk: `tool_executions` table stores full inputs/outputs in JSONB, includes customer phone numbers, addresses
- Files: `supabase/migrations/20260128000002_tool_executions.sql` (inputs/outputs columns), `src/lib/tools/handlers/crm/index.ts` (logs all data)
- Current mitigation: RLS limits to workspace members
- Recommendations: Add PII scrubbing before logging; encrypt sensitive fields; add data retention policy (delete after 90 days)

## Performance Bottlenecks

**50K Token Budget Per Conversation:**
- Problem: Conversations hitting 50K tokens (MAX_TOKENS_PER_CONVERSATION) truncate context, agent loses memory
- Files: `src/lib/agents/types.ts:457`, `src/lib/agents/token-budget.ts:11`
- Cause: Long conversations with many turns, no conversation summarization, full history passed to Claude every turn
- Improvement path: Implement conversation summarization (keep last 10 turns + summary); increase budget to 100K for Sonnet 4; add context pruning strategy

**Synchronous Webhook Processing:**
- Problem: WhatsApp webhook handler processes messages synchronously, blocks response for 5-10 seconds
- Files: `src/app/api/webhooks/whatsapp/route.ts:79` (SYNCHRONOUS comment), `src/lib/whatsapp/webhook-handler.ts` (480 lines)
- Cause: Vercel serverless functions timeout if async processing not awaited, agent processing takes 3-8 seconds
- Improvement path: Move to Inngest async processing (already used for timers); webhook returns 200 immediately; processing happens in background

**No Caching for Template Selection:**
- Problem: Template manager reads from database on every message, same templates fetched repeatedly
- Files: `src/lib/agents/somnio/template-manager.ts`, `src/app/actions/templates.ts` (no cache layer)
- Cause: No cache implementation, every orchestrator call hits Supabase
- Improvement path: Add in-memory template cache with 5-minute TTL; invalidate on template update; reduce DB queries by 90%

**Large Files with Complex Logic:**
- Problem: `src/lib/tools/handlers/crm/index.ts` (1428 lines), `src/lib/agents/engine.ts` (726 lines), difficult to reason about
- Files: Top 10 largest files range from 480-1428 lines
- Cause: All CRM handlers in single file, engine handles multiple concerns, no modularization
- Improvement path: Split CRM handlers into separate files per entity (contacts.ts, orders.ts, tags.ts); extract agent engine concerns (intent, orchestration, token budget) into separate modules

**No Connection Pooling for Supabase:**
- Problem: Each serverless function invocation creates new Supabase client, no connection reuse
- Files: `src/lib/supabase/admin.ts` (creates new client), `src/lib/supabase/server.ts`
- Cause: Serverless functions are stateless, connections don't persist across invocations
- Improvement path: Use Supabase connection pooler (already available in Supabase); configure pooling in DATABASE_URL; reduce connection overhead

## Fragile Areas

**Sandbox Layout Component (42 React Hooks):**
- Files: `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx:1-200` (complex state management with 42 useEffect/useState/useCallback/useRef)
- Why fragile: Multiple refs for timer callbacks, stale closure issues, 17 hotfixes in Phase 15.7, state synchronization across 10+ refs
- Safe modification: Always use refs for values read in async callbacks; test timer scenarios thoroughly; avoid adding more state - refactor to context provider instead
- Test coverage: Zero unit tests, manual sandbox testing only

**State Machine Transitions in Somnio Orchestrator:**
- Files: `src/lib/agents/somnio/somnio-orchestrator.ts:609` (state machine logic), `src/lib/agents/somnio/intents.ts:500` (intent definitions)
- Why fragile: 26 bugs related to transition validation in Phase 15.x, timer-forced transitions skip validation, implicit yes detection has 8 edge cases
- Safe modification: Always check CONTEXT.md for flow rules; add `skipValidation` flag for forced transitions; test all transition paths; never modify transition rules without updating both orchestrator AND template manager
- Test coverage: No unit tests for state machine, integration tested via sandbox only

**IngestManager Silent Accumulation:**
- Files: `src/lib/agents/somnio/ingest-manager.ts` (coordinates MessageClassifier + DataExtractor), `src/lib/agents/somnio/message-classifier.ts:131`
- Why fragile: Classification determines whether to respond or accumulate silently; wrong classification breaks UX; 4 categories (datos, pregunta, mixto, irrelevante) with subtle distinctions
- Safe modification: Never change classification logic without testing all 4 categories; "mixto" is critical for "hola + datos" pattern; "irrelevante" must not restart timer
- Test coverage: No unit tests, classification accuracy unknown

**Action DSL Tool Registry:**
- Files: `src/lib/tools/registry.ts`, `src/lib/tools/handlers/crm/index.ts:1-1428` (all CRM handlers)
- Why fragile: Self-registration pattern requires importing module to register tools; registry not initialized in some contexts; tool names hardcoded in multiple places
- Safe modification: Always import tool modules in API routes before use; never hardcode tool names - use registry.getAll(); verify tool exists before calling
- Test coverage: No tests for registry initialization, found bugs in production

**Message Sequencer with Delays:**
- Files: `src/lib/agents/somnio/message-sequencer.ts:491` (handles delayed message sending)
- Why fragile: Race conditions between messages, delays can be interrupted by new user message, state changes during delay sequence
- Safe modification: Never assume state is unchanged after await; use refs for state reads in callbacks; test interruption scenarios
- Test coverage: Manual testing only, no unit tests for race conditions

**Template Selection Based on Intent History:**
- Files: `src/lib/agents/somnio/template-manager.ts` (selects templates based on intentsVistos)
- Why fragile: Bug in Phase 15 where post-intent state used instead of pre-intent; templates change based on first-time vs returning; 23 different template scenarios
- Safe modification: Always pass pre-intent state to selectTemplate(); verify first-time flow separately from returning customer flow; check both DRY and LIVE modes
- Test coverage: No automated tests, manually tested in sandbox

## Scaling Limits

**In-Memory Rate Limiter:**
- Current capacity: Map-based sliding window, no persistence, resets on deployment
- Limit: Works for single-instance deployments, breaks with horizontal scaling (Vercel serverless functions don't share memory)
- Scaling path: Replace with Redis-backed rate limiter (Vercel KV); implement distributed rate limiting with atomic increments; add per-workspace quotas

**50K Token Conversation Budget:**
- Current capacity: ~25-30 turns in a typical conversation before hitting budget
- Limit: Long sales conversations exceed budget, agent loses all context, must restart
- Scaling path: Implement conversation summarization; increase budget to 100K or 200K for long conversations; add context pruning (keep recent turns + summary + critical data)

**Inngest Timer Workflows:**
- Current capacity: 3 timer workflows (data collection, promos, ingest) per session
- Limit: Inngest free tier has execution limits, timers don't scale to 1000s of concurrent conversations
- Scaling path: Upgrade to Inngest paid tier; implement timer batching (group similar timeouts); add circuit breaker for timer failures

**localStorage for Sandbox Sessions:**
- Current capacity: MAX_SESSIONS = 20, ~5MB quota per domain
- Limit: Cannot share sessions across team, lost on browser clear, quota issues with large sessions
- Scaling path: Move to database-backed sandbox sessions; add export/import to JSON; implement session sharing via link

**Supabase Connection Limits:**
- Current capacity: Default Supabase plan has limited connections, serverless functions create new connections frequently
- Limit: High traffic causes "too many connections" errors, functions fail randomly
- Scaling path: Enable Supabase connection pooler; optimize connection usage; implement connection reuse pattern; upgrade Supabase tier

## Dependencies at Risk

**Claude Haiku 4.5 Not Available:**
- Risk: MODEL_MAP maps 'claude-haiku-4-5' to Sonnet 4 as fallback, Haiku never used
- Impact: Higher costs (Sonnet 10x more expensive), slower classification (Haiku is for speed)
- Migration plan: Wait for Haiku 4.5 release; update MODEL_MAP; test classification accuracy; monitor cost reduction

**@anthropic-ai/sdk Version Lock:**
- Risk: Using specific SDK version, Anthropic API evolves quickly, may deprecate features
- Impact: Streaming responses, structured outputs, tool use may break on API changes
- Migration plan: Pin SDK version in package.json; monitor Anthropic changelog; test SDK updates in sandbox before production

**Next.js 15 App Router:**
- Risk: App Router is newer paradigm, some patterns unstable, SSR issues with client libraries
- Impact: Dynamic imports required for many libraries (Allotment), hydration errors, RSC boundaries unclear
- Migration plan: Monitor Next.js releases; test SSR compatibility thoroughly; consider fallback to Pages Router if issues persist

**Supabase RLS Complexity:**
- Risk: 17 RLS policies across migrations, complex workspace_members joins, performance impact unknown
- Impact: Slow queries as data grows, RLS policy bugs hard to debug, admin client bypasses make it easy to forget RLS
- Migration plan: Audit all RLS policies; benchmark query performance; consider application-level authorization for complex rules

**libphonenumber-js for Phone Validation:**
- Risk: Dependency on external library for phone normalization, Colombia-only support
- Impact: Cannot support other countries without library limitations, validation rules may change
- Migration plan: Wrap in abstraction layer; add multi-country support; consider alternative libraries (google-libphonenumber)

## Missing Critical Features

**No Error Recovery for Agent Failures:**
- Problem: If agent processing fails (Claude API error, tool execution error), conversation stuck in broken state
- Blocks: Customer receives no response, agent session locked, manual intervention required
- Priority: High - will be critical in Phase 16 production deployment

**No Agent Handoff to Human:**
- Problem: Agents can't transfer to human agent, no escalation path
- Blocks: Complex customer queries, complaints, edge cases can't be handled
- Priority: High - Phase 15 Plan 05 pending for human verification flow

**No Conversation Summarization:**
- Problem: Long conversations exceed token budget, agent loses context
- Blocks: Sales conversations over 30 turns, follow-up conversations days later
- Priority: Medium - workaround is to start new conversation

**No Multi-Workspace WhatsApp:**
- Problem: WHATSAPP_DEFAULT_WORKSPACE_ID hardcoded, webhook routes all messages to single workspace
- Blocks: Cannot run multiple businesses on same platform, cannot test multi-tenant
- Priority: High - required for SaaS business model

**No Audit Trail for Agent Actions:**
- Problem: Tool executions logged but no user-facing audit trail, can't see why agent made decision
- Blocks: Debugging agent behavior, explaining to customers why action taken, compliance requirements
- Priority: Medium - admin users can't troubleshoot agent issues

**No Agent Performance Metrics:**
- Problem: No tracking of agent success rate, conversation completion, customer satisfaction
- Blocks: Cannot optimize agent performance, don't know if changes improve outcomes
- Priority: Low - MVP doesn't require metrics

## Test Coverage Gaps

**Zero Unit Tests for Agent Components:**
- What's not tested: IntentDetector, SomnioOrchestrator, DataExtractor, MessageClassifier, IngestManager, all CRM agents
- Files: `src/lib/agents/` (entire directory untested except manual sandbox testing)
- Risk: Regression bugs on every change, refactoring is dangerous, edge cases discovered in production
- Priority: High - Phase 16 will stress these components with real WhatsApp traffic

**No Integration Tests for Timer Workflows:**
- What's not tested: Inngest timer functions, waitForEvent logic, timeout message sending
- Files: `src/inngest/functions/agent-timers.ts` (ingestTimer, dataCollectionTimer, promosTimer)
- Risk: Timer bugs found in production, complex async logic untested, race conditions unknown
- Priority: High - timers are critical for proactive agent behavior

**No E2E Tests for WhatsApp Flow:**
- What's not tested: Complete customer journey from first message to order creation
- Files: Entire agent flow from webhook to database
- Risk: Integration bugs between components, real-world scenarios not tested, multi-turn conversations fragile
- Priority: Medium - manual testing catches most issues but is time-consuming

**No Tests for RLS Policies:**
- What's not tested: Row-level security policies in Supabase, workspace isolation
- Files: All 17 migration files with RLS policies
- Risk: Data leaks between workspaces, unauthorized access, security vulnerabilities
- Priority: High - security issue with compliance implications

**No Load Tests for Agent Engine:**
- What's not tested: Performance under concurrent load, token budget scaling, rate limiter effectiveness
- Files: `src/lib/agents/engine.ts`, `src/lib/tools/rate-limiter.ts`
- Risk: Production bottlenecks unknown, scaling limits unclear, rate limits may be too strict or too loose
- Priority: Medium - low traffic initially but will be critical for growth

---

*Concerns audit: 2026-02-09*
*Based on analysis of Phase 15.x LEARNINGS.md, codebase exploration, and documented tech debt*
