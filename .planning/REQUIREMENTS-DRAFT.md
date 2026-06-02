# Requirements DRAFT: MorfX v4.0 Comportamiento Humano

**Estado:** BORRADOR — Etapa 6 (Ofi Inter) agregada, pendiente aprobación final del usuario
**Fecha:** 2026-02-23

## Requirements propuestos (26 total, pendiente aprobación)

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

### Etapa 6: Flujo Ofi Inter (recogida en oficina Interrapidísimo)

- [ ] **OFINT-01**: Detección de intención ofi inter: cliente dice directamente ("ofi inter", "recojo en inter"), o solo envía municipio sin dirección, o menciona municipio poco común/lejano
- [ ] **OFINT-02**: Confirmación obligatoria: cuando se sospecha ofi inter, el agente SIEMPRE pregunta "¿Deseas recibir en oficina de Interrapidísimo?" antes de cambiar flujo
- [ ] **OFINT-03**: Datos bifurcados: si ofi inter → pedir nombre, apellido, teléfono, cédula de quien recoge, municipio, departamento, correo (7 campos, sin dirección/barrio, con cédula)
- [ ] **OFINT-04**: Integración con ingest: cuando solo llega municipio, el sistema acumula datos y luego pregunta si quiere ofi inter o envío normal

**Contexto:** Solo aplica a Interrapidísimo. No hay lista fija de municipios "lejanos" — es criterio del vendedor (municipio poco conocido). Siempre se confirma antes de asumir ofi inter.

### Infraestructura

- [ ] **INFRA-01**: Campo `processed_by_agent` en tabla messages (boolean, para check pre-envío)
- [ ] **INFRA-02**: Tabla `disambiguation_log` en Supabase
- [ ] **INFRA-03**: Minifrases temáticas definidas manualmente para cada plantilla (~30)

---

## Contexto del proceso

- GSD new-milestone en Phase 8 (DEFINING REQUIREMENTS)
- Research completa: .planning/research/ (STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY)
- Diseño completo: .planning/standalone/human-behavior/DISCUSSION.md
- PROJECT.md y STATE.md ya actualizados para v4.0
- Etapa 6 (Ofi Inter) AGREGADA — 4 requirements nuevos (OFINT-01 a OFINT-04)
- DISCUSSION.md actualizado con Etapa 6 completa
- Falta: aprobación del usuario → crear REQUIREMENTS.md final → spawn roadmapper

## Para retomar después de /compact

Decirle a Claude:
> "Lee `.planning/REQUIREMENTS-DRAFT.md`. Estamos en GSD new-milestone v4.0, paso DEFINING REQUIREMENTS. 26 requirements listos, necesito aprobar o ajustar para continuar con el roadmap."
