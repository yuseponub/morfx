# Standalone: Envía Status Polling - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Project Boundary

Polling automático de estados de guías Envía Colvanes vía API REST pública. Consulta periódica del estado de guías activas, almacena historial de cambios por orden, muestra tracking en UI de la orden, y prepara (apagado) mover pedidos entre etapas del pipeline cuando cambia el estado.

**NO incluye:** Automatizaciones sobre cambios de estado (notificar cliente, etc.) -- eso viene después de 2-3 días de observación. NO incluye otros carriers (Inter, Coordinadora) -- solo Envía por ahora, extensible después.

</domain>

<decisions>
## Implementation Decisions

### API de Envía (investigación completada)
- Endpoint confirmado y funcional: `GET https://hub.envia.co/ServicioRestConsultaEstados/Service1Consulta.svc/ConsultaEstadoGuia/{guia}`
- Sin autenticación requerida -- endpoint público
- Respuesta JSON completa: estado, cod_estadog, timeline completo (recoleccion, despacho, bodega destino, reparto, entrega), novedades vigentes con detalle, info del envío
- Config de todos los endpoints disponible en `https://envia.co/lib/conf.json`
- Limitación: API solo devuelve novedades vigentes (mca_estado: "VI"), no historial completo de novedades resueltas -- aceptable porque el historial se construye en MorfX con cada polling
- Probado con 27 guías reales -- 100% funcional

### Frecuencia y disparo
- Solo cron automático (sin comando manual)
- Cada 2 horas, de 5am a 7pm hora Colombia (UTC-5)
- 7 días/semana incluyendo domingos (carriers pueden actualizar guías en fin de semana)
- IMPORTANTE: Inngest cron usa UTC. 5am COL = 10:00 UTC, 7pm COL = 00:00 UTC. Cron expression debe ser en UTC.
- Guías en estado terminal (entregada/devuelta) se dejan de consultar inmediatamente

### Almacenamiento de estados
- Nueva tabla `order_carrier_events` (relacional, no JSON en orders)
- Campos: order_id, guia, carrier, estado, cod_estado, novedades (jsonb array), raw_response (jsonb completo), created_at
- Solo se inserta un evento cuando el estado CAMBIA respecto al anterior (no en cada polling si no hay cambio)
- No se actualiza campo de estado en orders -- los stages del pipeline representan el estado actual

### Qué pasa cuando cambia un estado
- Guardar evento en `order_carrier_events`
- Agregar entrada en historial/notas de la orden (visible en UI)
- Mover pedido a etapa correspondiente del pipeline -- CON FEATURE FLAG, apagado por defecto
- Feature flag: `ENVIA_AUTO_STAGE_MOVE=false` -- se prende después de 2-3 días de observación

### Visibilidad
- Sección de tracking visible dentro de cada pedido en la UI
- Muestra historial de cambios de estado con timestamps

### Scope de guías a consultar
- Solo Envía por ahora (carrier='envia' o transportadora='ENVIA')
- Guías en etapas específicas del pipeline (configurables via carrier_configs, mismo patrón existente)
- Necesita nuevo campo en carrier_configs: `status_polling_pipeline_id` + `status_polling_stage_ids` (array de etapas a monitorear)
- Extensible a otros carriers después (Inter, Coordinadora -- investigar si tienen API o requieren Playwright)

### Claude's Discretion
- Estructura exacta de la UI de tracking en la orden
- Estrategia de retry si una guía falla en el polling (timeout, error de red)
- Formato exacto de la nota/historial cuando cambia un estado
- Mapeo cod_estadog → etapa del pipeline (para cuando se active el feature flag)

</decisions>

<specifics>
## Specific Ideas

- El objetivo de los primeros 2-3 días es OBSERVAR: entender todos los códigos de estado posibles, frecuencia de cambios, patrones de novedades
- Después de observar, decidir: qué automatizaciones disparar, cómo mapear estados a etapas, cuándo notificar clientes
- La API no necesita Playwright -- es un simple HTTP GET que devuelve JSON. Esto corre directo en Vercel/Inngest sin microservicio separado
- Códigos de estado conocidos hasta ahora: 1 (generada), 4 (despachada), 5 (en bodega destino), 8 (en novedad), 16 (espera RX), 18 (espera ruta doméstica) -- faltan más por descubrir (entregada, devuelta, etc.)

</specifics>

<deferred>
## Deferred Ideas

- Polling de estados para Inter (investigar si tiene API)
- Polling de estados para Coordinadora (investigar si tiene API o requiere Playwright)
- Automatizaciones sobre cambios de estado (notificar cliente por WhatsApp, disparar triggers)
- Mapeo automático estado → etapa pipeline (configurar después de observación)
- Dashboard de métricas de entrega (% entregados, tiempos promedio, novedades frecuentes)

</deferred>

---

*Standalone: envia-status-polling*
*Context gathered: 2026-04-10*
