# Roadmap de Desarrollo MorfX

---

## Fase 1: MVP (4-6 semanas)

**Objetivo:** CRM funcional conectado a WhatsApp con un pipeline simple

### Features

| Feature | Prioridad | Estado |
|---------|-----------|--------|
| Autenticación (NextAuth) | P0 | ⏳ Pendiente |
| Dashboard con métricas básicas | P0 | ⏳ Pendiente |
| Lista de contactos con búsqueda/filtros | P0 | ⏳ Pendiente |
| Vista de contacto individual | P0 | ⏳ Pendiente |
| Inbox WhatsApp integrado (readonly, via Callbell) | P0 | ⏳ Pendiente |
| Pipeline simple (4 stages hardcodeados) | P0 | ⏳ Pendiente |
| Vista Kanban de órdenes | P0 | ⏳ Pendiente |
| Creación manual de órdenes | P1 | ⏳ Pendiente |
| Tags compartidas CRM ↔ WhatsApp | P1 | ⏳ Pendiente |
| Integración básica con n8n (webhooks) | P1 | ⏳ Pendiente |

### Timeline

| Semana | Entregable |
|--------|------------|
| 1 | Setup + Autenticación + Dashboard |
| 2 | Contactos + Inbox WhatsApp |
| 3 | Órdenes + Pipeline Kanban |
| 4 | Integración n8n + Tags sincronizadas |
| 5-6 | Testing + Refinamiento + Deploy |

### Stack MVP

```
v0 → Genera estructura base
Cursor → Refina features
Claude Code → Integra WhatsApp + n8n + DB
Supabase → PostgreSQL + Auth
Vercel → Deploy
```

---

## Fase 2: Features Avanzadas (4-6 semanas)

### Features

| Feature | Prioridad | Estado |
|---------|-----------|--------|
| Editor de pipelines (crear/editar stages) | P0 | ⏳ Pendiente |
| Campos personalizados (custom fields) | P0 | ⏳ Pendiente |
| Automatizaciones por stage (webhooks) | P1 | ⏳ Pendiente |
| Reportes y analytics | P1 | ⏳ Pendiente |
| Exportar datos (CSV, Excel) | P2 | ⏳ Pendiente |
| Notas internas por contacto | P2 | ⏳ Pendiente |
| Asignación de agentes | P1 | ⏳ Pendiente |
| WhatsApp con respuesta desde CRM | P0 | ⏳ Pendiente |

---

## Fase 3: Multi-SAAS (6-8 semanas)

### Features

| Feature | Prioridad | Estado |
|---------|-----------|--------|
| Sistema de workspaces | P0 | ⏳ Pendiente |
| Signup + Onboarding | P0 | ⏳ Pendiente |
| Billing (Stripe) | P0 | ⏳ Pendiente |
| Subdominios por workspace | P1 | ⏳ Pendiente |
| Roles y permisos | P1 | ⏳ Pendiente |
| White-label (logo custom, colores) | P2 | ⏳ Pendiente |
| Marketplace de integraciones | P2 | ⏳ Pendiente |

---

## Fase 4: IA Distribuida Avanzada

### Features

| Feature | Prioridad | Estado |
|---------|-----------|--------|
| Sistema Retroactivo para State Analyzer | P0 | 📋 Diseñado |
| Carolina Logística (chatbot interno) | P0 | 📋 Diseñado |
| Dashboard de agentes IA | P1 | ⏳ Pendiente |
| Métricas de rendimiento por agente | P1 | ⏳ Pendiente |
| Entrenamiento con conversaciones exitosas | P2 | ⏳ Pendiente |

---

## Recursos Útiles

### Tutoriales/Docs

- [v0.dev Documentation](https://v0.dev)
- [Next.js 14 Tutorial](https://nextjs.org/docs)
- [Supabase Quickstart](https://supabase.com/docs)
- [Shadcn/ui](https://ui.shadcn.com)

### Templates Recomendados

- Taxonomy (Next.js SaaS)
- Next.js Supabase Starter

### Inspiración UI

- HubSpot CRM
- Pipedrive
- Linear (excelente UI/UX)

---

## Prompt Inicial para v0

```
Create a modern CRM dashboard with:
1. Sidebar navigation (Dashboard, Contacts, Orders, Inbox, Settings)
2. Main dashboard with 4 metric cards (Total Contacts, Active Orders, Messages Today, Revenue)
3. Recent activity feed
4. Quick actions buttons
Use Shadcn/ui components and Tailwind CSS. Make it look professional and clean.
```

---

*Documento parte del proyecto Modelo IA Distribuida*
