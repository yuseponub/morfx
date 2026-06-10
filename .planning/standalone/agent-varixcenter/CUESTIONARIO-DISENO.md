# Cuestionario de Diseño — Agente Varixcenter

> Motor propuesto: Somnio v3 (comprehension → state → gates → guards → sales track → response track),
> mismo patrón que `agent-godentist` (clonado, NO compartido).
> Cada sección trae una **propuesta pre-llenada** basada en el análisis de 362 conversaciones
> reales (`ANALISIS-CONVERSACIONES.md`). Marca ✅ si la propuesta queda, o corrige en la línea
> `RESPUESTA:`. Las preguntas marcadas 🔴 son BLOQUEANTES (sin ellas no se puede planificar).

---

## A. Datos del negocio (verificar vigencia)

**A1. Precios** — los vimos en conversaciones de abr-jun 2026, ¿siguen vigentes?

| Concepto | Visto en conversaciones | ¿Vigente? / Corrección |
|----------|------------------------|------------------------|
| Consulta de valoración | $100.000 (incluye escaneo venoso) | RESPUESTA: |
| Sesión escleroterapia (vasitos) | $95.000 | RESPUESTA: |
| Cita de control | $110.000 + traer medias largas | RESPUESTA: |
| Dúplex/Doppler | $180.000 una pierna / $260.000 dos | RESPUESTA: |
| Medias compresión 20/30 | muslo $175.000 / panty $190.000 | RESPUESTA: |

**A2.** 🔴 ¿El bot puede DAR PRECIOS por chat, o alguno se reserva ("depende del diagnóstico")?
El humano hoy da precio de consulta/sesión pero NUNCA precio de tratamiento completo.
RESPUESTA:

**A3.** Horarios de citas: L-V 8:00–11:30am y 2:30–3:30pm; sábados 8:00am–12:00pm. ¿Correcto?
RESPUESTA:

**A4.** Dirección única: Cra 34 # 52-125, segundo piso, Bucaramanga. ¿Hay otra sede o planes de abrir?
RESPUESTA:

**A5.** ¿Wording oficial del médico? (en chats: "el Dr.", "Dr. Ciro", "médico flebólogo",
"28 años de experiencia" — también vimos "30 años"). ¿Cómo debe presentarlo el bot?
RESPUESTA:

**A6.** Financiación Addi/Sistecrédito: ¿el bot la menciona PROACTIVAMENTE cuando el cliente
duda por precio, o solo si preguntan? ¿Condiciones actuales (documento físico + celular, presencial)?
RESPUESTA:

**A7.** EPS/prepagadas: confirmar "somos totalmente particular" como respuesta canónica.
RESPUESTA:

**A8.** Foráneos (10% del tráfico): ¿respuesta oficial? Hoy: "solo atendemos en Bucaramanga"
(sin virtual). ¿Se ofrece algo (agendar para cuando viajen, lista de espera)?
RESPUESTA:

**A9.** ¿Servicios que NO se ofrecen y el bot debe negar explícitamente? (vimos: fleboterapia.
¿Láser endovascular se ofrece o no?)
RESPUESTA:

---

## B. Agendamiento — 🔴 LA PREGUNTA MÁS IMPORTANTE

**B1.** 🔴 ¿Cómo se gestiona la agenda de citas hoy?
- [ ] Software médico con web/API (¿cuál? ¿URL?) → podríamos hacer robot tipo Dentos (GoDentist)
- [ ] Google Calendar / Outlook
- [ ] Agenda física / Excel / solo la secretaria sabe
- [ ] Otro: ____________

RESPUESTA:

**B2.** 🔴 Según B1, ¿qué hace el bot al agendar?
- [ ] **Opción A — slots reales**: el bot consulta disponibilidad real y agenda directo (requiere robot/integración, como GoDentist+Dentos)
- [ ] **Opción B — preferencia + handoff**: el bot captura datos + jornada preferida (AM/PM) y un humano confirma la hora puntual después
- [ ] **Opción C — registro simple**: el bot registra la solicitud como pedido/tarea en el CRM y el equipo llama

RESPUESTA:

**B3.** Datos a capturar para agendar. El humano hoy pide: nombre completo, (a veces) cédula,
jornada AM/PM. Propuesta de campos críticos: `nombre` + `ciudad` + `tipo_venas` + `jornada`.
¿Cédula es obligatoria? ¿Teléfono adicional al del WhatsApp?
RESPUESTA:

**B4.** Recordatorio "un día antes": ¿lo manda el bot automáticamente (timer/cron) o lo sigue
haciendo el equipo?
RESPUESTA:

**B5.** Reagendar/cancelar (4% del tráfico): ¿el bot lo gestiona o handoff a humano?
RESPUESTA:

---

## C. Scope del agente

**C1.** 🔴 Canales: ¿WhatsApp + Facebook + Instagram desde el día 1, o WhatsApp primero?
(El workspace ya recibe FB/IG por Meta Direct. Patrón sibling `godentist-fb-ig` disponible.)
RESPUESTA:

**C2.** 🔴 Pacientes antiguos / citas de control (8.5% del tráfico + outbound de reactivación):
- [ ] V1 solo leads nuevos; paciente antiguo → handoff humano
- [ ] V1 incluye flujo de control ($110k + medias) como segundo track

RESPUESTA:

**C3.** Outbound de reactivación ("la enfermedad venosa crónica requiere manejo…"): ¿se queda
manual/campañas, o el bot responde cuando el paciente contesta? (relacionado con C2)
RESPUESTA:

**C4.** Notas de voz (frecuentes): propuesta = responder "¿me lo puedes escribir? 🙏" una vez,
y si insiste con audio → handoff. ¿OK?
RESPUESTA:

**C5.** Fotos de piernas: propuesta = NUNCA pre-diagnosticar; agradecer + explicar que el Dr.
evalúa en la valoración + invitar a agendar. ¿OK?
RESPUESTA:

**C6.** Preguntas médicas específicas (alergias, diabetes, embarazo, úlceras): propuesta =
respuesta genérica "eso lo determina el Dr. en la valoración" + invitar a agendar; si insiste → handoff. ¿OK?
RESPUESTA:

**C7.** Quejas (1%): propuesta = handoff inmediato a humano con disculpa breve. ¿OK?
RESPUESTA:

**C8.** Horario de actividad del bot: ¿24/7 (la gran oportunidad: hoy se pierden los "¿Precio?"
nocturnos) o solo fuera del horario del equipo?
RESPUESTA:

**C9.** ¿Tono? El humano actual es cálido-informal ("mi reina", emojis ✨💁). GoDentist usa
"goBot 🤖" presentándose como asistente virtual. ¿El bot de Varix se presenta como bot
(con nombre propio) o como asesor genérico?
RESPUESTA:

---

## D. Propuesta de diseño técnico (pre-llenada — revisar y aprobar)

### D1. Intents propuestos (22)

**Informacionales (11):** `saludo`, `precio_consulta` (66% combinado), `precio_tratamiento`,
`info_tratamiento`, `ubicacion`, `horarios`, `formas_pago`, `seguros_eps`, `precio_examen`
(dúplex), `info_medias`, `fuera_de_ciudad`.

**Acciones del cliente (7):** `quiero_agendar`, `datos`, `triage_tipo` (grandes/vasitos —
equivalente funcional a `seleccion_sede` de GoDentist), `ciudad`, `seleccion_horario`,
`confirmar`, `rechazar`.

**Escape (4):** `asesor`, `reagendamiento`, `queja`, `cancelar_cita` (+ `sintomas_descripcion`
→ ¿lo tratamos como informational con template "el Dr. evalúa en valoración"?).

**Otros (2):** `acknowledgment`, `otro`.

CAMBIOS:

### D2. Datos a capturar (comprehension schema)

| Campo | Crítico | Ejemplo |
|-------|---------|---------|
| `nombre` | Sí | "Soy Paola Méndez" |
| `ciudad` | Sí (filtra foráneos) | "Bucaramanga" / "Cúcuta" |
| `tipo_venas` | Sí (enum: `grandes`, `vasitos`, `ambas`) | "vasitos" |
| `cedula` | ? (según B3) | "1098..." |
| `preferencia_jornada` | Sí (fase horario) | "mañana" / "tarde" |
| `fecha_preferida` | según B2 | "el martes" |
| `horario_seleccionado` | según B2 | slot elegido |
| `es_paciente_antiguo` | No (deriva track C2) | "ya me valoré con el Dr." |

CAMBIOS:

### D3. Fases propuestas

`initial` → `capturing_data` (nombre+ciudad+tipo) → `capturing_fecha`/`capturing_jornada` →
`showing_availability` (solo si B2=Opción A) → `confirming` → `appointment_registered` → `closed`.

CAMBIOS:

### D4. Timers de retoma (la palanca del 55% que pregunta precio y se va)

| Level | Duración propuesta | Contexto |
|-------|--------------------|----------|
| L1 | 3 min | Esperando datos (nombre/ciudad/tipo) |
| L2 | 2 min | Respondió info de precio, invitar a agendar |
| L3 | 2 min | Esperando jornada/fecha |
| L4 | 2 min | Esperando selección de horario (si Opción A) |
| L5 | 3 min | Esperando confirmación |
| L6 | 90 seg | Ack/silencio |

Un solo intento de retoma por fase (igual GoDentist). ¿Agregamos retoma "larga" (ej. 24h:
"¿sigues interesad@ en tu valoración?")? Hoy NADIE hace follow-up al 55% que se enfría.
RESPUESTA:

### D5. Catálogo de plantillas

Esqueleto desde las 24 plantillas de facto (sección 7 del análisis): saludo lead-capture
(ciudad + tipo), info vasitos, info grandes, jornada AM/PM, horarios+dirección, foráneo,
financiación, EPS-particular, control antiguo, no-diagnóstico-por-foto, escape/handoff,
retomas L1-L6, confirmación de cita.
El borrador verbatim se escribe en `PLANTILLAS.md` DESPUÉS de cerrar este cuestionario
(mismo proceso GoDentist: doc → revisión wording por ustedes → SQL).

---

## E. Activación y métricas

**E1.** Igual que GoDentist FB/IG: sin feature flag, activación por routing rule manual cuando
ustedes decidan (Regla 6 — cero tráfico hasta crear la regla). ¿OK?
RESPUESTA:

**E2.** Métrica de éxito propuesta: % de conversaciones nuevas que llegan a cita confirmada
(baseline humano actual: **12%**) + tiempo de primera respuesta (hoy: horas en la noche).
RESPUESTA:

**E3.** ¿Tag tipo `VAL` de GoDentist al completar datos críticos? (para métricas en CRM).
¿Nombre del tag y/o pipeline donde registrar la cita como pedido?
RESPUESTA:
