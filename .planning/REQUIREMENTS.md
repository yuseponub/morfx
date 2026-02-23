# Requirements: MorfX v4.0 Comportamiento Humano

**Estado:** APROBADO
**Fecha:** 2026-02-23
**Total:** 26 requirements en 7 categorías

## Milestone v4.0 Requirements

### Etapa 1: Delays Inteligentes

- [ ] **DELAY-01**: Mensajes del bot tienen delay proporcional a caracteres (curva 2s-12s) en vez de delay fijo
- [ ] **DELAY-02**: Multiplicador de velocidad configurable por workspace (default 1.0, presets: real/rápido/instantáneo)

### Etapa 2: Clasificación + Timer Retoma

- [ ] **CLASS-01**: Mensajes clasificados post-IntentDetector como RESPONDIBLE, SILENCIOSO, o HANDOFF
- [ ] **CLASS-02**: Mensajes SILENCIOSO (ok, jaja, 👍 en estados no-confirmatorios) no generan respuesta
- [ ] **CLASS-03**: 6 intents HANDOFF (asesor, queja, cancelar, no_gracias, no_interesa, fallback) apagan el bot y notifican host
- [ ] **CLASS-04**: Timer de retoma 90s para mensajes SILENCIOSO (redirige a venta si no hay respuesta)

### Etapa 3: Sistema de Bloques

- [ ] **BLOCK-01**: Webhook migrado a evento Inngest con concurrency 1 por conversación (procesamiento async)
- [ ] **BLOCK-02**: Check pre-envío antes de cada plantilla — si hay nuevo inbound, para la secuencia
- [ ] **BLOCK-03**: Plantillas no enviadas se guardan como pendientes con prioridad CORE/COMP/OPC
- [ ] **BLOCK-04**: Pendientes se mergean con siguiente bloque por prioridad (máx 3 plantillas por bloque)
- [ ] **BLOCK-05**: No-repetición Nivel 1: lookup directo por template ID (gratis, 0ms)
- [ ] **BLOCK-06**: No-repetición Nivel 2: Haiku compara minifrases temáticas (~200ms, ~$0.0003)
- [ ] **BLOCK-07**: No-repetición Nivel 3: agente lee mensaje completo para cobertura parcial (~1-3s)
- [ ] **BLOCK-08**: Intents repetidos envían top 2 plantillas por prioridad, parafraseadas por Claude

### Etapa 4: Procesamiento de Medios

- [ ] **MEDIA-01**: Audio/voice notes transcritos con Whisper → 1-2 intents procesados normal, 3+ intents → handoff
- [ ] **MEDIA-02**: Imágenes y videos → handoff directo ("Regálame 1 min" + notificar host)
- [ ] **MEDIA-03**: Stickers interpretados con Claude Vision → texto procesable o handoff
- [ ] **MEDIA-04**: Reacciones emoji interpretadas como texto → procesadas o handoff si ambiguas

### Etapa 5: Confidence + Disambiguation

- [ ] **CONF-01**: Intents con confidence < 80% → handoff automático + log en disambiguation_log
- [ ] **CONF-02**: Tabla disambiguation_log registra situación completa (mensaje, alternativas, contexto, pendientes)
- [ ] **CONF-03**: Interfaz para que humano revise y guíe (correct_intent, correct_action, guidance_notes)

### Etapa 6: Flujo Ofi Inter

- [ ] **OFINT-01**: Detección de intención ofi inter: cliente dice directamente ("ofi inter", "recojo en inter"), o solo envía municipio sin dirección, o menciona municipio poco común/lejano
- [ ] **OFINT-02**: Confirmación obligatoria: cuando se sospecha ofi inter, el agente SIEMPRE pregunta "¿Deseas recibir en oficina de Interrapidísimo?" antes de cambiar flujo
- [ ] **OFINT-03**: Datos bifurcados: si ofi inter → pedir nombre, apellido, teléfono, cédula de quien recoge, municipio, departamento, correo (7 campos, sin dirección/barrio, con cédula)
- [ ] **OFINT-04**: Integración con ingest: cuando solo llega municipio, el sistema acumula datos y luego pregunta si quiere ofi inter o envío normal

### Infraestructura

- [ ] **INFRA-01**: Campo `processed_by_agent` en tabla messages (boolean, para check pre-envío)
- [ ] **INFRA-02**: Tabla `disambiguation_log` en Supabase
- [ ] **INFRA-03**: Minifrases temáticas definidas manualmente para cada plantilla (~30)

## Contexto Adicional

- **Ofi Inter:** Solo aplica a Interrapidísimo. No hay lista fija de municipios "lejanos" — es criterio del vendedor (municipio poco conocido). Siempre se confirma antes de asumir ofi inter.
- **Prioridades CORE/COMP/OPC:** Asignadas por plantilla por intent en DISCUSSION.md. CORE nunca se descarta, OPC primero en caer, máx 3 por bloque.
- **Intents repetidos:** No más visit_type='siguientes'. Claude parafrasea top 2 plantillas por prioridad.
- **Diseño completo:** `.planning/standalone/human-behavior/DISCUSSION.md`

## Future Requirements (deferred)

- Encryption de credenciales de portales (actualmente plaintext)
- Make_call Twilio (diferido a fase futura)
- Multi-carrier Ofi Inter (solo Interrapidísimo en v4.0)

## Out of Scope

| Feature | Razón |
|---------|-------|
| IA generativa libre (sin plantillas) | Las plantillas son el core del sistema de venta |
| Multi-idioma en templates | Solo español para mercado LATAM |
| Dashboard de analytics de agente | Diferido a milestone posterior |
| A/B testing de plantillas | Complejidad innecesaria en v4.0 |
| Entrenamiento por feedback loop automático | disambiguation_log es manual por diseño (v4.0) |

## Traceability

*Filled by roadmapper — maps REQ-IDs to phases*

| REQ-ID | Phase |
|--------|-------|
| — | — |

---
*Requirements defined: 2026-02-23*
