# MorfX Platform

## What This Is

MorfX es una plataforma SaaS multi-tenant que combina CRM + WhatsApp para negocios e-commerce con modelo COD (Cash on Delivery). Permite gestionar contactos, pedidos y conversaciones de WhatsApp en una sola interfaz, con el objetivo a largo plazo de evolucionar hacia un sistema de IA Distribuida con robots autónomos, Action DSL y auditoría completa.

## Core Value

**Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos módulos.**

Si todo lo demás falla, esta sincronización entre WhatsApp y CRM debe funcionar.

## Current Milestone: v2.0 Agentes Conversacionales

**Goal:** Transformar los agentes existentes de n8n en agentes conversacionales con código propio, mayor control, y visualización tipo canvas.

**Target features:**
- Auditoría profunda de agentes n8n actuales en producción
- Canvas visual para gestión de agentes (tipo n8n pero con más control)
- Action DSL conectado con funciones reales
- Motor de agente con Claude API
- Sandbox para probar conversaciones
- Integración de agentes con WhatsApp real

## Requirements

### Validated (MVP v1.0)

<!-- Shipped and confirmed valuable in MVP v1 -->

- ✓ Authentication (email/password, sessions, reset) — Phase 1
- ✓ Workspaces & Roles (multi-tenant RLS, Owner/Admin/Agent) — Phase 2
- ✓ Action DSL Core (16 tools, registry, logging) — Phase 3
- ✓ Contacts (CRUD, tags, custom fields, notes, activity, import/export) — Phases 4-5
- ✓ Orders (CRUD, Kanban, multi-products, pipeline config) — Phase 6
- ✓ WhatsApp Core (inbox, messaging, 24h window) — Phase 7
- ✓ WhatsApp Extended (templates, teams, quick replies, costs) — Phase 8
- ✓ CRM ↔ WhatsApp Sync (tags, order states with emoji) — Phase 9
- ✓ Search, Tasks & Analytics — Phase 10
- ✓ Shopify Integration (webhooks, auto-create) — Phase 11

### Active (MVP v2.0 — Agentes Conversacionales)

#### Auditoría de Agentes Actuales
- [ ] Documentar todos los agentes n8n en producción (workflows, triggers, acciones)
- [ ] Identificar limitaciones de cada agente actual
- [ ] Mapear dependencias entre agentes
- [ ] Diseñar arquitectura de transformación a código propio

#### Canvas Visual de Agentes
- [ ] Investigar opciones de display visual (React Flow, custom canvas, etc.)
- [ ] Diseñar UX para control granular de agentes
- [ ] Decidir si módulo interno o plataforma dev separada
- [ ] Prototipo de visualización de flujos de agente

#### Action DSL → Funciones Reales
- [ ] Reemplazar handlers placeholder con operaciones reales
- [ ] API /api/v1/tools funcional para CRM y WhatsApp
- [ ] Logging forense completo de ejecuciones
- [ ] Tests de integración para cada tool

#### Motor de Agente Claude
- [ ] Integración con Claude API (tool use, streaming)
- [ ] Configuración de system prompt por agente
- [ ] Gestión de contexto y historial de conversación
- [ ] Manejo de herramientas del Action DSL

#### Agent Sandbox
- [ ] UI de pruebas en /sandbox
- [ ] Simulación cliente ↔ agente
- [ ] Visualización de tools ejecutados (transparencia)
- [ ] Historial de sesiones de prueba

#### WhatsApp Agent Integration
- [ ] Conexión de agentes con conversaciones reales
- [ ] Handoff robot → humano configurable
- [ ] Reglas de cuándo interviene agente vs humano
- [ ] Métricas de conversaciones automatizadas

### Out of Scope

- Inventario — Complejidad adicional, agregar en v2
- Gestión de pagos/recaudos — Agregar después del MVP
- Reportes avanzados — Solo reportes básicos en v1
- Chatbot/automatizaciones complejas — Después del MVP core
- Conexión directa a Meta API — Usar intermediario (360dialog) primero
- Email/SMS como canales — Solo WhatsApp en v1
- Mobile apps nativas — Web-first, mobile responsive
- SCIM/SSO enterprise — Después de validar modelo de negocio

## Context

### Codebase Existente

Este proyecto existe dentro de un repositorio con agentes de IA funcionales en producción:
- **Agentes de Venta (n8n)**: Historial v3, State Analyzer, Data Extractor, Carolina v3, Order Manager, Proactive Timer
- **Robots Logística**: robot-coordinadora (Playwright), robot-inter-envia (PDF/Excel), ocr-guias-bot (Claude Vision)
- **Stack actual**: n8n + PostgreSQL + Callbell + Bigin + Claude API

MorfX reemplazará gradualmente Bigin (CRM) y eventualmente Callbell (WhatsApp), dando control total sobre el código.

### Visión a Largo Plazo: IA Distribuida

MorfX es el primer paso hacia un sistema de IA Distribuida que incluye:
- **Action DSL**: Lenguaje estructurado de acciones (no clicks sueltos)
- **RUPX**: Robot Universal de Plataformas Externas
- **Ciclo obligatorio**: PLAN → SIMULAR → EJECUTAR → VERIFICAR → LOG
- **Admin Console**: Runs, steps, evidencias, aprobaciones
- **CRM Adapter intercambiable**: Hoy Bigin (UI), mañana MorfX (API)

### Target Market

E-commerce y negocios COD en Colombia/LATAM que venden por WhatsApp y necesitan:
- CRM simple pero funcional
- Integración nativa con WhatsApp
- Sincronización con Shopify
- Control sobre su data y procesos

### Investigación Completada

1. **WhatsApp Business API**: Políticas, límites de mensajes, warm-up de números, causas de bloqueo
2. **Proveedores WhatsApp**: Comparativa completa — 360dialog recomendado (zero markup)
3. **Callbell**: Análisis de features para replicar y mejorar
4. **Shopify API**: Webhooks, autenticación, best practices para sync
5. **RBAC Multi-tenant**: Esquema de roles, RLS con Supabase, JWT claims

## Constraints

- **UI Framework**: v0 obligatorio para desarrollo de interfaz (Next.js + React + Tailwind)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Frontend Hosting**: Vercel (optimizado para Next.js)
- **Backend/Workers**: Hostinger (procesos long-running, Redis)
- **WhatsApp Provider**: 360dialog (zero markup, Partner API para multi-tenant)
- **Multi-tenant**: Desde el inicio con Row Level Security
- **Idioma**: Interfaz en español (mercado LATAM)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 360dialog como proveedor WhatsApp | Zero markup en mensajes, Partner API para multi-tenant, mejor unit economics | — Pending |
| Supabase para DB + Auth | RLS built-in, Auth con custom claims, Storage incluido, developer experience | — Pending |
| Arquitectura híbrida (Vercel + Supabase + Hostinger) | Cada servicio optimizado para su caso de uso | — Pending |
| Multi-tenant desde el inicio | Evita refactor costoso después, necesario para SaaS | — Pending |
| Action DSL desde el inicio | Prepara el camino para IA Distribuida sin reescribir | — Pending |
| Tags compartidos entre módulos | Core value del producto, diferenciador vs competencia | — Pending |
| v0 para UI | Desarrollo acelerado con IA, obligatorio por el usuario | — Pending |
| LEARNINGS.md obligatorio por fase | Documentar bugs, decisiones y tips para entrenar agentes futuros | ✓ Implemented |

## Workflow Obligatorio

### LEARNINGS.md por Fase

Después de completar cada fase, es **OBLIGATORIO** crear un archivo `{phase}-LEARNINGS.md` que documente:

1. **Bugs encontrados**: Qué falló, por qué, cómo se arregló, cómo prevenirlo
2. **Decisiones técnicas**: Qué se eligió, alternativas descartadas, razón
3. **Problemas de integración**: Componentes que no funcionaron bien juntos
4. **Tips para futuros agentes**: Lo que funcionó, lo que NO hacer, patrones a seguir
5. **Deuda técnica**: Qué se dejó pendiente y cuándo abordarlo

**Propósito**: Entrenar agentes de documentación por módulo que entiendan perfectamente cómo se construyó el software.

**Template**: `.planning/templates/LEARNINGS-TEMPLATE.md`

---
*Last updated: 2026-02-04 after starting MVP v2.0 Agentes Conversacionales*
