# Arquitectura de Agentes IA — MorfX v2.0

**Actualizado:** 19 de Febrero 2026

---

## Resumen

MorfX implementa un sistema de agentes IA basado en el patron Ports/Adapters (Hexagonal) con un UnifiedEngine que sirve tanto sandbox como produccion desde el mismo codebase. El agente principal es SomnioAgent (ventas via WhatsApp), con OrderManagerAgent como agente CRM auxiliar. Toda la logica de negocio vive en el agente; el engine es un thin runner que delega I/O a 5 adaptadores.

---

## Arquitectura Actual (Implementada)

```
┌─────────────────────────────────────────────────────────────┐
│                     UnifiedEngine                            │
│              (Thin Runner — Ports/Adapters)                   │
│                                                              │
│  Mensaje llega → Fetch session → Fetch history               │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SomnioAgent.processMessage()              │   │
│  │                                                        │   │
│  │  1. Check ingest mode (if collecting_data)             │   │
│  │     └─ MessageClassifier → IngestManager               │   │
│  │        └─ 4 categorias: datos/pregunta/mixto/irrelevante│  │
│  │                                                        │   │
│  │  2. Check implicit yes (confirmacion tacita)           │   │
│  │                                                        │   │
│  │  3. IntentDetector (Claude Sonnet)                     │   │
│  │     └─ 33 intents, confidence routing                  │   │
│  │     └─ Thresholds: 85/60/40                            │   │
│  │                                                        │   │
│  │  4. SomnioOrchestrator (Claude Sonnet)                 │   │
│  │     └─ TemplateManager (primera_vez vs siguientes)     │   │
│  │     └─ Decide: response, templates, next mode          │   │
│  │                                                        │   │
│  │  5. Build state updates + timer signals                │   │
│  │     └─ Returns: SomnioAgentOutput                      │   │
│  └──────────────────────────────────────────────────────┘   │
│       │                                                      │
│       ▼                                                      │
│  Route to 5 Adapters:                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ ┌──────┐ │
│  │ Storage  │ │  Timer   │ │ Messaging│ │Orders│ │Debug │ │
│  │          │ │          │ │          │ │      │ │      │ │
│  │ Session  │ │ Inngest  │ │ WhatsApp │ │ CRM  │ │ Audit│ │
│  │ History  │ │ Signals  │ │ Send     │ │Create│ │ Log  │ │
│  │ State    │ │ Events   │ │ Sequence │ │      │ │      │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────┘ └──────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Agentes Implementados

### SomnioAgent (Agente Principal de Ventas)
- **Archivo:** `src/lib/agents/somnio/somnio-agent.ts` (744 lineas)
- **Config:** `src/lib/agents/somnio/config.ts` (167 lineas)
- **Prompts:** `src/lib/agents/somnio/prompts.ts` (313 lineas)
- **Proposito:** Bot conversacional de ventas para Somnio (almohadas) via WhatsApp
- **Tools:** crm.contact.create, crm.contact.update, crm.contact.get, crm.order.create, whatsapp.message.send, whatsapp.template.send

**Componentes internos:**
- `IntentDetector` — Claude Sonnet, clasifica en 33 intents con confidence scoring
- `MessageClassifier` — Haiku-first con Sonnet fallback, 4 categorias de ingest
- `IngestManager` — Extrae datos, maneja accumulation silenciosa
- `SomnioOrchestrator` — Claude Sonnet, decide acciones post-intent
- `TemplateManager` — Seleccion de templates por intent + visit type
- `DataExtractor` — Extrae 8 campos de datos del cliente

### OrderManagerAgent (Agente CRM)
- **Archivo:** `src/lib/agents/crm/order-manager/agent.ts`
- **Proposito:** Crea ordenes desde contexto conversacional
- **Variantes:** full (8 campos + pack), no_promo (8 campos), draft (nombre + telefono)
- **Modos:** dry-run (mock responses) y live (mutaciones reales via domain layer)

### Agent Registry
- **Archivo:** `src/lib/agents/registry.ts` (118 lineas)
- **Patron:** Self-registration — cada agente se registra al importar su modulo
- **Extensibilidad:** Nuevos agentes se agregan implementando BaseCrmAgent + registrandose

---

## Flujo Completo: Mensaje WhatsApp → Respuesta

```
1. 360dialog webhook → /api/webhooks/whatsapp
2. Verify HMAC → processWebhook()
3. Store inbound message → domain/messages.receiveMessage()
4. Emit Inngest event → agent/whatsapp.message_received
5. whatsappAgentProcessor (Inngest, concurrency 1/conversation)
6. UnifiedEngine.processMessage() con production adapters
   a. Storage: SessionManager + Supabase (agent_sessions, agent_turns)
   b. SomnioAgent.processMessage() — ALL business logic
   c. Storage: save state, mode changes, turns, intents
   d. Timer: emit Inngest signals (start/cancel/reevaluate)
   e. Orders: ProductionOrdersAdapter if shouldCreateOrder
      - findOrCreateContact → crm.contact.list/create/update (con department)
      - domainCreateOrder con name, shippingCity, shippingDepartment
   f. Messaging: MessageSequencer → WhatsApp API (with delays)
   g. Debug: audit system
7. Return EngineOutput → Inngest step completes
8. webhook-processor: sync conversation.contact_id si engine resolvio contacto diferente
9. webhook-processor: tag conversation "WPP" si se creo orden
```

---

## Sandbox vs Produccion

| Aspecto | Sandbox | Produccion |
|---------|---------|------------|
| Storage | In-memory SandboxState | SessionManager + Supabase |
| Timer | No-op (returns signals) | Inngest events durables |
| Messaging | Collect as strings | WhatsApp API via MessageSequencer |
| Orders | SandboxOrdersAdapter dry-run | ProductionOrdersAdapter → domain/orders (name, city, dept) |
| Debug | Collects intent, tools, tokens, state | No-op (audit system) |
| Entry point | `/api/sandbox/process` | Inngest whatsappAgentProcessor |
| State persistence | None (session-scoped) | DB agent_sessions + session_state |

---

## Sistema de Timers (5 Niveles)

```
L0: Waiting     — Esperando primer dato
L1: Partial     — 6/8 campos → pedir faltantes (6 min timeout)
L2: Escalate    — Sin respuesta → ofrecer promos (10 min timeout)
L3: Promos      — En promos → crear orden o timeout (10 min timeout)
L4: Confirm     — Orden seleccionada → confirmacion final (10 min timeout)
```

**Produccion:** Inngest `step.waitForEvent()` con timeout configurable (real/rapido/instantaneo)
**Sandbox:** IngestTimerSimulator client-side con refs para evitar stale closures

---

## Tools Disponibles (Action DSL)

**29 tools** registrados en `src/lib/tools/`:

| Modulo | Tools | Handler |
|--------|-------|---------|
| CRM Contacts | create, update, delete, read, list | Real → domain/contacts |
| CRM Tags | add, remove | Real → domain/tags |
| CRM Orders | create, update, updateStatus, delete, duplicate, list | Real → domain/orders |
| CRM Tasks | create, update, complete, list | Real → domain/tasks |
| CRM Notes | create, list, delete | Real → domain/notes |
| CRM Custom Fields | update, read | Real → domain/custom-fields |
| WhatsApp Messages | send, list | Real → domain/messages |
| WhatsApp Templates | send, list | Real → 360dialog API + domain |
| WhatsApp Conversations | list, assign, close | Real → domain/conversations |

**Executor:** `src/lib/tools/executor.ts` (292 lineas) con validacion, permisos, rate limiting, timeouts (CRM 5s, WhatsApp 15s, System 10s), y audit logging.

---

## Comunicacion entre Componentes

```
SomnioAgent ──[SomnioAgentOutput]──► UnifiedEngine
    │
    ├─ response (text to send)
    ├─ templates[] (WhatsApp templates to send)
    ├─ stateUpdates (intents, datos, mode, pack)
    ├─ timerSignals[] (start/cancel/reevaluate)
    ├─ shouldCreateOrder (boolean)
    └─ debugInfo (intent, tools, tokens)

UnifiedEngine ──[adapters]──► External Systems
    │
    ├─ Storage adapter → Supabase (agent_sessions, agent_turns, session_state)
    ├─ Timer adapter → Inngest (agent/* events)
    ├─ Messaging adapter → 360dialog API (WhatsApp messages)
    ├─ Orders adapter → ProductionOrdersAdapter → findOrCreateContact + domain/orders
    └─ Debug adapter → audit system
```

---

## Lo que NO esta implementado (Futuro)

- **Multi-agent orchestration** — Solo 1 agente conversacional (Somnio), no hay routing entre multiples
- **Agent canvas visual** — Configuracion via codigo, no hay editor visual de flujos
- **Sistema retroactivo** — Comparacion con conversaciones exitosas (diseñado, no implementado)
- **Carolina Logistica** — Chatbot interno para operaciones (diseñado, no implementado)
- **Agentes adicionales** — Recompra, seguimiento, customer service
- **Context summarization** — No hay truncamiento automatico de contexto (< 200K tokens)
- **Circuit breaker** — No hay fallback automatico en errores de tool
- **Message queueing** — No hay cola Redis/Bull para burst traffic

---

## Archivos Clave

```
src/lib/agents/
├── somnio/
│   ├── somnio-agent.ts        (744L — ALL business logic)
│   ├── config.ts              (167L — Agent configuration)
│   ├── prompts.ts             (313L — System prompts)
│   ├── intent-detector.ts     (Intent classification)
│   ├── message-classifier.ts  (Ingest classification)
│   ├── ingest-manager.ts      (Data extraction + routing)
│   ├── somnio-orchestrator.ts (Response generation)
│   └── template-manager.ts    (Template selection)
├── crm/
│   ├── base-crm-agent.ts     (Abstract base)
│   └── order-manager/
│       └── agent.ts           (Order creation agent)
├── engine/
│   └── unified-engine.ts     (329L — Thin runner)
├── engine-adapters/
│   ├── sandbox/index.ts      (In-memory adapters)
│   └── production/index.ts   (Real adapters)
└── registry.ts               (118L — Agent registration)

src/lib/tools/
├── schemas/
│   ├── crm.tools.ts          (1,188L — 22 tool schemas)
│   └── whatsapp.tools.ts     (365L — 7 tool schemas)
├── handlers/
│   ├── crm/index.ts          (Real CRM handlers)
│   └── whatsapp/index.ts     (Real WhatsApp handlers)
├── executor.ts               (292L — Tool execution engine)
└── init.ts                   (93L — Registry initialization)
```

---

*Documento reescrito completamente el 19 Feb 2026 basado en codigo real, reemplaza version pre-codigo del 23 Ene 2026*
