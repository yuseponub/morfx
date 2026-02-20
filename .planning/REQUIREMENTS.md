# Requirements: MorfX v3.0 Logística

**Defined:** 2026-02-20
**Core Value:** Operaciones puede despachar pedidos via robots de logística desde MorfX, eliminando la dependencia de Slack + N8N.

## v3.0 Requirements

### Infraestructura de Datos

- [ ] **DATA-01**: Sistema carga tabla de municipios DANE (1,122 municipios con códigos de 5 dígitos, departamentos, nombres alternativos)
- [ ] **DATA-02**: Tabla de cobertura por transportadora vinculada a municipios DANE (Coordinadora: 1,488 ciudades + 1,181 COD)
- [ ] **DATA-03**: Configuración de carrier por workspace (credenciales del portal, dirección de recogida, carrier default)
- [ ] **DATA-04**: Tablas de tracking de ejecuciones del robot (robot_jobs + robot_job_items con estado por orden)

### Robot Coordinadora

- [ ] **ROBOT-01**: Microservicio Express + Playwright en Docker desplegado en Railway, con endpoints para crear pedidos en ff.coordinadora.com
- [ ] **ROBOT-02**: Validación de ciudades contra tabla de cobertura Coordinadora antes de enviar al robot
- [ ] **ROBOT-03**: Creación batch de pedidos con tracking individual por orden (status, guía, error por pedido)
- [ ] **ROBOT-04**: Persistencia de cookies/sesión para evitar re-login en cada batch (storageState API)
- [ ] **ROBOT-05**: Protección anti-duplicados: lock por workspace (1 batch a la vez), lock por pedido (skip si processing), idempotencia por batch ID

### Chat de Comandos

- [ ] **CHAT-01**: Panel tipo terminal con monospace font, dark background, input de texto, overflow-y-auto
- [ ] **CHAT-02**: Comandos fijos parseados: `subir ordenes coord`, `validar ciudades`, `estado`, `ayuda`
- [ ] **CHAT-03**: Progreso real-time via Supabase Realtime mostrando estado por orden procesada
- [ ] **CHAT-04**: Historial de jobs pasados con resultados, éxitos, errores y timestamps

### Integración Pipeline

- [ ] **PIPE-01**: Etapas del pipeline configurables por robot (mapear qué etapa activa qué robot)
- [ ] **PIPE-02**: Inngest orchestrator que conecta MorfX con robot service (evento → HTTP → resultado)
- [ ] **PIPE-03**: Callback API que recibe resultados del robot y actualiza pedidos via domain layer (triggers de automatización se disparan)

### Documentación

- [ ] **DOC-01**: Documentar arquitectura y patrones para robots futuros (Inter, Envia, Bogota) sin implementar código

## Future Requirements (v4.0+)

### Robots Adicionales
- **FROBOT-01**: Robot Interrapidísimo — PDF shipping labels via PDFKit
- **FROBOT-02**: Robot Envia — Excel bulk upload generation via ExcelJS
- **FROBOT-03**: Robot Bogotá — Carrier local, proceso simplificado
- **FROBOT-04**: OCR de guías — Claude Vision para leer fotos de guías físicas y matchear contra pedidos

### Features Avanzados
- **FADV-01**: AI-powered command parsing (lenguaje natural → intent + parámetros)
- **FADV-02**: Carrier-aware city autocomplete en formulario de pedidos
- **FADV-03**: Dashboard de rendimiento por transportadora (tasa éxito, tiempo promedio)
- **FADV-04**: Workflow de entregas fallidas (novedad → WhatsApp automático + tarea)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Carrier API integration | APIs colombianas son inestables o no existen. Playwright es battle-tested |
| Real-time carrier tracking | APIs de tracking son unreliable. Guardar guía y link al portal del carrier |
| Multi-carrier rate shopping | Tablas de tarifas cambian mensualmente. Equipo ya sabe costos por experiencia |
| Warehouse management (WMS) | Operación COD despacha desde bodegas pequeñas. WMS no agrega valor |
| Custom shipping label designer | Carriers usan sus propias etiquetas estándar |
| Autonomous robot scheduling | Peligroso sin supervisión humana. Siempre requiere trigger manual |
| Returns management module | Devoluciones COD son raras. Se manejan con etapa "Devuelto" + automatización |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 21 | Pending |
| DATA-02 | Phase 21 | Pending |
| DATA-03 | Phase 21 | Pending |
| DATA-04 | Phase 21 | Pending |
| ROBOT-01 | Phase 22 | Pending |
| ROBOT-02 | Phase 22 | Pending |
| ROBOT-03 | Phase 22 | Pending |
| ROBOT-04 | Phase 22 | Pending |
| ROBOT-05 | Phase 22 | Pending |
| CHAT-01 | Phase 24 | Pending |
| CHAT-02 | Phase 24 | Pending |
| CHAT-03 | Phase 24 | Pending |
| CHAT-04 | Phase 24 | Pending |
| PIPE-01 | Phase 25 | Pending |
| PIPE-02 | Phase 23 | Pending |
| PIPE-03 | Phase 23 | Pending |
| DOC-01 | Phase 25 | Pending |

**Coverage:**
- v3.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after initial definition*
