# Requirements: MorfX Platform

**Defined:** 2026-01-26
**Core Value:** Los usuarios pueden gestionar sus ventas por WhatsApp y su CRM en un solo lugar, con tags y estados sincronizados entre ambos modulos.

## v1 Requirements

Requirements para el MVP. Cada uno mapea a fases del roadmap.

### Authentication (AUTH)

- [ ] **AUTH-01**: Usuario puede registrarse con email y contrasena
- [ ] **AUTH-02**: Usuario puede hacer login y mantener sesion
- [ ] **AUTH-03**: Usuario puede hacer logout
- [ ] **AUTH-04**: Sistema soporta verificacion de email (toggle, off para testing)
- [ ] **AUTH-05**: Sistema soporta reset de contrasena (toggle, off para testing)

### Workspaces (WORK)

- [ ] **WORK-01**: Usuario puede crear un workspace nuevo
- [ ] **WORK-02**: Owner puede invitar usuarios al workspace via email
- [ ] **WORK-03**: Sistema soporta 3 roles: Owner, Admin, Agent
- [ ] **WORK-04**: Cada rol tiene permisos especificos definidos
- [ ] **WORK-05**: Datos de un workspace estan aislados de otros (RLS)

### Contacts (CONT)

- [x] **CONT-01**: Usuario puede ver lista de contactos de su workspace
- [x] **CONT-02**: Usuario puede crear un contacto nuevo
- [x] **CONT-03**: Usuario puede editar un contacto existente
- [x] **CONT-04**: Usuario con permiso puede eliminar contactos
- [x] **CONT-05**: Contacto tiene campos basicos: nombre, telefono, email, direccion, ciudad
- [x] **CONT-06**: Workspace puede definir campos custom para contactos
- [x] **CONT-07**: Usuario puede agregar/quitar tags a contactos
- [x] **CONT-08**: Usuario puede filtrar contactos por tags
- [x] **CONT-09**: Usuario puede importar contactos desde CSV
- [x] **CONT-10**: Usuario puede exportar contactos a CSV
- [x] **CONT-11**: Usuario puede agregar notas internas a un contacto
- [x] **CONT-12**: Usuario puede ver historial de actividad de un contacto (mensajes, pedidos, cambios)

### Search (SRCH)

- [ ] **SRCH-01**: Usuario puede buscar globalmente en contactos, pedidos y conversaciones
- [ ] **SRCH-02**: Resultados de busqueda muestran tipo y preview
- [ ] **SRCH-03**: Usuario puede filtrar busqueda por tipo (contactos, pedidos, conversaciones)

### Tasks (TASK)

- [ ] **TASK-01**: Usuario puede crear tareas/recordatorios
- [ ] **TASK-02**: Tarea puede estar vinculada a contacto, pedido o conversacion
- [ ] **TASK-03**: Usuario puede ver lista de tareas pendientes
- [ ] **TASK-04**: Sistema notifica cuando una tarea esta proxima a vencer

### Orders (ORDR)

- [ ] **ORDR-01**: Usuario puede ver lista de pedidos de su workspace
- [ ] **ORDR-02**: Usuario puede crear un pedido nuevo
- [ ] **ORDR-03**: Usuario puede editar un pedido existente
- [ ] **ORDR-04**: Usuario con permiso puede eliminar pedidos
- [ ] **ORDR-05**: Pedido puede tener multiples productos
- [ ] **ORDR-06**: Pedido tiene campos: contacto, productos, valor, estado, tracking, notas
- [ ] **ORDR-07**: Usuario puede ver pedidos en vista Kanban por etapas
- [ ] **ORDR-08**: Usuario puede mover pedidos entre etapas (drag & drop)
- [ ] **ORDR-09**: Workspace puede configurar etapas del pipeline
- [ ] **ORDR-10**: Tags de pedido se sincronizan con modulo WhatsApp
- [ ] **ORDR-11**: Estado de pedido se sincroniza con modulo WhatsApp

### WhatsApp (WAPP)

- [ ] **WAPP-01**: Usuario puede ver inbox de conversaciones
- [ ] **WAPP-02**: Usuario puede ver historial de mensajes de una conversacion
- [ ] **WAPP-03**: Usuario puede enviar mensajes dentro de ventana 24h
- [ ] **WAPP-04**: Usuario puede enviar templates pre-aprobados fuera de ventana 24h
- [ ] **WAPP-05**: Admin puede crear y gestionar templates de WhatsApp
- [ ] **WAPP-06**: Usuario puede asignar conversacion a otro agente
- [ ] **WAPP-07**: Manager+ puede ver todas las conversaciones del workspace
- [ ] **WAPP-08**: Agent solo ve conversaciones asignadas o sin asignar
- [ ] **WAPP-09**: Usuario puede usar quick replies (respuestas rapidas guardadas)
- [ ] **WAPP-10**: Tags de conversacion se sincronizan con modulo CRM
- [ ] **WAPP-11**: Conversacion se vincula automaticamente con contacto por telefono

### Integrations (INTG)

- [ ] **INTG-01**: Sistema recibe webhooks de Shopify para pedidos nuevos
- [ ] **INTG-02**: Pedido de Shopify crea/actualiza contacto y pedido en MorfX
- [ ] **INTG-03**: Sistema se conecta a 360dialog para WhatsApp API
- [ ] **INTG-04**: Arquitectura preparada para webhooks salientes (no implementados aun)
- [ ] **INTG-05**: Arquitectura preparada para futuras integraciones (WooCommerce, etc.)

### Action DSL (ADSL)

- [ ] **ADSL-01**: Cada operacion CRUD del CRM es un "tool" ejecutable
- [ ] **ADSL-02**: Cada operacion de WhatsApp es un "tool" ejecutable
- [ ] **ADSL-03**: Sistema tiene registry de tools disponibles
- [ ] **ADSL-04**: Cada ejecucion de tool genera log estructurado
- [ ] **ADSL-05**: Tools pueden ser invocados via API interna

### Analytics (ANLT)

- [ ] **ANLT-01**: Dashboard muestra metricas clave del workspace
- [ ] **ANLT-02**: Metricas incluyen: total pedidos, valor total, tasa conversion
- [ ] **ANLT-03**: Metricas incluyen: tiempo promedio de respuesta WhatsApp
- [ ] **ANLT-04**: Dashboard muestra graficos de tendencia basicos

### UI/UX (UIUX)

- [ ] **UIUX-01**: Interfaz desarrollada con v0 + Next.js + Tailwind
- [ ] **UIUX-02**: Diseno responsive (funciona en movil)
- [ ] **UIUX-03**: Interfaz en espanol
- [ ] **UIUX-04**: Navegacion clara entre modulos (CRM, WhatsApp, Settings)

### Documentation for AI Agents (DOCS) — BLOQUEANTE

> **VISION**: Toda la documentacion generada alimentara agentes de IA que entenderan
> perfectamente como se construyo el software. Esto es FUNDAMENTAL para la IA Distribuida.

- [x] **DOCS-01**: Cada fase DEBE tener un archivo LEARNINGS.md al completarse (BLOQUEANTE)
- [ ] **DOCS-02**: LEARNINGS.md documenta bugs encontrados con causa, fix y prevencion
- [ ] **DOCS-03**: LEARNINGS.md documenta decisiones tecnicas con alternativas y razones
- [ ] **DOCS-04**: LEARNINGS.md documenta tips para futuros agentes (que SI hacer, que NO hacer)
- [ ] **DOCS-05**: LEARNINGS.md documenta deuda tecnica identificada con prioridad

**REGLA ESTRICTA**: Una fase NO puede marcarse como completa sin su LEARNINGS.md.
**PROPOSITO**: Entrenar agentes de documentacion por modulo para la IA Distribuida.

## v1.1 Requirements (Post-MVP Priority)

Inmediatamente despues del MVP. Indispensable para el producto completo.

### Multi-Channel (CHAN)

- [ ] **CHAN-01**: Sistema se conecta a Facebook Messenger via Meta Business API
- [ ] **CHAN-02**: Sistema se conecta a Instagram Direct via Instagram Graph API
- [ ] **CHAN-03**: Inbox unificado muestra conversaciones de WhatsApp, Facebook e Instagram
- [ ] **CHAN-04**: Usuario puede identificar canal de origen en cada conversacion
- [ ] **CHAN-05**: Usuario puede responder en el mismo canal donde llego el mensaje
- [ ] **CHAN-06**: Contacto puede tener conversaciones en multiples canales vinculadas

## v2 Requirements

Diferidos para futuro. Tracked pero no en roadmap actual.

### Authentication

- **AUTH-V2-01**: Login con magic links (sin contrasena)
- **AUTH-V2-02**: Login con OAuth (Google)
- **AUTH-V2-03**: Autenticacion de dos factores (2FA)

### Workspaces

- **WORK-V2-01**: Roles adicionales: Manager, Viewer
- **WORK-V2-02**: Permisos custom por workspace
- **WORK-V2-03**: SSO/SAML para enterprise

### WhatsApp

- **WAPP-V2-01**: Chatbot/automatizaciones
- **WAPP-V2-02**: Broadcasts masivos con segmentacion
- **WAPP-V2-03**: WhatsApp Calling API

### Integrations

- **INTG-V2-01**: Webhooks salientes para Zapier/n8n/Make
- **INTG-V2-02**: Integracion WooCommerce
- **INTG-V2-03**: Integracion MercadoLibre
- **INTG-V2-04**: Integracion con transportadoras (Coordinadora, Inter, Envia)

### Analytics

- **ANLT-V2-01**: Reportes avanzados exportables
- **ANLT-V2-02**: Metricas por agente
- **ANLT-V2-03**: Funnel de conversion detallado

### Products

- **PROD-V2-01**: Catalogo de productos propio en MorfX
- **PROD-V2-02**: Sync bidireccional con Shopify products

### Other

- **OTHR-V2-01**: Gestion de inventario
- **OTHR-V2-02**: Gestion de pagos/recaudos
- **OTHR-V2-03**: Mobile apps nativas

## Out of Scope

Explicitamente excluido. Documentado para prevenir scope creep.

| Feature | Reason |
|---------|--------|
| Email como canal | Solo WhatsApp en v1, agregar canales despues |
| SMS como canal | Solo WhatsApp en v1 |
| Conexion directa a Meta API | Usar 360dialog como intermediario para simplificar |
| Inventario | Complejidad adicional, no critico para validar core value |
| Pagos/recaudos | Agregar despues de validar CRM+WhatsApp |
| Mobile apps nativas | Web responsive primero, apps despues |
| Multi-idioma | Solo espanol para mercado LATAM inicial |
| IA/Chatbot | Despues de validar flujo manual |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| WORK-01 | Phase 2 | Pending |
| WORK-02 | Phase 2 | Pending |
| WORK-03 | Phase 2 | Pending |
| WORK-04 | Phase 2 | Pending |
| WORK-05 | Phase 2 | Pending |
| CONT-01 | Phase 4 | Complete |
| CONT-02 | Phase 4 | Complete |
| CONT-03 | Phase 4 | Complete |
| CONT-04 | Phase 4 | Complete |
| CONT-05 | Phase 4 | Complete |
| CONT-06 | Phase 5 | Complete |
| CONT-07 | Phase 4 | Complete |
| CONT-08 | Phase 4 | Complete |
| CONT-09 | Phase 5 | Complete |
| CONT-10 | Phase 5 | Complete |
| CONT-11 | Phase 5 | Complete |
| CONT-12 | Phase 5 | Complete |
| SRCH-01 | Phase 10 | Pending |
| SRCH-02 | Phase 10 | Pending |
| SRCH-03 | Phase 10 | Pending |
| TASK-01 | Phase 10 | Pending |
| TASK-02 | Phase 10 | Pending |
| TASK-03 | Phase 10 | Pending |
| TASK-04 | Phase 10 | Pending |
| ORDR-01 | Phase 6 | Pending |
| ORDR-02 | Phase 6 | Pending |
| ORDR-03 | Phase 6 | Pending |
| ORDR-04 | Phase 6 | Pending |
| ORDR-05 | Phase 6 | Pending |
| ORDR-06 | Phase 6 | Pending |
| ORDR-07 | Phase 6 | Pending |
| ORDR-08 | Phase 6 | Pending |
| ORDR-09 | Phase 6 | Pending |
| ORDR-10 | Phase 9 | Pending |
| ORDR-11 | Phase 9 | Pending |
| WAPP-01 | Phase 7 | Pending |
| WAPP-02 | Phase 7 | Pending |
| WAPP-03 | Phase 7 | Pending |
| WAPP-04 | Phase 8 | Pending |
| WAPP-05 | Phase 8 | Pending |
| WAPP-06 | Phase 8 | Pending |
| WAPP-07 | Phase 8 | Pending |
| WAPP-08 | Phase 8 | Pending |
| WAPP-09 | Phase 8 | Pending |
| WAPP-10 | Phase 9 | Pending |
| WAPP-11 | Phase 7 | Pending |
| INTG-01 | Phase 9 | Pending |
| INTG-02 | Phase 9 | Pending |
| INTG-03 | Phase 7 | Pending |
| INTG-04 | Phase 7 | Pending |
| INTG-05 | Phase 7 | Pending |
| ADSL-01 | Phase 3 | Complete |
| ADSL-02 | Phase 3 | Complete |
| ADSL-03 | Phase 3 | Complete |
| ADSL-04 | Phase 3 | Complete |
| ADSL-05 | Phase 3 | Complete |
| ANLT-01 | Phase 10 | Pending |
| ANLT-02 | Phase 10 | Pending |
| ANLT-03 | Phase 10 | Pending |
| ANLT-04 | Phase 10 | Pending |
| UIUX-01 | Phase 1 | Complete |
| UIUX-02 | Phase 1 | Complete |
| UIUX-03 | Phase 1 | Complete |
| UIUX-04 | Phase 1 | Complete |
| DOCS-01 | ALL Phases (1-10) | Phase 1 Complete |
| DOCS-02 | ALL Phases (1-10) | Phase 1 Complete |
| DOCS-03 | ALL Phases (1-10) | Phase 1 Complete |
| DOCS-04 | ALL Phases (1-10) | Phase 1 Complete |
| DOCS-05 | ALL Phases (1-10) | Phase 1 Complete |

**Coverage:**
- v1 requirements: 65 total (60 funcionales + 5 documentacion)
- Mapped to phases: 65
- Unmapped: 0

**DOCS Requirements - Estado por Fase:**

| Fase | LEARNINGS.md | Status |
|------|--------------|--------|
| Phase 1 | 01-LEARNINGS.md | Complete |
| Phase 2 | 02-LEARNINGS.md | Pending |
| Phase 3 | 03-LEARNINGS.md | Pending |
| Phase 4 | 04-LEARNINGS.md | Complete |
| Phase 5 | 05-LEARNINGS.md | Complete |
| Phase 6 | 06-LEARNINGS.md | Pending |
| Phase 7 | 07-LEARNINGS.md | Pending |
| Phase 8 | 08-LEARNINGS.md | Pending |
| Phase 9 | 09-LEARNINGS.md | Pending |
| Phase 10 | 10-LEARNINGS.md | Pending |

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-29 after completing Phase 5*
