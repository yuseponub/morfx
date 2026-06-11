# Respuestas al Cuestionario de Diseño — Varixcenter

> Fuente 1: `Varix-Cuestionario-Diseno (2).docx` llenado por el cliente (2026-06-11).
> Fuente 2: `MENSAJE PARA CUANDO PREGUNTAN VALORACION...docx` — playbook de respuestas del equipo.
> Estado: la mayoría respondido. Faltantes en la sección final.

---

## A. Datos del negocio

| # | Pregunta | Respuesta |
|---|----------|-----------|
| A1 | Precios | Tabla sin correcciones escritas (ver FALTANTE-1: confirmar vigencia explícita). El playbook confirma valoración $100.000. PROJECT_BRIEF de varix-clinic confirma: valoración ~$100k, escleroterapia ~$95k/sesión, **ECOR/Endoláser $1.200.000–$1.700.000**, control ~$110k |
| A2 🔴 | ¿Bot da precios? | **SÍ**: precio de valoración y de sesiones. El precio del TRATAMIENTO se da según cantidad de sesiones por pierna (sale del plan post-valoración). Servicios mayores: **cirugías endovasculares** y **ecorreabsorción guiada por Doppler (tratamiento insignia)** |
| A3 | Horarios | ❌ SIN RESPONDER — pero el playbook repite L-V 8:00–11:30am / 2:30–3:30pm, sáb 8:00–12:00 (asumir correcto, confirmar) |
| A4 | Sedes | **No hay más sedes** (solo Bucaramanga) |
| A5 | Médicos | **El consultorio tiene 28 años de experiencia. Trabajan 2 doctores: Dr. Ciro Mario Romero y Dra. María Carolina Romero** |
| A6 | Financiación | Se ofrece como **opcional** (template COMPLEMENTARIA/OPCIONAL, "como tipo oferta"). Playbook tiene wording completo: Addi + Sistecredito, simulación en instalaciones |
| A7 | EPS | ❌ SIN RESPONDER — en convos: "somos totalmente particular" (asumir, confirmar) |
| A8 | Foráneos | **Única sede Bucaramanga; SÍ se puede agendar cita (a veces los clientes viajan)** |
| A9 | Servicios negados | ❌ PARCIAL — el playbook resuelve láser: "NO manejamos láser de vasitos; usamos **láser endovascular** (para vena interna que genera varices grandes)". Fleboterapia: no se maneja (visto en convos). Falta lista definitiva |

## B. Agendamiento

| # | Pregunta | Respuesta |
|---|----------|-----------|
| B1 🔴 | Sistema de agenda | **Software propio: `varix-clinic`** (carpeta Proyectos, Next.js + Supabase). "Podemos crear un vínculo para que se agenden en automático". Verificado: tabla `appointments` con `doctor_id`, `fecha_hora_inicio/fin`, constraint anti-solapamiento por doctor, enum de estados, catálogo de servicios, tabla `patients` |
| B2 🔴 | Modo de agendar | **OPCIÓN A** — slots reales, agenda directo (análogo robot Dentos de GoDentist, pero acá controlamos el software → integración directa, no robot scraping) |
| B3 | Datos para agendar | **nombre, teléfono, cédula y hora de la cita** (ver flujo GoDentist) |
| B4 | Recordatorio 1 día antes | "eso no" → el bot NO lo hace en V1 (queda en el equipo). ⚠️ ambiguo, confirmar lectura |
| B5 | Reagendar/cancelar | **Handoff a humano** |

## C. Alcance

| # | Pregunta | Respuesta |
|---|----------|-----------|
| C1 🔴 | Canales | **Todos** (WhatsApp + FB + IG desde el día 1) |
| C2 🔴 | Pacientes antiguos/control | **Handoff** |
| C3 | Respuestas a outbound reactivación | **Equipo** (versión del bot para esto: futuro standalone) |
| C4 | Notas de voz | "Por ahora lo normal, no respondemos audio" → bot pide texto |
| C5 | Fotos de piernas | **OK** (no pre-diagnóstico, invitar a valoración) |
| C6 | Preguntas médicas | ❌ SIN RESPONDER (asumir propuesta: "lo determina el Dr. en la valoración", confirmar) |
| C7 | Quejas | **OK handoff** |
| C8 | 24/7 | **SÍ** |
| C9 | Identidad/tono | Saludo estilo GoDentist (sin presentarse como bot con nombre). Ejemplo del cliente: "Bienvenido a VarixCenter, donde tus varices son cosa del pasado". **Pidió que creemos varios ejemplos para escoger** |

## D / E

| # | Pregunta | Respuesta |
|---|----------|-----------|
| D1 | Retomas | "Revisemos las retomas de GoDentist según la fase. Creamos unas parecidas" → nosotros proponemos |
| E1 | Activación controlada | **OK** |
| E2 | Métricas extra | "Por ahora no" |

---

## Playbook del equipo (templates semilla verbatim)

Extraídos del docx "MENSAJE PARA CUANDO PREGUNTAN VALORACION". Son la base de `PLANTILLAS.md`:

1. **Saludo** (variantes días/tardes): "✨ Muchas gracias por comunicarte con VarixCenter, somos un Centro Médico especializado en venas varices ubicado en Bucaramanga con más de 28 años de experiencia, por favor indícame lo siguiente: 1. De que ciudad te comunicas? 2. Tienes varices grandes o vasitos"
2. **Vasitos**: escleroterapia, medicamento seguro → valoración con escaneo venoso $100.000 → "Para iniciar el tratamiento debes tener una media de compresión venosa (características se indican en la valoración)" → CTA: "Si deseas agendar me puedes indicar tu nombre completo"
3. **Varices grandes**: objetivo mejorar circulación → consulta especializada con escaneo venoso → 28 años experiencia → valoración $100.000 → dirección → CTA nombre completo
4. **Ubicación**: "Cra 34 Numero 52 - 125 segundo piso Bucaramanga Varix Center"
5. **Horarios**: L-V 8:00–11:30am y 2:30–3:30pm; sáb 8:00–12:00 + dirección + "Nuestro objetivo es mejorar la calidad de vida de los pacientes"
6. **Financiamiento**: "Sabemos que tu bienestar no tiene precio… opciones de financiamiento con Addi, Sistecredito. Simulación de crédito en nuestras instalaciones, respuesta en pocos minutos"
7. **Láser**: "En el momento no estamos manejando el láser de vasitos (no se puede usar en todos los casos); usamos láser endovascular, que es diferente: trata una vena interna que esté generando varices grandes"
8. **Doppler vs valoración**: la valoración INCLUYE escaneo venoso (diagnóstico). Si el cliente quiere imágenes impresas + reporte escrito → debe agendar cita de "Doppler venoso" (servicio aparte)
9. **Confirmación de cita**: "Buenos días señora {{nombre}} para confirmar tu cita del día {{fecha}} a las {{hora}} en la dirección carrera 34 # 52-125 piso 2 cabecera VarixCenter Centro médico Flebológico. RECUERDA: Traer tu propio short tipo pijama y las medias largas. Agradecemos pagos en efectivo o con tarjeta. ¡Te esperamos 🤩!"

---

## FALTANTES — ✅ TODOS RESUELTOS (2026-06-11, segunda ronda)

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | A3 horarios | ✅ Sí, correctos |
| 2 | A7 EPS "totalmente particular" | ✅ Sí |
| 3 | A9 lista de servicios propuesta | ✅ Sí |
| 4 | Precio ECOR/endoláser | **"Se determina en valoración"** — el bot NO da el rango |
| 5 | C6 preguntas médicas | ✅ Sí ("lo determina el Dr. en la valoración") |
| 6 | Doctores para valoraciones | **Los 2** (agendas fusionadas, cliente no elige) |
| 7 | Duración slot valoración | **20 minutos** |
| 8 | varix-clinic en producción | **Sí, en prod** |
| 9 | ¿Bot crea el patient? | **Sí** (nombre + cédula + teléfono) |
| 10 | B4 recordatorio | **Manual con el equipo** (fuera de scope del bot) |
| 11 | Tag VAL + pipeline CRM | **Sí** (detalles de pipeline en plan-phase) |

→ Diseño derivado: `DISENO-COMPLETO.md` (D-01..D-15) + `PLANTILLAS.md` (~44 templates, 5 opciones de saludo).
→ Pendiente del cliente: escoger 1 saludo de las 5 opciones + 2 notas de wording en PLANTILLAS.md.

---

## (histórico) FALTANTES originales — lo que había que pedir/resolver antes de diseñar

### Para la clínica (5 confirmaciones rápidas, 1 línea cada una)

1. **A3** — Horarios L-V 8:00–11:30 / 2:30–3:30, sáb 8–12: ¿correcto? (el playbook lo repite; solo falta el "sí")
2. **A7** — ¿"Somos totalmente particular" (sin EPS/prepagadas) es la respuesta oficial?
3. **A9** — Lista cerrada de servicios que el bot SÍ ofrece: valoración / escleroterapia / ecorreabsorción guiada Doppler / cirugía endovascular (láser endovascular) / Doppler venoso impreso / medias. ¿Algo más? ¿Algo que negar además de láser de vasitos y fleboterapia?
4. **Precio ECOR/endoláser** — el brief de varix-clinic dice $1.2M–$1.7M: ¿el bot puede dar ese rango o responde "se determina en la valoración"?
5. **C6** — Preguntas médicas (alergias/diabetes/embarazo): ¿OK respuesta "lo determina el Dr. en la valoración" + invitar a agendar?

### Para Jose (decisiones de producto/técnicas)

6. **Doctores y valoraciones**: ¿quién atiende valoraciones de leads nuevos — Dr. Ciro, Dra. Carolina o ambos? ¿El cliente elige o se asigna? (la tabla `appointments` separa agenda por `doctor_id`)
7. **Duración de slot de valoración** (¿20/30 min?) y reglas de generación de slots dentro de los horarios — `appointments` usa rangos libres, hay que definir la grilla que el bot ofrece
8. **varix-clinic en producción**: ¿URL/proyecto Supabase? ¿el bot entra por API nueva en varix-clinic o MorfX consulta el Supabase de varix-clinic directo? (decisión research-phase; hay que definir credenciales y dónde vive el domain layer)
9. **¿El bot crea el `patient`** en varix-clinic (con cédula) o solo la cita con datos sueltos?
10. **Restricciones de agenda**: festivos Colombia, bloqueos puntuales (estilo GoDentist miércoles), ¿máximos por día aplican a valoraciones?
11. **B4 aclarar**: "eso no" = ¿recordatorio queda manual en el equipo, correcto?
12. **E3 (no estaba en el docx)**: ¿tag tipo `VAL` en MorfX CRM al completar datos + pipeline donde registrar la cita como pedido?

### Deudas nuestras (las hacemos nosotros, no se piden)

- Crear **3–5 opciones de saludo** estilo "Bienvenido a VarixCenter, donde tus varices son cosa del pasado" para que escojan (C9)
- Adaptar el **esquema de retomas de GoDentist** (L1–L6) a las fases de Varix y proponerlo (D1)
- Derivar `DISENO-COMPLETO.md` + `PLANTILLAS.md` con todo lo anterior
