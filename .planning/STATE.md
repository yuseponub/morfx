# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-28)

**Core value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos.
**Current focus:** Phase 9 - CRM-WhatsApp Sync (Next)

## Current Position

Phase: 9 of 10 (CRM-WhatsApp Sync)
Plan: 5 of 8 complete (09-01, 09-02, 09-03, 09-04, 09-05)
Status: Phase 9 in progress
Last activity: 2026-02-03 - Completed 09-04-PLAN.md (WhatsApp UI Order Indicators)

Progress: [########=-] ~87%

### Phase 7 Verification (2026-01-31)
All success criteria verified:
- [x] System connects to 360dialog and receives incoming messages
- [x] User can view inbox of all conversations
- [x] User can view complete message history of any conversation
- [x] User can send messages within the 24-hour window
- [x] Conversations are automatically linked to contacts by phone number
- [x] Additional: WhatsApp button in Kanban cards and Order detail

## Performance Metrics

**Velocity:**
- Total phases completed: 6
- Phase 1: ~45 minutes (3 plans)
- Phase 2: ~2 hours (manual implementation)
- Phase 3: ~56 minutes (4 plans)
- Phase 4: ~35 minutes (3 plans)
- Phase 5: ~43 minutes (4 plans)
- Phase 6: ~57 minutes (5 plans)
- Phase 7: ~31 minutes (3 plans)
- Phase 8: ~75 minutes (9 plans, 3 waves)

**By Phase:**

| Phase | Plans | Total | Notes |
|-------|-------|-------|-------|
| 01-foundation-auth | 3/3 | ~45min | Formal GSD plans |
| 02-workspaces-roles | manual | ~2hrs | Implemented without formal plans |
| 03-action-dsl-core | 4/4 | ~56min | Complete |
| 04-contacts-base | 3/3 | ~35min | Complete |
| 05-contacts-extended | 4/4 | ~43min | Complete |
| 06-orders | 5/5 | ~57min | Complete |
| 07-whatsapp-core | 3/3 | ~31min | Complete |
| 08-whatsapp-extended | 9/9 | ~75min | Complete (verified 7/7) |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 2]: Cookie-based workspace persistence (server-accessible)
- [Phase 2]: Profiles table for user email access (auth.users not joinable)
- [Phase 2]: Link-based invitations (Supabase email limit 4/hour)
- [Phase 2]: SECURITY DEFINER functions for public invitation viewing
- [Phase 2]: Permissions defined in code, not database (simpler for MVP)
- [Phase 3-01]: Use pnpm (project's package manager, not npm)
- [Phase 3-01]: jose 6.1 for Edge Runtime compatibility
- [Phase 3-01]: Forensic logging with before/after snapshots
- [Phase 3-01]: API keys use bcrypt hash (never plaintext)
- [Phase 3-02]: Pino redacts by removing fields entirely (not [REDACTED])
- [Phase 3-02]: Tool logging never throws (must not interrupt business logic)
- [Phase 3-02]: Distinct error classes (ToolValidationError, ToolNotFoundError, PermissionError)
- [Phase 3-03]: Placeholder handlers return _placeholder: true for debugging
- [Phase 3-03]: PHASE_4_CONTRACT/PHASE_7_CONTRACT comments mark handler replacement points
- [Phase 3-03]: initializeTools() is idempotent with initialized flag
- [Phase 3-04]: SHA-256 for API keys (not bcrypt) - fast comparison, keys are random
- [Phase 3-04]: Middleware header passing for workspace context
- [Phase 3-04]: MCP-compatible discovery endpoint format
- [Phase 4-01]: Phone stored in E.164 format (+573001234567) for consistent matching
- [Phase 4-01]: Tags are global per workspace (usable on contacts, orders, whatsapp)
- [Phase 4-01]: Zod v4 uses .issues instead of .errors for validation errors
- [Phase 4-02]: createColumns factory pattern to inject action callbacks
- [Phase 4-02]: CityCombobox uses shouldFilter={false} with limit 50 for performance
- [Phase 4-02]: DataTable accepts searchColumn+searchValue props for external filter control
- [Phase 4-03]: TagInput uses popover+command instead of Emblor for simpler integration
- [Phase 4-03]: Client-side filtering for fast tag toggle UX
- [Phase 4-03]: Optimistic updates with revert on error for tag operations
- [Phase 5-01]: Activity trigger skips updated_at to reduce noise
- [Phase 5-01]: Activity table is immutable (no UPDATE/DELETE RLS)
- [Phase 5-01]: Notes editable by author OR admin/owner
- [Phase 5-02]: Auto-generate field key from display name (reduces user friction)
- [Phase 5-02]: Cannot change field type or key after creation (would break data)
- [Phase 5-02]: contact_relation uses text input for MVP (combobox later)
- [Phase 5-03]: TimelineItem title accepts ReactNode (not just string) for rich content
- [Phase 5-03]: Note activities logged via application code (not trigger)
- [Phase 5-04]: CSV parsing without web worker (worker:true causes Next.js issues)
- [Phase 5-04]: Batch insert 100 contacts at a time (performance/memory balance)
- [Phase 5-04]: BOM included in CSV export for Excel UTF-8 compatibility
- [Phase 6-01]: Snapshot pricing in order_products (sku, title, unit_price copied at order time)
- [Phase 6-01]: GENERATED ALWAYS AS for subtotal column (PostgreSQL handles computation)
- [Phase 6-01]: ON DELETE RESTRICT for pipeline_id/stage_id on orders (data integrity)
- [Phase 6-01]: linked_order_id for order relationships (returns linked to original sales)
- [Phase 6-01]: saved_views shared via is_shared flag (user sees own or shared views)
- [Phase 6-02]: Price input uses numeric formatting with Intl.NumberFormat, stored as number
- [Phase 6-02]: Products default to active, with toggle in table actions
- [Phase 6-02]: Show inactive products is off by default for cleaner UX
- [Phase 6-02]: AlertDialog for delete confirmation (safer than window.confirm)
- [Phase 6-03]: @dnd-kit for drag-drop (React 19 compatible, accessible)
- [Phase 6-03]: Optimistic updates on drag with revert on error
- [Phase 6-03]: STAGE_COLORS separate from TAG_COLORS (decoupled for flexibility)
- [Phase 6-03]: Default pipeline Ventas with 4 stages (Nuevo, En Proceso, Ganado, Perdido)
- [Phase 6-04]: Sheet instead of Dialog for order form (more space for complex forms)
- [Phase 6-04]: ProductPicker supports catalog products and manual entry
- [Phase 6-04]: No Zod validation in form - explicit TypeScript interface for react-hook-form
- [Phase 6-04]: Pipeline filter resets stage filter when changed (UX)
- [Phase 6-04]: ContactSelector shows first 50 results with client-side search
- [Phase 6-05]: Fuse.js threshold 0.4 for balance between fuzzy and precision
- [Phase 6-05]: Weighted search: contact name (2), phone/tracking (1.5), products (1)
- [Phase 6-05]: Kanban is default view (per CONTEXT.md)
- [Phase 6-05]: Pipeline tabs persist to localStorage for session continuity
- [Phase 6-05]: View mode persists to localStorage
- [Phase 6-05]: Optimistic updates on drag with revert on error
- [Phase 7-01]: wamid unique constraint for message deduplication
- [Phase 7-01]: Async webhook processing after 200 response (360dialog 5s timeout)
- [Phase 7-01]: Trigger updates conversation stats on message insert
- [Phase 7-01]: Auto-link conversations to contacts by E.164 phone
- [Phase 7-02]: Fuse.js weighted search for conversations (same pattern as Phase 6)
- [Phase 7-02]: Realtime subscription per workspace prevents cross-workspace data
- [Phase 7-02]: Window indicator shows warning only when <2h remaining (per CONTEXT.md)
- [Phase 7-02]: RecentOrdersList as separate component in ContactPanel
- [Phase 7-03]: TanStack Virtual for message list performance
- [Phase 7-03]: frimousse for emoji picker (2kb, React 19 compatible)
- [Phase 7-03]: Base64 encoding for file upload in Server Actions
- [Phase 7-03]: Subtle geometric SVG pattern for chat background
- [Phase 8-01]: Migration 20260131000002 (not 000001) to avoid storage_policies conflict
- [Phase 8-01]: whatsapp_templates: admins full access, agents SELECT approved only
- [Phase 8-01]: message_costs: no INSERT policy (webhook uses service role)
- [Phase 8-01]: workspace_limits: no policies (Super Admin only via service role)
- [Phase 8-01]: Template names auto-cleaned: lowercase, underscores only
- [Phase 8-01]: Template CRUD: local DB first, then 360dialog API
- [Phase 8-06]: is_workspace_manager function checks owner/admin roles
- [Phase 8-06]: Agent visibility: assigned + unassigned only (not other agents' chats)
- [Phase 8-06]: DELETE conversations restricted to managers only
- [Phase 8-07]: Custom autocomplete instead of react-textarea-autocomplete for React 19 compatibility
- [Phase 8-07]: 150ms debounce on slash-command search for performance
- [Phase 8-03]: Form action wrapper returns void (TypeScript form action constraint)
- [Phase 8-03]: Variable regex /\{\{(\d+)\}\}/g for {{n}} pattern extraction
- [Phase 8-08]: Cost recording only on 'sent' status to avoid duplicates
- [Phase 8-08]: Country code extraction from phone for rate lookup
- [Phase 8-08]: Hardcoded chart colors (Recharts doesn't support CSS variables)
- [Phase 8-04]: Two-step template modal (select -> preview) for user verification
- [Phase 8-04]: Variables auto-fill from contact/order via template's variable_mapping
- [Phase 8-05]: Expandable cards with single-expanded state for team details
- [Phase 8-05]: Agents grouped by team in assignment dropdown
- [Phase 8-05]: Availability toggle in conversation list header (always visible)
- [Phase 8-09]: Super admin access via MORFX_OWNER_USER_ID env var (simple, no DB lookup)
- [Phase 8-09]: Workspace limits upsert pattern for configuration
- [Phase 9-01]: applies_to column defaults to 'both' for backward compatibility
- [Phase 9-01]: Auto-tag trigger only fires on UPDATE (not INSERT) for explicit stage transitions
- [Phase 9-01]: Stage-to-phase mapping falls back to 'pending' for unknown stages
- [Phase 9-01]: Won orders show no indicator (success = no visual noise)
- [Phase 9-03]: contactTags property is read-only in conversation context (inherited from contact)
- [Phase 9-03]: OrderSummary includes is_closed for filtering won orders
- [Phase 9-03]: getOrdersForContacts enables batch loading for conversation list efficiency
- [Phase 9-02]: Tag scope validation rejects 'orders' scope tags for conversations
- [Phase 9-02]: Duplicate tag addition returns success (idempotent) via error code 23505
- [Phase 9-02]: Conversations return tags (direct) and contactTags (inherited) separately
- [Phase 9-02]: getTagsForScope filters by 'whatsapp' or 'orders' using applies_to IN clause
- [Phase 9-05]: Compact tag mode shows max 3 tags with overflow indicator
- [Phase 9-05]: Remove tag via hover X button on badge
- [Phase 9-05]: router.refresh() for UI update after tag changes
- [Phase 9-04]: Won orders don't show indicators (success = no visual noise)
- [Phase 9-04]: Contact tags displayed with 60% opacity to distinguish from conversation tags
- [Phase 9-04]: Max 3 order indicators in conversation list with overflow +N
- [Phase 9-04]: Section labels "Etiquetas de chat" and "Etiquetas de contacto" in contact panel

### Project Rules

Established in `CLAUDE.md`:
1. ALWAYS restart server after code changes before testing
2. ALWAYS use America/Bogota timezone for dates
3. ALWAYS follow GSD workflow completely

### Pending Todos

- Configure SMTP in Supabase for production email sending
- Mobile nav workspace switcher
- Apply migrations to Supabase (tool_executions, api_keys, contacts, tags, custom_fields, notes, activity, orders, conversations, messages)
- Configure 360dialog webhook URL and env vars
- Quick replies: Upload directo a Supabase Storage (sin Server Actions) para soportar imágenes grandes sin compresión

### Blockers/Concerns

None.

## Phase 3 Summary (COMPLETE)

Plan 01 complete:
- Dependencies installed (ajv, pino, jose, etc.)
- tool_executions table with forensic logging
- api_keys table with validate_api_key() function
- TypeScript types for tool system

Plan 02 complete:
- Pino logger with security redaction (src/lib/audit/logger.ts)
- Tool execution logging to Supabase (src/lib/audit/tool-logger.ts)
- Tool Registry with compiled Ajv validators (src/lib/tools/registry.ts)
- Tool Executor with dry-run and permission checking (src/lib/tools/executor.ts)

Plan 03 complete:
- 9 CRM tool schemas (src/lib/tools/schemas/crm.tools.ts)
- 7 WhatsApp tool schemas (src/lib/tools/schemas/whatsapp.tools.ts)
- Placeholder handlers for CRM (src/lib/tools/handlers/crm/index.ts)
- Placeholder handlers for WhatsApp (src/lib/tools/handlers/whatsapp/index.ts)
- Tool initialization (src/lib/tools/init.ts)
- Next.js instrumentation hook (src/instrumentation.ts)

Plan 04 complete:
- API key validation utility (src/lib/auth/api-key.ts)
- Middleware API key auth for /api/v1/tools/* routes
- GET /api/v1/tools (discovery endpoint)
- POST /api/v1/tools/{name} (execution endpoint)

**Phase 3 Deliverables:**
- 16 registered tools (9 CRM + 7 WhatsApp)
- MCP-compatible API for AI agent integration
- Forensic logging for all tool executions
- API key authentication for external access

## Phase 4 Summary (COMPLETE)

Plan 01 complete:
- contacts, tags, contact_tags tables with RLS policies
- Phone normalization utility (libphonenumber-js)
- Colombian cities dataset (~100 municipalities)
- Tag color palette with contrast calculation
- Server Actions: getContacts, createContact, updateContact, deleteContact
- Server Actions: getTags, createTag, updateTag, deleteTag
- Bulk tag operations: bulkAddTag, bulkRemoveTag

Plan 02 complete:
- TanStack Table integration with sorting and row selection
- Contact list page /crm/contactos with search and bulk operations
- Contact form with phone validation and city autocomplete
- Contact detail page /crm/contactos/[id]
- Toast notifications via Sonner
- Empty state with CTA

Plan 03 complete:
- TagBadge component for colored tag display
- TagInput for adding/removing tags with optimistic updates
- TagFilter for multi-tag filtering (Linear-style toggle)
- TagManager for workspace tag CRUD with color picker
- Client-side filtering by tags in ContactsTable
- Inline tag editing on contact detail page

**Phase 4 Deliverables:**
- Full contact CRUD with RLS isolation
- Tag system with colors and filtering
- Phone normalization to E.164 format
- Colombian cities autocomplete
- Bulk operations (delete, add/remove tags)

**Key files:**
- src/components/contacts/tag-badge.tsx
- src/components/contacts/tag-input.tsx
- src/app/(dashboard)/crm/contactos/components/tag-filter.tsx
- src/app/(dashboard)/crm/contactos/components/tag-manager.tsx

## Phase 5 Summary (COMPLETE)

Plan 01 complete:
- custom_field_definitions table for workspace-scoped field schemas
- contacts.custom_fields JSONB column with GIN index
- contact_notes table with author tracking
- contact_activity table for automatic change history
- log_contact_changes() trigger with JSONB diff calculation
- TypeScript types for custom fields, notes, activity

Plan 02 complete:
- Server Actions: getCustomFields, createCustomField, updateCustomField, deleteCustomField, reorderCustomFields
- Dynamic Zod validator buildCustomFieldSchema() for all 12 field types
- FieldInput and FieldDisplay components for all field types
- Settings page at /crm/configuracion/campos-custom with FieldBuilder dialog
- CustomFieldsSection on contact detail with view/edit modes
- Select UI component added (@radix-ui/react-select)

Plan 03 complete:
- Notes CRUD Server Actions (getContactNotes, createNote, updateNote, deleteNote)
- Activity fetch Server Action (getContactActivity) with formatting helpers
- Reusable Timeline and TimelineItem components
- NotesSection with add/edit/delete and optimistic updates
- ActivityTimeline with type filters (edits, notes, tags)
- Contact detail page with tabs (Info, Campos, Notas, Historial)

Plan 04 complete:
- CSV parsing utilities with PapaParse (src/lib/csv/parser.ts)
- CSV export utilities with BOM support (src/lib/csv/exporter.ts)
- Bulk import Server Actions (bulkCreateContacts, getExistingPhones, updateContactByPhone)
- CsvImportDialog with multi-step wizard (upload, parse, duplicates, import, results)
- DuplicateResolver for conflict resolution during import
- CsvExportButton with column selection popover
- ScrollArea UI component added (@radix-ui/react-scroll-area)

**Phase 5 Deliverables:**
- Custom field definitions with 12 field types
- Notes system with author tracking
- Activity timeline with JSONB diff display
- CSV import with column auto-detection and duplicate resolution
- CSV export with column selection and Excel compatibility
- Contact detail page with tabbed interface

**Key files:**
- src/lib/custom-fields/types.ts
- src/lib/custom-fields/validator.ts
- src/app/actions/custom-fields.ts
- src/components/custom-fields/field-input.tsx
- src/components/custom-fields/field-display.tsx
- src/app/(dashboard)/crm/configuracion/campos-custom/page.tsx
- supabase/migrations/20260129000002_custom_fields_notes_activity.sql
- src/app/actions/notes.ts
- src/app/actions/activity.ts
- src/components/ui/timeline.tsx
- src/app/(dashboard)/crm/contactos/[id]/components/notes-section.tsx
- src/app/(dashboard)/crm/contactos/[id]/components/activity-timeline.tsx
- src/lib/csv/parser.ts
- src/lib/csv/exporter.ts
- src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx
- src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx
- src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx

## Phase 6 Summary (COMPLETE)

Plan 01 complete:
- products, pipelines, pipeline_stages tables
- orders table with contact, pipeline, stage relations
- order_products junction with snapshot pricing and auto-total trigger
- order_tags junction reusing Phase 4 tags
- saved_views table for persisted filters
- RLS policies for workspace isolation
- TypeScript types for orders module

Plan 02 complete:
- Products CRUD Server Actions (getProducts, createProduct, updateProduct, deleteProduct, toggleProductActive)
- Products catalog page at /crm/productos
- TanStack Table with search, sorting, and active/inactive toggle
- Product form with Zod validation and COP currency formatting
- AlertDialog component for delete confirmations

Plan 03 complete:
- Pipeline Server Actions (getPipelines, createPipeline, updatePipeline, deletePipeline)
- Stage Server Actions (createStage, updateStage, updateStageOrder, deleteStage)
- Pipeline configuration page at /crm/configuracion/pipelines
- Stage manager with drag-to-reorder using @dnd-kit
- Color picker and WIP limit configuration per stage
- Default pipeline auto-creation on first visit

Plan 04 complete:
- Orders Server Actions (getOrders, createOrder, updateOrder, deleteOrder, moveOrderToStage)
- Orders list page at /crm/pedidos with TanStack Table
- Order form in Sheet with Contact, Products, Details, Shipping, Notes sections
- ProductPicker with catalog search and manual entry
- ContactSelector combobox with name/phone search
- Pipeline/Stage filter dropdowns
- Calendar component (react-day-picker) for closing date
- AlertDialog for delete confirmations

Plan 05 complete:
- Kanban board with @dnd-kit drag-and-drop between stages
- Fuzzy search with Fuse.js (weighted by contact, products, tracking)
- Pipeline tabs (taskbar style) with localStorage persistence
- View toggle Kanban/List with localStorage persistence
- Order detail sheet with full information
- Combined filters: search + stage + tags
- WIP limit visual enforcement

**Phase 6 Deliverables:**
- Products catalog with CRUD
- Pipeline/stage configuration with drag reorder
- Orders CRUD with list view
- Kanban board with drag-and-drop
- Fuzzy search and filtering
- Multi-pipeline tabs
- Order detail sheet

**Key files:**
- supabase/migrations/20260129000003_orders_foundation.sql
- src/lib/orders/types.ts
- src/lib/search/fuse-config.ts
- src/app/actions/products.ts
- src/app/actions/orders.ts
- src/app/(dashboard)/crm/productos/page.tsx
- src/app/(dashboard)/crm/productos/components/products-table.tsx
- src/app/(dashboard)/crm/productos/components/product-form.tsx
- src/app/(dashboard)/crm/productos/components/columns.tsx
- src/app/(dashboard)/crm/configuracion/pipelines/page.tsx
- src/app/(dashboard)/crm/configuracion/pipelines/components/stage-manager.tsx
- src/app/(dashboard)/crm/pedidos/page.tsx
- src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
- src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
- src/app/(dashboard)/crm/pedidos/components/order-form.tsx
- src/app/(dashboard)/crm/pedidos/components/columns.tsx
- src/app/(dashboard)/crm/pedidos/components/product-picker.tsx
- src/app/(dashboard)/crm/pedidos/components/contact-selector.tsx
- src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
- src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
- src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
- src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
- src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx
- src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx
- src/app/(dashboard)/crm/pedidos/components/order-filters.tsx
- src/components/ui/calendar.tsx
- src/components/ui/toggle-group.tsx

## Phase 7 Summary (COMPLETE)

Plan 01 complete:
- conversations, messages tables with RLS policies
- Supabase Realtime enabled for both tables
- wamid unique constraint for deduplication
- Trigger update_conversation_on_message for stats
- TypeScript types for WhatsApp domain
- 360dialog API client (sendTextMessage, sendMediaMessage, etc.)
- Webhook handler (processWebhook, processIncomingMessage, processStatusUpdate)
- Webhook endpoint at /api/webhooks/whatsapp
- Server Actions: getConversations, getConversation, markAsRead, archiveConversation, linkContactToConversation, etc.

Plan 02 complete:
- useConversations hook with Fuse.js fuzzy search and Realtime subscription
- useMessages hook with Realtime subscription
- 3-column inbox layout (conversation list, chat, contact panel)
- Conversation list with search and filters (all, unread, archived)
- Contact panel with contact info, recent orders, window indicator
- Window indicator shows warning only when <2h or closed

Plan 03 complete:
- Message Server Actions (getMessages, sendMessage, sendMediaMessage, markMessageAsRead)
- ChatView with TanStack Virtual for virtualized message list
- MessageBubble with styled bubbles and status indicators
- ChatHeader with actions (archive, mark read, open in CRM)
- MediaPreview for images, video, audio, documents
- MessageInput with emoji picker and file attachments
- EmojiPicker using frimousse library
- 24h window enforcement for message sending
- Disabled input state with template button when window closed

**Phase 7 Deliverables:**
- Full WhatsApp inbox with 3-column layout
- Real-time message and conversation updates
- Message sending within 24h window
- File attachments (images, video, audio, documents)
- Emoji picker with Spanish locale
- Contact linking by phone
- Window indicator for 24h window status

**Key files:**
- supabase/migrations/20260130000002_whatsapp_conversations.sql
- src/lib/whatsapp/types.ts
- src/lib/whatsapp/api.ts
- src/lib/whatsapp/webhook-handler.ts
- src/app/api/webhooks/whatsapp/route.ts
- src/app/actions/conversations.ts
- src/app/actions/messages.ts
- src/hooks/use-conversations.ts
- src/hooks/use-messages.ts
- src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
- src/app/(dashboard)/whatsapp/components/conversation-list.tsx
- src/app/(dashboard)/whatsapp/components/chat-view.tsx
- src/app/(dashboard)/whatsapp/components/message-bubble.tsx
- src/app/(dashboard)/whatsapp/components/message-input.tsx
- src/app/(dashboard)/whatsapp/components/emoji-picker.tsx
- src/app/(dashboard)/whatsapp/components/media-preview.tsx
- src/app/(dashboard)/whatsapp/components/contact-panel.tsx
- src/app/(dashboard)/whatsapp/components/window-indicator.tsx

## Phase 8 Summary (COMPLETE)

Plan 01 complete:
- whatsapp_templates, teams, team_members, quick_replies, message_costs, workspace_limits tables
- ALTER conversations add team_id column
- ALTER messages add template_name column
- RLS policies for role-based access
- TypeScript types for Template, Team, QuickReply, MessageCost, WorkspaceLimits
- 360dialog template API client (templates-api.ts)
- Template Server Actions (templates.ts)

Plan 03 complete:
- WhatsApp settings hub at /configuracion/whatsapp
- Template list page with status badges (pending/approved/rejected)
- Template creation form with category selection
- Variable mapper for {{n}} pattern extraction
- Template detail page with editable variable mapping
- Color-coded status badges (yellow/green/red)

Plan 06 complete:
- is_workspace_manager() helper function for role checking
- Role-based RLS policies for conversations (managers see all, agents see assigned+unassigned)
- DELETE restricted to managers only
- useConversations hook extended with 'mine' and 'unassigned' filters
- "Sin asignar" badge for unassigned conversations
- Inbox filter tabs for "Mis chats" and "Sin asignar"

Plan 07 complete:
- Quick replies settings page at /configuracion/whatsapp/quick-replies
- QuickReplyForm component with shortcut validation
- QuickReplyList with grid card layout
- QuickReplyAutocomplete component for slash-command in chat
- Message input integrated with autocomplete (type / to trigger)
- Keyboard navigation (Up/Down/Enter/Escape) for suggestions

Plan 04 complete:
- sendTemplateMessage Server Action in messages.ts
- Template selection modal with two-step flow (select -> preview)
- TemplatePreview component with variable substitution
- TemplateButton integrated into MessageInput
- 24h window detection shows template button when closed
- Variables auto-filled from contact/order via variable_mapping

Plan 05 complete:
- Team management page at /configuracion/whatsapp/equipos
- Team form with name and is_default toggle
- Team members manager with add/remove functionality
- Online/offline status display for each team member
- AssignDropdown in chat header for manual conversation assignment
- AvailabilityToggle in conversation list header for agent status
- Agents grouped by team in assignment dropdown
- ConversationWithDetails extended with assigned_name field

**Key files:**
- supabase/migrations/20260131000002_whatsapp_extended_foundation.sql
- supabase/migrations/20260131000003_conversation_rls_update.sql
- src/lib/whatsapp/types.ts (extended)
- src/lib/whatsapp/templates-api.ts
- src/app/actions/templates.ts
- src/app/actions/teams.ts (from prior work)
- src/app/actions/quick-replies.ts
- src/hooks/use-conversations.ts
- src/app/(dashboard)/whatsapp/components/filters/inbox-filters.tsx
- src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx
- src/app/(dashboard)/whatsapp/components/quick-reply-autocomplete.tsx
- src/app/(dashboard)/whatsapp/components/message-input.tsx
- src/app/(dashboard)/configuracion/whatsapp/page.tsx
- src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx
- src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx
- src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx
- src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx
- src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx
- src/app/(dashboard)/configuracion/whatsapp/templates/nuevo/page.tsx
- src/app/(dashboard)/configuracion/whatsapp/templates/[id]/page.tsx
- src/app/(dashboard)/configuracion/whatsapp/templates/[id]/components/template-detail.tsx
- src/app/(dashboard)/whatsapp/components/template-button.tsx
- src/app/(dashboard)/whatsapp/components/template-send-modal.tsx
- src/app/(dashboard)/whatsapp/components/template-preview.tsx
- src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx
- src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx
- src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx
- src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx
- src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx
- src/app/(dashboard)/whatsapp/components/availability-toggle.tsx

## Session Continuity

Last session: 2026-02-03T15:32:23Z
Stopped at: Completed 09-04-PLAN.md (WhatsApp UI Order Indicators)
Resume file: None - Wave 3 plans 09-04 and 09-05 complete, 09-06 next

Plan 08 complete:
- Webhook handler records cost on billable 'sent' status
- Usage dashboard at /configuracion/whatsapp/costos
- Period selector (today, 7d, 30d, this month)
- Summary cards (total messages, total cost, limit status)
- UsageChart with daily area chart (recharts)
- CategoryBreakdown with donut chart and cost table

Plan 09 complete:
- Super Admin panel at /super-admin with MORFX_OWNER_USER_ID access guard
- Platform overview page showing totals (workspaces, messages, costs)
- Workspace list and detail pages for configuration
- WorkspaceLimitsForm for template categories, quick reply features, spending limits
- Consolidated cost dashboard with period selector and near-limit warnings
- Progress component added for usage visualization

**Additional Key files (08-08):**
- src/lib/whatsapp/webhook-handler.ts (extended with cost recording)
- src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx
- src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx
- src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx
- src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-chart.tsx
- src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx

**Additional Key files (08-09):**
- src/app/super-admin/layout.tsx
- src/app/super-admin/page.tsx
- src/app/super-admin/workspaces/page.tsx
- src/app/super-admin/workspaces/[id]/page.tsx
- src/app/super-admin/workspaces/[id]/components/workspace-limits-form.tsx
- src/app/super-admin/costos/page.tsx
- src/app/actions/super-admin.ts
- src/components/ui/progress.tsx
