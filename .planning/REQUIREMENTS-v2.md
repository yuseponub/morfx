# Requirements: MVP v2.0 — Agente de Ventas

**Defined:** 2026-02-04
**Core Value:** El agente de ventas de Somnio funciona en MorfX con código propio, reemplazando n8n.

## MVP v2 Scope

Replicar el agente de ventas de Somnio (actualmente en n8n) en código TypeScript controlado, integrado con MorfX CRM y WhatsApp.

**Lo que SÍ incluye:**
- Agent Engine genérico (soporta múltiples agentes futuros)
- Agente de Ventas Somnio funcionando
- Sandbox para probar conversaciones
- Integración con WhatsApp existente

**Lo que NO incluye (v2.1+):**
- Canvas visual para configurar agentes
- Robots de logística (Coordinadora, guías)
- Agente de recompra
- Agente de seguimiento logístico
- Configuración de intents por UI

---

## v2 Requirements

### Action DSL Real (ADSL)

Conectar los handlers placeholder del Action DSL con operaciones reales.

- [ ] **ADSL-R01**: Handler `crm.create_contact` crea contacto real en Supabase
- [ ] **ADSL-R02**: Handler `crm.update_contact` actualiza contacto existente
- [ ] **ADSL-R03**: Handler `crm.get_contact` obtiene contacto por ID o teléfono
- [ ] **ADSL-R04**: Handler `crm.create_order` crea pedido real con productos
- [ ] **ADSL-R05**: Handler `crm.update_order` actualiza pedido (stage, datos)
- [ ] **ADSL-R06**: Handler `whatsapp.send_message` envía mensaje vía 360dialog
- [ ] **ADSL-R07**: Handler `whatsapp.send_template` envía template aprobado
- [ ] **ADSL-R08**: API `/api/v1/tools` funciona para invocación externa
- [ ] **ADSL-R09**: Cada ejecución de tool genera log forense completo

### Agent Engine Core (AGEN)

Motor genérico para ejecutar agentes conversacionales.

- [ ] **AGEN-01**: Sistema puede registrar múltiples agentes con configuración distinta
- [ ] **AGEN-02**: Agente tiene system prompt configurable
- [ ] **AGEN-03**: Agente tiene lista de tools disponibles (subset del Action DSL)
- [ ] **AGEN-04**: Agente tiene máquina de estados con transiciones válidas
- [ ] **AGEN-05**: Session manager persiste estado de conversación en Supabase
- [ ] **AGEN-06**: Session tiene versionado para detectar interrupciones
- [ ] **AGEN-07**: Engine usa Claude API para intent detection
- [ ] **AGEN-08**: Engine usa Claude API para response generation
- [ ] **AGEN-09**: Engine soporta streaming de respuestas
- [ ] **AGEN-10**: Engine aplica token budget por conversación
- [ ] **AGEN-11**: Engine registra cada turno en tabla de auditoría

### Agente Ventas Somnio (VTAS)

Implementar el agente de ventas existente en código.

- [ ] **VTAS-01**: Agente detecta 17 intents de Somnio (hola, precio, captura, etc.)
- [ ] **VTAS-02**: Agente extrae 8 campos de datos del cliente
- [ ] **VTAS-03**: Agente valida transiciones (no ofrecer promos sin datos completos)
- [ ] **VTAS-04**: Agente selecciona templates por intent
- [ ] **VTAS-05**: Agente sustituye variables en templates ({{nombre}}, {{precio}})
- [ ] **VTAS-06**: Agente aplica delays entre mensajes (2-6 segundos)
- [ ] **VTAS-07**: Agente detecta interrupciones y aborta secuencia
- [ ] **VTAS-08**: Agente crea contacto en MorfX cuando tiene datos mínimos
- [ ] **VTAS-09**: Agente crea orden en MorfX cuando se confirma compra
- [ ] **VTAS-10**: Agente tiene 3 precios configurados (1x, 2x, 3x)

### Agent Sandbox (SAND)

UI para probar agentes sin afectar WhatsApp real.

- [ ] **SAND-01**: Usuario puede acceder a /sandbox desde navegación
- [ ] **SAND-02**: Usuario puede seleccionar agente a probar
- [ ] **SAND-03**: Usuario puede escribir mensajes como "cliente"
- [ ] **SAND-04**: Sistema muestra respuestas del agente en tiempo real
- [ ] **SAND-05**: Sistema muestra tools ejecutados (transparencia)
- [ ] **SAND-06**: Sistema muestra estado actual de la sesión (JSON viewer)
- [ ] **SAND-07**: Usuario puede resetear sesión para nueva prueba
- [ ] **SAND-08**: Sesiones de prueba se guardan para revisión posterior

### WhatsApp Agent Integration (WINT)

Conectar agentes con el inbox de WhatsApp existente.

- [ ] **WINT-01**: Conversación puede tener agente asignado (además de humano)
- [ ] **WINT-02**: Mensaje entrante puede ser procesado por agente automáticamente
- [ ] **WINT-03**: Agente puede ser habilitado/deshabilitado por conversación
- [ ] **WINT-04**: Sistema soporta handoff de agente a humano
- [ ] **WINT-05**: Sistema soporta handoff de humano a agente
- [ ] **WINT-06**: Manager puede ver conversaciones atendidas por agente
- [ ] **WINT-07**: Sistema registra métricas de conversaciones automatizadas

---

## v2.1 Requirements (Post-MVP v2)

### Agentes Adicionales

- **RECOM**: Agente de recompra para clientes existentes
- **SEGUI**: Agente de seguimiento logístico ("¿dónde está mi pedido?")

### Robots de Logística

- **LOGIS**: Integrar robots de guías como tools del Action DSL

### Canvas Visual

- **CANVS**: UI visual para configurar flujos de agentes

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Canvas visual para configurar agentes | Diferido a v2.1+ cuando bots más avanzados |
| Robots de logística (Coordinadora, guías) | Diferido, se mantienen en n8n por ahora |
| Multi-producto (no solo Somnio) | Diferido, empezar con caso conocido |
| Configuración de intents por UI | Empezar con código, UI después |
| A/B testing de templates | Diferido |
| Agente de recompra | v2.1 |
| Agente de seguimiento | v2.1 |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADSL-R01 | Phase 12 | Pending |
| ADSL-R02 | Phase 12 | Pending |
| ADSL-R03 | Phase 12 | Pending |
| ADSL-R04 | Phase 12 | Pending |
| ADSL-R05 | Phase 12 | Pending |
| ADSL-R06 | Phase 12 | Pending |
| ADSL-R07 | Phase 12 | Pending |
| ADSL-R08 | Phase 12 | Pending |
| ADSL-R09 | Phase 12 | Pending |
| AGEN-01 | Phase 13 | Pending |
| AGEN-02 | Phase 13 | Pending |
| AGEN-03 | Phase 13 | Pending |
| AGEN-04 | Phase 13 | Pending |
| AGEN-05 | Phase 13 | Pending |
| AGEN-06 | Phase 13 | Pending |
| AGEN-07 | Phase 13 | Pending |
| AGEN-08 | Phase 13 | Pending |
| AGEN-09 | Phase 13 | Pending |
| AGEN-10 | Phase 13 | Pending |
| AGEN-11 | Phase 13 | Pending |
| VTAS-01 | Phase 14 | Pending |
| VTAS-02 | Phase 14 | Pending |
| VTAS-03 | Phase 14 | Pending |
| VTAS-04 | Phase 14 | Pending |
| VTAS-05 | Phase 14 | Pending |
| VTAS-06 | Phase 14 | Pending |
| VTAS-07 | Phase 14 | Pending |
| VTAS-08 | Phase 14 | Pending |
| VTAS-09 | Phase 14 | Pending |
| VTAS-10 | Phase 14 | Pending |
| SAND-01 | Phase 15 | Pending |
| SAND-02 | Phase 15 | Pending |
| SAND-03 | Phase 15 | Pending |
| SAND-04 | Phase 15 | Pending |
| SAND-05 | Phase 15 | Pending |
| SAND-06 | Phase 15 | Pending |
| SAND-07 | Phase 15 | Pending |
| SAND-08 | Phase 15 | Pending |
| WINT-01 | Phase 16 | Pending |
| WINT-02 | Phase 16 | Pending |
| WINT-03 | Phase 16 | Pending |
| WINT-04 | Phase 16 | Pending |
| WINT-05 | Phase 16 | Pending |
| WINT-06 | Phase 16 | Pending |
| WINT-07 | Phase 16 | Pending |

**Coverage:**
- v2 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0 ✓

---

*Requirements defined: 2026-02-04*
*Based on agent audit of AGENTES-IA-FUNCIONALES-v3*
