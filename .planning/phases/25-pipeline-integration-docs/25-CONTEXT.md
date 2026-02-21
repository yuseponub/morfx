# Phase 25: Pipeline Integration + Docs - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

UI sencilla en settings para vincular etapas del pipeline a robots, documentación de arquitectura para onboarding de nuevos carriers, y verificación E2E del flujo completo de logística.

El dispatch ya funciona por comandos (F24). Esta fase agrega la configuración visual y cierra v3.0 con docs.

</domain>

<decisions>
## Implementation Decisions

### UI de vinculación etapa → robot
- Lista simple de vínculos: Etapa → Robot
- Dropdown para elegir etapa del pipeline, dropdown para elegir robot disponible
- Botón agregar/quitar vínculo
- Ubicación: nueva sección "Logística" en settings
- Carriers futuros aparecen como placeholders deshabilitados ("Próximamente")
- Toggle on/off para activar/desactivar el vínculo sin borrarlo

### Flujo de activación
- El robot se activa por **comando manual** en Chat de Comandos, NO automáticamente al mover órdenes
- El comando lee TODAS las órdenes de la etapa vinculada y las procesa
- La config de dispatch stage ya existe en DB (F24-01: `dispatch_pipeline_id` + `dispatch_stage_id` en `carrier_configs`)
- Esta fase agrega la UI para gestionar esa config

### Documentación
- Arquitectura del patrón robot service (comunicación, callbacks, Inngest)
- Guía paso a paso para agregar un nuevo carrier
- Audiencia: futuro desarrollo (Claude + dev humano)

### Claude's Discretion
- Formato y profundidad exacta de la documentación
- Diseño visual de la sección de logística en settings
- Estrategia de E2E testing

</decisions>

<specifics>
## Specific Ideas

- "Solo una sección donde se pueda unir etapa a robot correspondiente"
- El concepto es: X etapa → X robot puede trabajar sobre estas órdenes
- Credenciales del portal ya están en carrier_configs (F21), no duplicar

</specifics>

<deferred>
## Deferred Ideas

- **Robot lector de guías Coordinadora** — Lee del portal Coord, extrae # guía, actualiza órdenes en CRM → Fase 26
- **Robot OCR de guías** — Lee guías PDF/físicas, verifica datos correctos, extrae # guía → CRM → Fase 27
- **Robot creador de guías PDF** — Genera PDFs de guías desde órdenes del CRM (ya existe en GitHub, integrar) → Fase 28

</deferred>

---

*Phase: 25-pipeline-integration-docs*
*Context gathered: 2026-02-21*
