# MorfX Platform

## What This Is

MorfX es una plataforma SaaS multi-tenant que combina CRM + WhatsApp + Automatizaciones + Agentes IA para negocios e-commerce COD (Cash on Delivery). Permite gestionar contactos, pedidos, conversaciones de WhatsApp, automatizaciones inteligentes y agentes de venta AI en una sola interfaz. El sistema incluye un motor de automatizaciones configurable, un AI builder que crea automatizaciones por lenguaje natural, e integraciones con Twilio SMS y Shopify.

## Core Value

**Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos, automatizaciones inteligentes y agentes IA que atienden clientes automaticamente.**

Si todo lo demas falla, la sincronizacion CRM-WhatsApp + automatizaciones + agentes deben funcionar.

## Requirements

### Validated (MVP v1.0)

- Authentication (email/password, sessions, reset) — v1.0
- Workspaces & Roles (multi-tenant RLS, Owner/Admin/Agent) — v1.0
- Action DSL Core (16 tools, registry, logging) — v1.0
- Contacts (CRUD, tags, custom fields, notes, activity, import/export) — v1.0
- Orders (CRUD, Kanban, multi-products, pipeline config) — v1.0
- WhatsApp Core (inbox, messaging, 24h window) — v1.0
- WhatsApp Extended (templates, teams, quick replies, costs) — v1.0
- CRM <-> WhatsApp Sync (tags, order states with emoji) — v1.0
- Search, Tasks & Analytics — v1.0
- Shopify Integration (webhooks, auto-create) — v1.0

### Validated (MVP v2.0)

- Action DSL Real (16 real handlers: 9 CRM + 7 WhatsApp) — v2.0
- Agent Engine Core (Claude API, sessions, tools, token budget) — v2.0
- Agente Ventas Somnio (33 intents, data extraction, templates, orders) — v2.0
- Agent Sandbox (debug panels, sessions, CRM agents, per-model tokens) — v2.0
- Somnio Ingest System (data accumulation, classification, timer) — v2.0
- WhatsApp Agent Integration (routing, handoff, metrics, config) — v2.0
- Engine Unification (UnifiedEngine, SomnioAgent, 10 adapters) — v2.0
- CRM Automations Engine (10 triggers, 11 actions, wizard, Inngest runners) — v2.0
- Domain Layer Foundation (33 functions, 8 modules, single source of truth) — v2.0
- AI Automation Builder (natural language, React Flow diagrams, validation) — v2.0
- Integration Automations (Twilio SMS, 3 Shopify triggers, dual-behavior) — v2.0

### Active

#### Current Milestone: v3.0 Logística

**Goal:** Integrar robots de logística (empezando por Coordinadora) al CRM de MorfX, con un chat de comandos simple y vinculación a etapas del pipeline de pedidos.

**Target features:**
- Schema de logística (transportadoras, ciudades, estados de envío)
- Robot Coordinadora (Playwright automation adaptado a MorfX)
- Chat de comandos (panel tipo terminal con comandos fijos)
- Integración pipeline (cada robot vinculado a etapa de pedidos)
- Documentación de robots futuros (Inter/Envia PDF, OCR guías)

### Out of Scope

| Feature | Reason |
|---------|--------|
| Email como canal | Solo WhatsApp por ahora |
| SMS como canal de inbox | SMS solo como action de automatizacion (Twilio) |
| Conexion directa a Meta API | Usar 360dialog como intermediario |
| Inventario | Complejidad adicional, no critico |
| Pagos/recaudos | Agregar despues de validar CRM+WhatsApp+Agents |
| Mobile apps nativas | Web responsive primero |
| Multi-idioma | Solo espanol para mercado LATAM |
| make_call Twilio | Diferido a fase futura |

## Context

### Current State (v3.0 In Progress)

- **Codebase:** ~92,000 LOC TypeScript across 454+ files
- **Tech stack:** Next.js 15 (App Router) + React 19 + Supabase + Tailwind + Inngest + AI SDK v6
- **Architecture:** Domain layer as single source of truth, ports/adapters for agent engine, Inngest for async processing
- **Milestones shipped:** v1.0 (CRM+WhatsApp) + v2.0 (Agents+Automations)
- **Timeline:** 24 days total (2026-01-26 to 2026-02-20)

### Codebase Existente

Este proyecto coexiste con agentes de IA funcionales en produccion:
- **Agentes de Venta (n8n)**: En proceso de reemplazo por MorfX agents
- **Robots Logistica**: robot-coordinadora (Playwright), robot-inter-envia (PDF/Excel), ocr-guias-bot (Claude Vision)
- **Stack actual en transicion**: n8n + PostgreSQL + Callbell + Bigin → MorfX

### Vision a Largo Plazo: IA Distribuida

MorfX es el primer paso hacia un sistema de IA Distribuida:
- **Action DSL**: Lenguaje estructurado de acciones (implementado)
- **Domain Layer**: Fuente unica de verdad para mutaciones (implementado)
- **Agent Engine**: Motor generico con adapters (implementado)
- **Automations**: Trigger/action engine con AI builder (implementado)
- **RUPX**: Robot Universal de Plataformas Externas (futuro)
- **Admin Console**: Runs, steps, evidencias, aprobaciones (futuro)

### Target Market

E-commerce y negocios COD en Colombia/LATAM que venden por WhatsApp y necesitan:
- CRM simple pero funcional
- Integracion nativa con WhatsApp
- Agentes IA para atencion automatica
- Automatizaciones entre modulos
- Sincronizacion con Shopify

## Constraints

- **UI Framework**: Next.js + React + Tailwind (v0 para desarrollo de interfaz)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Frontend Hosting**: Vercel (optimizado para Next.js)
- **Async Processing**: Inngest (automation runners, agent timers, webhook routing)
- **AI**: Claude API via AI SDK v6 (Sonnet for builder, Haiku for classification)
- **WhatsApp Provider**: 360dialog (zero markup, Partner API)
- **Multi-tenant**: Row Level Security desde el inicio
- **Idioma**: Interfaz en espanol (mercado LATAM)
- **Timezone**: America/Bogota (UTC-5) para toda logica de fechas

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 360dialog como proveedor WhatsApp | Zero markup, Partner API multi-tenant | Good |
| Supabase para DB + Auth | RLS built-in, Auth con custom claims | Good |
| Arquitectura hibrida (Vercel + Supabase) | Cada servicio optimizado | Good |
| Multi-tenant desde el inicio | Evita refactor costoso | Good |
| Action DSL desde el inicio | Prepara para IA Distribuida | Good |
| Tags compartidos entre modulos | Core value, diferenciador | Good |
| LEARNINGS.md obligatorio por fase | Documentar para agentes futuros | Good |
| AI SDK v6 para Claude | useChat, streaming, tool use nativo | Good |
| Inngest para async processing | Concurrency control, event-driven, serverless-safe | Good |
| Domain layer como fuente de verdad | Elimina duplicacion, habilita IA distribuida | Good |
| Ports/Adapters para UnifiedEngine | Un codebase para sandbox + produccion | Good |
| React Flow para diagramas | Visual preview de automatizaciones, custom nodes | Good |
| Fire-and-forget abandonado en webhooks | Vercel termina funcion antes de completar send | Good (critical fix) |
| Two automation contexts (flat vs nested) | TriggerContext para logica, variableContext para templates | Good |

## Workflow Obligatorio

### LEARNINGS.md por Fase

Despues de completar cada fase, es **OBLIGATORIO** crear un archivo LEARNINGS.md que documente:

1. **Bugs encontrados**: Que fallo, por que, como se arreglo
2. **Decisiones tecnicas**: Que se eligio, alternativas descartadas
3. **Problemas de integracion**: Componentes que no funcionaron bien juntos
4. **Tips para futuros agentes**: Lo que funciono, lo que NO hacer
5. **Deuda tecnica**: Que se dejo pendiente y cuando abordarlo

**Proposito**: Entrenar agentes de documentacion por modulo para la IA Distribuida.

| Robots de logística como servicios internos | Adaptar Playwright robots existentes en vez de reescribir desde cero | — Pending |
| Chat de comandos (no AI) para robots | Panel simple tipo terminal, comandos fijos, sin agente conversacional | — Pending |
| Robot por etapa del pipeline | Cada robot se vincula a una etapa, procesa pedidos en esa etapa | — Pending |

## Workflow Obligatorio

### LEARNINGS.md por Fase

Despues de completar cada fase, es **OBLIGATORIO** crear un archivo LEARNINGS.md que documente:

1. **Bugs encontrados**: Que fallo, por que, como se arreglo
2. **Decisiones tecnicas**: Que se eligio, alternativas descartadas
3. **Problemas de integracion**: Componentes que no funcionaron bien juntos
4. **Tips para futuros agentes**: Lo que funciono, lo que NO hacer
5. **Deuda tecnica**: Que se dejo pendiente y cuando abordarlo

**Proposito**: Entrenar agentes de documentacion por modulo para la IA Distribuida.

---
*Last updated: 2026-02-20 after v3.0 milestone start*
