# Requirements: MorfX v4.0 Comportamiento Humano

**Estado:** APROBADO
**Fecha:** 2026-02-23
**Total:** 29 requirements en 8 categorias

## Milestone v4.0 Requirements

### Etapa 1: Delays Inteligentes

- [ ] **DELAY-01**: Mensajes del bot tienen delay proporcional a caracteres (curva 2s-12s) en vez de delay fijo
- [ ] **DELAY-02**: Multiplicador de velocidad configurable por workspace (default 1.0, presets: real/rapido/instantaneo)

### Etapa 2: Clasificacion + Timer Retoma

- [x] **CLASS-01**: Mensajes clasificados post-IntentDetector como RESPONDIBLE, SILENCIOSO, o HANDOFF
- [x] **CLASS-02**: Mensajes SILENCIOSO (ok, jaja, thumbs-up en estados no-confirmatorios) no generan respuesta
- [x] **CLASS-03**: 6 intents HANDOFF (asesor, queja, cancelar, no_gracias, no_interesa, fallback) apagan el bot y notifican host
- [x] **CLASS-04**: Timer de retoma 90s para mensajes SILENCIOSO (redirige a venta si no hay respuesta)

### Etapa 3: Sistema de Bloques

- [ ] **BLOCK-01**: Webhook migrado a evento Inngest con concurrency 1 por conversacion (procesamiento async)
- [x] **BLOCK-02**: Check pre-envio antes de cada plantilla -- si hay nuevo inbound, para la secuencia
- [x] **BLOCK-03**: Plantillas no enviadas se guardan como pendientes con prioridad CORE/COMP/OPC
- [x] **BLOCK-04**: Pendientes se mergean con siguiente bloque por prioridad (max 3 plantillas por bloque)
- [x] **BLOCK-05**: No-repeticion Nivel 1: lookup directo por template ID (gratis, 0ms)
- [x] **BLOCK-06**: No-repeticion Nivel 2: Haiku compara minifrases tematicas (~200ms, ~$0.0003)
- [x] **BLOCK-07**: No-repeticion Nivel 3: agente lee mensaje completo para cobertura parcial (~1-3s)
- [x] **BLOCK-08**: Intents repetidos envian top 2 plantillas por prioridad, parafraseadas por Claude

### Etapa 4: Procesamiento de Medios

- [x] **MEDIA-01**: Audio/voice notes transcritos con Whisper -- 1-2 intents procesados normal, 3+ intents handoff
- [x] **MEDIA-02**: Imagenes y videos -- handoff directo ("Regalame 1 min" + notificar host)
- [x] **MEDIA-03**: Stickers interpretados con Claude Vision -- texto procesable o handoff
- [x] **MEDIA-04**: Reacciones emoji interpretadas como texto -- procesadas o handoff si ambiguas

### Etapa 5: Confidence + Disambiguation

- [x] **CONF-01**: Intents con confidence < 80% -- handoff automatico + log en disambiguation_log
- [x] **CONF-02**: Tabla disambiguation_log registra situacion completa (mensaje, alternativas, contexto, pendientes)
- [x] **CONF-03**: Interfaz para que humano revise y guie (correct_intent, correct_action, guidance_notes)

### Etapa 6: Flujo Ofi Inter

- [ ] **OFINT-01**: Deteccion de intencion ofi inter: cliente dice directamente ("ofi inter", "recojo en inter"), o solo envia municipio sin direccion, o menciona municipio poco comun/lejano
- [ ] **OFINT-02**: Confirmacion obligatoria: cuando se sospecha ofi inter, el agente SIEMPRE pregunta "Deseas recibir en oficina de Interrapidisimo?" antes de cambiar flujo
- [ ] **OFINT-03**: Datos bifurcados: si ofi inter -- pedir nombre, apellido, telefono, cedula de quien recoge, municipio, departamento, correo (7 campos, sin direccion/barrio, con cedula)
- [ ] **OFINT-04**: Integracion con ingest: cuando solo llega municipio, el sistema acumula datos y luego pregunta si quiere ofi inter o envio normal

### Documentación

- [ ] **DOC-01**: Documentar arquitectura, proceso de creación y patrones de Somnio para que futuros agentes puedan crearse siguiendo una guía paso a paso

### Infraestructura

- [ ] **INFRA-01**: Campo `processed_by_agent` en tabla messages (boolean, para check pre-envio)
- [x] **INFRA-02**: Tabla `disambiguation_log` en Supabase
- [x] **INFRA-03**: Minifrases tematicas definidas manualmente para cada plantilla (~30)

## Contexto Adicional

- **Ofi Inter:** Solo aplica a Interrapidisimo. No hay lista fija de municipios "lejanos" -- es criterio del vendedor (municipio poco conocido). Siempre se confirma antes de asumir ofi inter.
- **Prioridades CORE/COMP/OPC:** Asignadas por plantilla por intent en DISCUSSION.md. CORE nunca se descarta, OPC primero en caer, max 3 por bloque.
- **Intents repetidos:** No mas visit_type='siguientes'. Claude parafrasea top 2 plantillas por prioridad.
- **Diseno completo:** `.planning/standalone/human-behavior/DISCUSSION.md`

## Future Requirements (deferred)

- Encryption de credenciales de portales (actualmente plaintext)
- Make_call Twilio (diferido a fase futura)
- Multi-carrier Ofi Inter (solo Interrapidisimo en v4.0)

## Out of Scope

| Feature | Razon |
|---------|-------|
| IA generativa libre (sin plantillas) | Las plantillas son el core del sistema de venta |
| Multi-idioma en templates | Solo espanol para mercado LATAM |
| Dashboard de analytics de agente | Diferido a milestone posterior |
| A/B testing de plantillas | Complejidad innecesaria en v4.0 |
| Entrenamiento por feedback loop automatico | disambiguation_log es manual por diseno (v4.0) |

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| DELAY-01 | Phase 29 | Complete |
| DELAY-02 | Phase 29 | Complete |
| CLASS-01 | Phase 30 | Complete |
| CLASS-02 | Phase 30 | Complete |
| CLASS-03 | Phase 30 | Complete |
| CLASS-04 | Phase 30 | Complete |
| BLOCK-01 | Phase 29 | Complete |
| BLOCK-02 | Phase 31 | Complete |
| BLOCK-03 | Phase 31 | Complete |
| BLOCK-04 | Phase 31 | Complete |
| BLOCK-05 | Phase 34 | Complete |
| BLOCK-06 | Phase 34 | Complete |
| BLOCK-07 | Phase 34 | Complete |
| BLOCK-08 | Phase 34 | Complete |
| MEDIA-01 | Phase 32 | Complete |
| MEDIA-02 | Phase 32 | Complete |
| MEDIA-03 | Phase 32 | Complete |
| MEDIA-04 | Phase 32 | Complete |
| CONF-01 | Phase 33 | Complete |
| CONF-02 | Phase 33 | Complete |
| CONF-03 | Phase 33 | Complete |
| OFINT-01 | Phase 35 | Pending |
| OFINT-02 | Phase 35 | Pending |
| OFINT-03 | Phase 35 | Pending |
| OFINT-04 | Phase 35 | Pending |
| INFRA-01 | Phase 29 | Complete |
| INFRA-02 | Phase 33 | Complete |
| INFRA-03 | Phase 34 | Complete |
| DOC-01 | Phase 36 | Pending |

**Coverage:** 29/29 requirements mapped. 3 INFRA requirements distributed into their consuming phases. DOC-01 runs in parallel.

---
*Requirements defined: 2026-02-23*
