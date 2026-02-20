# Research: Action Fields Complete Audit

## Scope
Exhaustive 4-layer audit of all 12 automation action types.
Layers: Domain → Executor → Wizard UI → AI Builder

---

## 1. assign_tag

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| tagName | req | req | req select | req | OK |
| entityType | contact/order/conversation | default 'contact' | contact/order | mentioned | Minor: UI missing 'conversation' |
| entityId | req | from context | auto | auto | OK |

**Status:** Mostly OK. Minor: conversation entityType not in UI (intentional).

---

## 2. remove_tag

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| tagName | req | req | req select | req | OK |
| entityType | contact/order/conversation | default 'contact' | **NOT EXPOSED** | **NOT MENTIONED** | CRITICAL |
| entityId | req | from context | auto | auto | OK |

**CRITICAL:** Users cannot remove tags from orders via UI or AI builder. entityType missing.

---

## 3. change_stage

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| orderId | req | from context | auto | auto | OK |
| stageId/newStageId | req | req (renamed) | req | req | OK |
| pipelineId | NOT accepted | reads but IGNORES | required | required | BROKEN: UI requires, executor drops |

**Note:** pipelineId is used for stage filtering in UI (good UX) but executor ignores it. Domain only needs stageId. Not really a bug — the pipelineId is a UI-only concern for filtering the stage dropdown. Keep as-is.

---

## 4. update_field

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| fieldName | — | req | req (text) | req | No dropdown of valid fields |
| value | — | req | req (text) | req | Missing supportsVariables |
| entityType | — | default 'contact' | NOT exposed | NOT mentioned | CRITICAL: can't update order fields |
| **Order fields executor maps:** | | | | | |
| shipping_address | domain | mapped | — | — | Not selectable |
| description | domain | mapped | — | — | Not selectable |
| carrier | domain | mapped | — | — | Not selectable |
| tracking_number | domain | mapped | — | — | Not selectable |
| shipping_city | domain | mapped | — | — | Not selectable |
| closing_date | domain | mapped | — | — | Not selectable |
| contact_id | domain | mapped | — | — | Not selectable |
| **NOT mapped in executor:** | | | | | |
| name | domain accepts | NOT mapped | — | — | CRITICAL |
| shipping_department | domain accepts | NOT mapped | — | — | CRITICAL |
| **Contact fields executor maps:** | | | | | |
| name | domain | mapped | — | — | Not selectable |
| phone | domain | mapped | — | — | Not selectable |
| email | domain | mapped | — | — | Not selectable |
| address | domain | mapped | — | — | Not selectable |
| city | domain | mapped | — | — | Not selectable |
| **NOT mapped in executor:** | | | | | |
| department | domain accepts | NOT mapped | — | — | CRITICAL |

**CRITICAL issues:**
1. `name` (orders), `shipping_department` (orders), `department` (contacts) — executor doesn't map them
2. `entityType` not exposed — users can only update contact fields, never order fields
3. `value` missing variable support in UI
4. Free text fieldName with no validation — user needs a dropdown of valid fields

---

## 5. create_order

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| pipelineId | req | req | req select | req | OK |
| stageId | opt | opt | opt select | opt | OK |
| contactId | opt | from context | auto | auto | OK |
| description | opt | param > context | text+vars | NOT mentioned | AI gap |
| shippingAddress | opt | param > context | text+vars | NOT mentioned | AI gap |
| shippingCity | opt | param > context | text+vars | NOT mentioned | AI gap |
| shippingDepartment | opt | param > context | text+vars | NOT mentioned | AI gap |
| name | opt | NOT passed | NOT exposed | NOT mentioned | CRITICAL: never exposed |
| closingDate | opt | NOT passed | NOT exposed | NOT mentioned | CRITICAL: never exposed |
| carrier | opt | NOT passed | NOT exposed | NOT mentioned | CRITICAL: never exposed |
| trackingNumber | opt | NOT passed | NOT exposed | NOT mentioned | CRITICAL: never exposed |
| customFields | opt | NOT passed | NOT exposed | NOT mentioned | CRITICAL: never exposed |
| products | array | from context | auto | auto | OK |
| copyProducts | — | IGNORED | toggle | mentioned | BROKEN toggle |
| copyTags | — | works (manual) | toggle | mentioned | OK |

**CRITICAL:** 5 domain fields never exposed. copyProducts toggle broken.

---

## 6. duplicate_order

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| sourceOrderId | req | from context | auto | auto | OK |
| targetPipelineId | req | req | req select | req | OK |
| targetStageId | opt | opt | opt select | opt | OK |
| copyContact | — | IGNORED | toggle | mentioned | BROKEN: domain always copies |
| copyProducts | — | IGNORED | toggle | mentioned | BROKEN: domain always copies |
| copyValue | — | IGNORED | toggle | mentioned | BROKEN: domain always copies |
| copyTags | — | works (manual) | toggle | mentioned | OK |

**CRITICAL:** 3 broken toggles. Domain always copies contact/products/value.

---

## 7. send_whatsapp_template

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| templateName | req | req | req select | req | OK |
| language | req | opt (default from DB) | NOT exposed | NOT mentioned | GAP |
| variables | — | opt (key_value) | key_value+conditional | mentioned | Conditional not in AI |

**GAP:** language param not in UI or AI. Executor defaults to DB template language.

---

## 8. send_whatsapp_text

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| text/messageBody | req | req | req textarea+vars | req | OK |

**Status:** Consistent. No gaps.

---

## 9. send_whatsapp_media

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| mediaUrl | req | req | req text | req | OK |
| caption | opt | opt | opt text+vars | opt | OK |
| filename | opt | NOT passed | NOT exposed | NOT mentioned | GAP |

**GAP:** filename not passed by executor, not in UI/AI.

---

## 10. create_task

| Field | Domain | Executor | UI | AI | Gap? |
|-------|--------|----------|-----|-----|------|
| title | req | req | req text+vars | req | OK |
| description | opt | opt | opt textarea+vars | opt | OK |
| dueDate/dueDateRelative | opt | computed from relative | delay control | opt | OK (semantic transform) |
| assignedTo/assignToUserId | opt | opt | opt select | opt | OK (naming difference) |
| priority | opt (default 'medium') | NOT passed | NOT exposed | NOT mentioned | GAP |
| status | opt (default 'pending') | NOT passed | NOT exposed | NOT mentioned | Intentional |
| contactId | opt | from context | auto | auto | OK |
| orderId | opt | from context | auto | auto | OK |
| conversationId | opt | NOT passed | NOT exposed | NOT mentioned | Intentional |

**GAP:** priority not exposed. status and conversationId intentionally omitted.

---

## 11. webhook

| Field | Executor | UI | AI | Gap? |
|-------|----------|-----|-----|------|
| url | req | req text | req | OK |
| headers | opt | opt key_value | opt | OK |
| payloadTemplate | opt | opt json+vars | opt | OK |

**Status:** Consistent. Legacy `payload` fallback exists but not a real gap.

---

## 12. send_sms

| Field | Executor | UI | AI | Gap? |
|-------|----------|-----|-----|------|
| body | req | req textarea+vars | req | OK |
| to | opt (fallback contactPhone) | opt text+vars | opt | OK |
| mediaUrl | opt | opt text | opt | OK |

**Status:** Consistent. No gaps.

---

## Fix Categories

### Category A: Executor field mapping (code fix)
Fields domain accepts but executor doesn't pass:
1. `create_order`: name, closingDate, carrier, trackingNumber, customFields
2. `update_field`: name (orders), shipping_department (orders), department (contacts)
3. `create_task`: priority
4. `send_whatsapp_media`: filename

### Category B: Broken toggles (code fix)
Toggles in UI that executor/domain ignores:
1. `create_order`: copyProducts (executor ignores)
2. `duplicate_order`: copyContact, copyProducts, copyValue (domain always copies)

Decision needed: Either make toggles functional OR remove them from UI.
Recommendation: For duplicate_order, modify domain to respect the flags. For create_order copyProducts, wire up the toggle.

### Category C: UI field exposure (UI changes)
Fields that work in executor but UI doesn't expose:
1. `remove_tag`: entityType (contact/order)
2. `update_field`: entityType (contact/order), field dropdown, value variable support
3. `create_order`: all 5 missing fields need catalog entries
4. `create_task`: priority (select dropdown)
5. `send_whatsapp_template`: language (select dropdown)
6. `send_whatsapp_media`: filename (text input)

### Category D: AI Builder knowledge (prompt update)
Fields the AI builder doesn't know about:
1. `create_order`: description, shippingAddress, shippingCity, shippingDepartment
2. `send_whatsapp_template`: language, conditional variable syntax
3. `create_task`: priority
4. All missing fields from Category C

### Category E: UX improvement — "Add field" dropdown
Instead of showing all optional fields always, use an "Add field" dropdown pattern:
- Required fields always visible
- Optional fields behind "Add field +" button
- User picks which fields to map
- Unmapped = null

This applies to actions with many optional fields:
- create_order (many optional fields)
- update_field (needs field picker by entity type)
- create_task (priority, description, etc.)
- webhook (headers, payload)

---

## Implementation Order

1. **Wave 1 — Executor fixes:** Map all missing fields in action-executor.ts
2. **Wave 2 — Broken toggles:** Fix copyProducts in create_order, fix duplicate_order domain to respect flags
3. **Wave 3 — UI catalog + constants:** Add all missing fields to ACTION_CATALOG
4. **Wave 4 — UI "Add field" UX:** Implement dropdown field picker pattern in actions-step.tsx
5. **Wave 5 — AI Builder:** Update system-prompt.ts with complete field knowledge
