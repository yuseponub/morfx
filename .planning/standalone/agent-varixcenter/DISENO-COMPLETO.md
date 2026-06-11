# Diseño Completo — Agente Varixcenter

> Motor: Somnio v3 clonado (comprehension → state → gates → guards → sales track → response track),
> patrón `agent-godentist` (código propio, NO compartido).
> Objetivo: agendar VALORACIONES ($100.000) en VarixCenter — centro médico flebológico,
> 1 sede (Cra 34 # 52-125 piso 2, Bucaramanga), 2 doctores (Dr. Ciro Mario Romero, Dra. María Carolina Romero).
> Workspace: `c6621640-ba67-43de-9f05-905f09a6dc8f`. Canales: WhatsApp + Facebook + Instagram (D-02).
> Fuentes: `ANALISIS-CONVERSACIONES.md` (362 convos) + `RESPUESTAS-CUESTIONARIO.md` (cliente, 2026-06-11).

## Decisiones bloqueadas (D-locked)

| # | Decisión |
|---|----------|
| D-01 | Motor v3 clonado, agente nuevo `varixcenter`, cero cambios a agentes existentes (Regla 6) |
| D-02 | Multi-canal día 1: WA + FB + IG vía routing rules con fact `channel` (un solo agente, no siblings) |
| D-03 | Agendamiento **Opción A**: slots reales contra **varix-clinic** (Supabase prod). Slot = **20 min**. Agendas de AMBOS doctores fusionadas (cliente no elige doctor) |
| D-04 | El bot CREA el `patient` en varix-clinic (nombre + cédula + teléfono) y la cita tipo valoración estado `programada` |
| D-05 | Datos críticos: `nombre` + `telefono` + `cedula`. Triage conversacional: `ciudad` + `tipo_venas` |
| D-06 | Precios que da el bot: valoración $100.000, sesión escleroterapia $95.000. ECOR/cirugía endovascular: "se determina en la valoración" (NO dar rango) |
| D-07 | Handoff a humano: paciente antiguo/control, reagendar, cancelar, queja, asesor |
| D-08 | Recordatorio 1 día antes: NO es del bot (sigue manual con el equipo) |
| D-09 | Bot 24/7. Festivos/domingo: el bot conversa pero solo ofrece slots en horarios hábiles |
| D-10 | Tag `VAL` al completar datos críticos (mismo patrón GoDentist; side-effect en runner) |
| D-11 | Financiación Addi/Sistecrédito: template OPCIONAL (se ofrece como extra, no en el pitch core) |
| D-12 | Saludo estilo GoDentist con doble triage (ciudad + tipo venas). 5 opciones en PLANTILLAS.md — cliente escoge 1 |
| D-13 | Notas de voz: pedir texto 1 vez, si insiste → handoff. Fotos de piernas: template `no_diagnostico` (nunca pre-diagnosticar) |
| D-14 | EPS/prepagadas: "totalmente particular" + puente a financiación |
| D-15 | Foráneos: pueden agendar ("muchos pacientes viajan") — template dedicado, no se bloquea el flujo |

---

## 1. Intenciones (Intents)

### Informacionales (12)

| Intent | Frecuencia | Ejemplo |
|--------|-----------|---------|
| `saludo` | 38% | "Hola buenas tardes" |
| `precio_tratamiento` | ~47% (1er msg) | "¿Precio?" / "¿Cuánto cuesta el tratamiento?" |
| `precio_valoracion` | ~15% | "¿Cuánto vale la consulta?" |
| `info_tratamiento` | 18% | "¿Duele? ¿Cuántas sesiones? ¿Vuelven a salir?" |
| `info_laser` | raro | "¿Manejan láser?" |
| `info_examen_doppler` | 1% | "¿Hacen el Doppler? ¿Me entregan las imágenes?" |
| `info_medias` | raro | "¿Qué medias debo comprar?" |
| `ubicacion` | 11% | "¿Dónde quedan?" |
| `horarios` | 5% | "¿Atienden los sábados?" |
| `financiacion` | 3% | "¿Tienen formas de pago?" |
| `seguros_eps` | 1% | "¿Tienen convenio con Medisanitas?" |
| `sintomas_descripcion` | 10% | Describe su caso / envía fotos de piernas |

### Acciones del cliente (5)

| Intent | Significado |
|--------|------------|
| `quiero_agendar` | "Quiero la cita" / "Cómo agendo" |
| `datos` | Envía nombre, cédula, teléfono, ciudad, tipo de venas |
| `seleccion_horario` | Elige slot o jornada de los mostrados |
| `confirmar` | "Sí, confirmo" |
| `rechazar` | "No gracias" / "Después" |

### Escape (5)

| Intent | Ejemplo | Acción |
|--------|---------|--------|
| `asesor` | "Quiero hablar con alguien" | handoff |
| `reagendamiento` | "Necesito cambiar mi cita" | handoff (D-07) |
| `cancelar_cita` | "Quiero cancelar" | handoff |
| `queja` | "Me hice sesiones y no vi cambios" | handoff |
| `paciente_antiguo` | "Ya me valoré con el Dr." / control / post-tratamiento | handoff (D-07) |

### Otros (2)

`acknowledgment` ("Ok", "Gracias"), `otro`.

**Total: 24 intents.**

---

## 2. Datos a Capturar (Comprehension Schema)

### Campos

| Campo | Crítico | Fase | Ejemplo |
|-------|---------|------|---------|
| `nombre` | Sí | captura | "Soy Paola Méndez" |
| `telefono` | Sí | captura | "3001234567" → normalizar 573XXXXXXXXX |
| `cedula` | Sí (D-04 crea patient) | captura | "1098765432" |
| `ciudad` | Triage (no bloquea) | saludo | "Bucaramanga" / "Cúcuta" |
| `tipo_venas` | Triage (decide template info) | saludo | "vasitos" |
| `fecha_preferida` | Sí (fase 2) | fecha | "El martes" / "Mañana" |
| `preferencia_jornada` | No | fecha | "En la mañana" |
| `horario_seleccionado` | Sí (fase 3) | disponibilidad | Slot 20min de varix-clinic |

### Enums

- `tipo_venas`: `grandes | vasitos | ambas` — mapeos: "arañitas"/"vasculares"/"venitas" → `vasitos`; "vena gruesa/pronunciada/interna" → `grandes`; "las dos"/"de todo" → `ambas`.
- `es_foraneo` (derivado): ciudad fuera del área metro (Bucaramanga, Floridablanca, Girón, Piedecuesta) → activa template `fuera_de_ciudad` como COMP. NO bloquea agendamiento (D-15).

### Clasificación

`category`: `datos | pregunta | mixto | irrelevante` · `sentiment`: `positivo | neutro | negativo` · `idioma`: `es | en | otro` (igual GoDentist).

---

## 3. Fases (Máquina de Estados)

| Fase | Significado | Llega por acción |
|------|------------|-----------------|
| `initial` | Sin interacción significativa | (default) |
| `capturing_data` | Pidiendo nombre/cédula/teléfono | `pedir_datos`, `pedir_datos_parcial` |
| `capturing_fecha` | Datos OK, pidiendo fecha/jornada | `pedir_fecha` |
| `showing_availability` | Mostrando slots varix-clinic | `mostrar_disponibilidad` |
| `confirming` | Resumen completo, esperando "sí" | `mostrar_confirmacion` |
| `appointment_registered` | Cita creada en varix-clinic | `agendar_cita` |
| `closed` | Handoff/rechazo | `handoff`, `no_interesa` |

---

## 4. Gates

| Gate | Condición |
|------|-----------|
| `triageCompleto` | `ciudad` + `tipo_venas` ≠ null |
| `datosCriticos` | `nombre` + `telefono` + `cedula` ≠ null |
| `fechaElegida` | `fecha_preferida` ≠ null |
| `horarioElegido` | `horario_seleccionado` ≠ null |
| `datosCompletos` | críticos + fecha + horario |

---

## 5. Acciones (TipoAccion) — 14, idénticas a GoDentist

`pedir_datos`, `pedir_datos_parcial`, `pedir_fecha`, `mostrar_disponibilidad`,
`mostrar_confirmacion`, `agendar_cita`, `invitar_agendar`, `handoff`, `silence`,
`no_interesa`, `retoma_datos`, `retoma_fecha`, `retoma_horario`, `retoma_confirmacion`.

Diferencia única: `agendar_cita` ejecuta contra **varix-clinic** (crear patient si no existe +
crear appointment) en vez de notificar al equipo como hacía GoDentist pre-Dentos.

---

## 6. Timers (D — "parecidas a GoDentist")

| Level | Duración | Contexto |
|-------|----------|----------|
| L1 | 3 min | Esperando datos (nombre/cédula/teléfono) |
| L2 | 2 min | Respondió info, invitar a agendar |
| L3 | 2 min | Esperando fecha/jornada |
| L4 | 2 min | Esperando selección de slot |
| L5 | 3 min | Esperando confirmación |
| L6 | 90 seg | Ack / silencio |

Un solo intento de retoma por fase. Si no responde, se acabó.

---

## 7. Tabla de Transiciones

### Desde `initial`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 1 | `saludo` | — | `silence` (response track manda saludo+triage) | — |
| 2 | `quiero_agendar` | `!datosCriticos` | `pedir_datos` | L1 |
| 3 | `quiero_agendar` | `datosCriticos` + `!fechaElegida` | `pedir_fecha` | L3 |
| 4 | `quiero_agendar` | `datosCriticos` + `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 5 | `datos` | `!datosCriticos` | `pedir_datos_parcial`* | L1 |
| 6 | `datos` | `datosCriticos` + `!fechaElegida` | `pedir_fecha` | L3 |
| 7 | `datos` | `datosCriticos` + `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 8 | (info intents) | — | `silence` (response track responde) | L2 |
| 9 | `sintomas_descripcion` | — | `silence` (template no_diagnostico) | L2 |
| 10 | `otro` (conf < 80) | — | `handoff` | cancel |
| 11 | `timer_expired:L2` | — | `invitar_agendar` | — |

\* Matiz clave vs GoDentist: si el cliente solo respondió el triage (ciudad+tipo_venas) tras el
saludo, eso NO es `pedir_datos_parcial` — el response track manda el template informativo del
tipo (`info_vasitos`/`info_grandes`) y el timer L2 invita a agendar. La captura de datos
formales empieza cuando hay señal de agendamiento (`quiero_agendar` o datos personales).

### Desde `capturing_data`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 12 | `datos` | `!datosCriticos` | `pedir_datos_parcial` | L1 |
| 13 | `datos` | `datosCriticos` + `!fechaElegida` | `pedir_fecha` | L3 |
| 14 | `datos` | `datosCriticos` + `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 15 | `auto:datos_criticos` | `!fechaElegida` | `pedir_fecha` | L3 |
| 16 | `auto:datos_criticos` | `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 17 | (info intents) | — | `silence` | reevaluate |
| 18 | `acknowledgment` | — | `silence` | L6 |
| 19 | `timer_expired:L1` | — | `retoma_datos` | — |

### Desde `capturing_fecha`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 20 | `datos` | `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 21 | `datos` | `!fechaElegida` | `silence` | reevaluate |
| 22 | (info intents) | — | `silence` | reevaluate |
| 23 | `acknowledgment` | — | `silence` | L6 |
| 24 | `timer_expired:L3` | — | `retoma_fecha` | — |

### Desde `showing_availability`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 25 | `seleccion_horario` | — | `mostrar_confirmacion` | L5 |
| 26 | `datos` | nueva fecha | `mostrar_disponibilidad` | L4 |
| 27 | (info intents) | — | `silence` | reevaluate |
| 28 | `timer_expired:L4` | — | `retoma_horario` | — |

### Desde `confirming`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 29 | `confirmar` | `datosCompletos` | `agendar_cita` | cancel |
| 30 | `rechazar` | — | `no_interesa` | cancel |
| 31 | `datos` | corrección | `mostrar_confirmacion` | L5 |
| 32 | (info intents) | — | `silence` | reevaluate |
| 33 | `timer_expired:L5` | — | `retoma_confirmacion` | — |

### Desde `appointment_registered`

| # | On | Acción |
|---|-----|--------|
| 34 | `reagendamiento` / `cancelar_cita` | `handoff` |
| 35 | (info intents) | `silence` (responde normal) |
| 36 | `*` | `silence` |

### Escape (cualquier fase)

| # | On | Acción |
|---|----|--------|
| 37 | `asesor` | `handoff` |
| 38 | `queja` | `handoff` |
| 39 | `reagendamiento` | `handoff` |
| 40 | `cancelar_cita` | `handoff` |
| 41 | `paciente_antiguo` | `handoff` (template propio) |
| 42 | `rechazar` (fuera de confirming) | `no_interesa` |

---

## 8. Integración varix-clinic (nuevo vs GoDentist)

GoDentist consulta Dentos vía robot Railway (scraping). Acá controlamos el software → integración
directa (research-phase decide mecanismo exacto: API route en varix-clinic vs query directa al
Supabase de varix-clinic desde un domain module en MorfX).

**Contrato funcional:**

- `getAvailability(fecha)` → slots de 20 min (D-03) dentro de horarios hábiles:
  L-V 8:00–11:30 + 14:30–15:30, sáb 8:00–12:00. Excluye domingos y festivos Colombia (D-09).
  Fusiona agendas de ambos doctores (`doctors_view`); un slot está libre si AL MENOS un doctor
  está libre (constraint anti-solapamiento de `appointments` es por doctor).
- `bookAppointment({ nombre, cedula, telefono, slot })` →
  1. Busca patient por cédula; si no existe lo crea (D-04).
  2. Crea `appointment` (tipo valoración, estado `programada`, doctor = el que tenga el slot
     libre; si ambos libres, balancear).
  3. Si el INSERT choca con el constraint de solapamiento (otro agendó en paralelo) → re-consultar
     y ofrecer slots frescos (mismo patrón `sin_disponibilidad`).
- Reglas de negocio de varix-clinic (máx 2 ECOR/día, etc.) NO aplican: el bot solo agenda
  valoraciones.

**Side-effects al agendar:** tag `VAL` en MorfX (D-10) + datos en contacto CRM.

---

## 9. Flujo Flexible

Regla principal: **responder la pregunta PRIMERO, vender después** (igual GoDentist).

- Intent informacional → CORE (+COMP si aplica) → timer L2 → `invitar_agendar`.
- `precio_tratamiento` sin `tipo_venas` → response track manda template `triage` (pregunta
  grandes/vasitos + ciudad). Con `tipo_venas` → `info_vasitos` o `info_grandes` (incluyen precios D-06).
- `es_foraneo` → se agrega `fuera_de_ciudad` como COMP (no bloquea — D-15).
- Pregunta durante captura → responde CORE, NO repite pedido de datos, timer reevaluate.
- Mixto ("Soy Paola, CC 109..., ¿cuánto vale?") → merge datos + responde precio + retoma pide solo lo faltante.
- Máx 3 mensajes por turno.

---

## 10. Casos Especiales

| Caso | Manejo |
|------|--------|
| Inglés | `idioma:'en'` → `english_response`; si insiste → handoff |
| Notas de voz | 1ª vez → template `pedir_texto`; si insiste → handoff (D-13) |
| Fotos de piernas | template `no_diagnostico` + invitar a valoración (D-13) |
| Preguntas médicas (alergias/diabetes/embarazo) | template `preguntas_medicas` ("lo determina el Dr. en la valoración") + invitar; si insiste → handoff |
| Paciente antiguo / control / post-tratamiento | handoff con template propio (D-07) |
| Foráneo | template `fuera_de_ciudad`, puede agendar (D-15) |
| Tercero ("para mi mamá") | flujo normal — los datos capturados son del PACIENTE |
| Láser | template `info_laser` (no láser de vasitos; sí endovascular, se evalúa en valoración) |
| Doppler impreso | template `info_examen_doppler` (cita aparte de la valoración) — el bot agenda solo valoraciones; si pide cita de Doppler → handoff |
| Cliente ya agendado | responde info normal, no re-vende |

---

## 11. Flujo Visual

```
"¿Precio?" → triage (ciudad + ¿grandes o vasitos?) → info_{tipo} (con precios) → L2 → invitar_agendar
                                                                                          │
"Quiero agendar" ──→ pedir_datos (nombre, cédula, teléfono) ──→ L1 (3min) → retoma_datos
                            │
                     datos OK ──→ pedir_fecha (+jornada) ──→ L3 (2min) → retoma_fecha
                                      │
                              fecha OK ──→ [varix-clinic availability] ──→ mostrar_disponibilidad ──→ L4 → retoma_horario
                                                                                  │
                                                                        elige slot ──→ confirmar_cita ──→ L5 → retoma_confirmacion
                                                                                              │
                                                                  "Sí" ──→ agendar_cita [patient+appointment en varix-clinic] ✅
```

---

## 12. Resumen de Plantillas (ver PLANTILLAS.md)

| Categoría | Cantidad |
|-----------|----------|
| Saludo (5 opciones → queda 1) | 1 |
| Triage | 1 |
| Info por tipo (vasitos/grandes/ambas, CORE+COMP) | 6 |
| Precios / informacionales | 12 |
| Flujo agendamiento | 9 |
| Escape / control / especiales | 9 |
| Follow-ups (retomas) | 5 |
| Inglés | 1 |
| **TOTAL** | **~44** |
