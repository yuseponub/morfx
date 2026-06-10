# Análisis de Conversaciones — Varixcenter

> Fuente: 544 conversaciones del workspace Varixcenter (`c6621640-ba67-43de-9f05-905f09a6dc8f`)
> — 537 importadas del historial WhatsApp (`573202067077`, abr-jun 2026) + FB/IG vivas.
> 362 conversaciones con mensajes del cliente fueron clasificadas una a una (6 lotes en paralelo).
> Fecha del análisis: 2026-06-10. Datos crudos en `scripts/varix-data/`.

---

## 1. El negocio (como se ve en las conversaciones)

Centro médico especializado en venas várices en Bucaramanga, **28-30 años de experiencia**,
**una sola sede** (Cra 34 # 52-125, segundo piso, Cabecera). Médico flebólogo (mencionan al
"Dr. Ciro"). 100% particular — **sin convenios EPS ni prepagadas**. Tratamiento principal:
**escleroterapia**. La puerta de entrada siempre es la **consulta de valoración** (~$100.000,
incluye "escaneo venoso" con Eco Doppler; el plan de costos se entrega en físico ese día).

**Diferencia clave vs GoDentist:** la valoración TIENE COSTO (GoDentist era gratis). El pitch
no es "valoración GRATIS" sino "la valoración determina tu tratamiento exacto".

## 2. Frecuencia de intents (362 conversaciones)

| Intent | % convs | Notas |
|--------|---------|-------|
| `precio` (consulta o tratamiento) | **66%** | Mayoría llega con "¿Precio?" seco (CTA de pauta FB). Mismo 67% que GoDentist |
| `triage_tipo` (grandes/vasitos) | 54% | Respuesta al triage del asesor — el dato pivote del negocio |
| `ciudad` | 45% | Respuesta a la 1ª pregunta del saludo |
| `saludo` | 38% | |
| `quiero_agendar` | 20% | |
| `info_tratamiento` | 18% | Cómo funciona, sesiones, si duele, si vuelven a salir |
| `seleccion_horario` | 15% | AM/PM y hora puntual |
| `acknowledgment` | 15% | |
| `confirmar` | 12% | |
| `ubicacion` | 11% | |
| `fuera_de_ciudad` | **10.5%** | Cúcuta, B/bermeja, Valledupar, Cali… preguntan si hay sede o virtual |
| `datos` (nombre/cédula) | 10% | |
| `sintomas_descripcion` | 10% | Describen su caso; varios envían FOTOS de piernas |
| `post_tratamiento` / control | 8.5% | Pacientes antiguos: control $110k, medias, recaídas |
| `horarios` | 5% | |
| `reagendar` | 4% | |
| `formas_pago` / financiación | 3% | Addi y Sistecrédito |
| `seguros_eps` | 1% | "¿Tienen convenio con Medisanitas?" → "somos totalmente particular" |
| `queja` | 1% | "Me hice varias sesiones y no noté cambios" |
| `asesor` | 1% | |
| `precio_examen` (dúplex/Doppler) | 1% | Examen diagnóstico aparte: $180k una pierna / $260k dos |
| `cancelar_cita` | 0.5% | |

**Primer mensaje del cliente:** ~47% precio, ~26% saludo, ~10% ciudad (responden directo a
la pauta), resto agendar/síntomas/notas de voz.

## 3. Resultado de las conversaciones

| Resultado | % |
|-----------|---|
| Cita confirmada | **12%** |
| En proceso sin confirmar (abandonan a mitad) | 8% |
| Solo preguntó info (recibió precio/info y no siguió) | **55%** |
| Sin respuesta / abandono inmediato | 20% |

**La oportunidad #1 del agente:** el 55% que pregunta precio y se va. Hoy el humano NO hace
retomas — un follow-up tipo GoDentist (L1-L6) sobre ese 55% es la palanca de conversión más
grande. La segunda: responder de noche/fines de semana (muchos "¿Precio?" sin respuesta).

## 4. Flujo de facto del humano (el playbook actual)

```
CLIENTE: "¿Precio?" / "Hola"
VARIX:   Saludo institucional (28 años, Bucaramanga) + 2 preguntas:
         1. ¿De qué ciudad te comunicas?  2. ¿Varices grandes o vasitos?
CLIENTE: "Bucaramanga, vasitos"
VARIX:   [Template según tipo]
         - vasitos → escleroterapia, medicamento seguro, sesión $95.000
         - grandes → consulta especializada, Dr. hace escaneo venoso (Eco Doppler),
           valoración $100.000, plan de costos en físico ese día
VARIX:   ¿Deseas agendar? → ¿mañana o tarde?
CLIENTE: elige jornada
VARIX:   ofrece hora puntual concreta ("mañana 9:30am") + pide nombre completo (+cédula a veces)
CLIENTE: da datos
VARIX:   confirma cita + "te enviamos recordatorio un día antes" + dirección
```

Pregunta de triage textual del asesor (127 usos): **"Depende si tienes varices grandes o
vasitos, ¿Cuál es tu caso?"**

## 5. Datos duros mencionados por el personal (a confirmar vigencia)

| Concepto | Valor |
|----------|-------|
| Consulta de valoración | $100.000 (incluye escaneo venoso) |
| Sesión escleroterapia (vasitos) | $95.000 |
| Cita de control (paciente antiguo) | $110.000 + traer medias largas |
| Procedimiento varices grandes | $250.000 por pierna (mención); sesiones ECOR $400k/$300k (mención) |
| Dúplex / Doppler | $180.000 una pierna / $260.000 dos piernas |
| Medias de compresión 20/30 | muslo $175.000 / panty $190.000 |
| Financiación | Addi y Sistecrédito (requiere documento físico + celular, presencial) |
| Horarios de citas | L-V 8:00–11:30am y 2:30–3:30pm; sábados 8:00am–12:00pm |
| Dirección | Cra 34 # 52-125, segundo piso, Bucaramanga (Cabecera) |
| Política precio tratamiento | NO se da precio total: "los diagnósticos son todos diferentes" |
| Instrucción cita | Traer short tipo pijama; pago en efectivo (mención truncada) |

## 6. Casos especiales observados (insumo para plantillas escape/edge)

1. **Foráneos (~10%)**: Cúcuta, Valledupar, B/bermeja, Cali, San Gil, Aguachica, Ocaña, etc.
   Respuesta actual: "solo atendemos en Bucaramanga", sin virtual. Una paciente de Montería
   agendó para cuando viajara.
2. **Pacientes antiguos / outbound de reactivación**: Varix manda mensajes proactivos
   ("la enfermedad venosa crónica requiere manejo…") invitando a control ($110k). El cliente
   responde y se agenda. Flujo distinto al de lead nuevo.
3. **Notas de voz**: frecuentes y el dato se pierde (humano contesta "¿me lo escribes?"). 
4. **Fotos de piernas**: clientes mandan imágenes esperando pre-diagnóstico. Humano NO
   diagnostica por foto — redirige a valoración.
5. **Consultas por terceros**: "mi esposo", "mi mamá de 72 años".
6. **Preguntas médicas específicas**: alergia a dipirona, diabetes, úlcera post-trauma,
   embarazo — el humano deriva a la valoración con el Dr.
7. **Quejas**: "varias sesiones y no noté cambios", "eso es mero robo" (precio).
8. **Servicios no ofrecidos**: fleboterapia ("no manejamos"), láser endovascular (preguntan precio).
9. **Crédito con deuda previa**: paciente con deuda de $5M quiere otro crédito — advertencia manual.
10. **Reagendamientos** sin fricción (elecciones, fractura, llegó tarde).
11. **Desconfianza primera vez**: "¿cómo puedo confiar?" → remiten a redes + 30 años experiencia.
12. **EPS/empresa**: Medisanitas, Ecopetrol → "somos totalmente particular".

## 7. Plantillas de facto detectadas (24 mensajes outbound usados ≥3 veces)

Top 5 (ver `scripts/varix-data/defacto-templates.json` completo):
1. (127x) Triage: "Depende si tienes varices grandes o vasitos, ¿Cuál es tu caso?"
2. (~200x sumando variantes AM/PM) Saludo: "✨ Muchas gracias por comunicarte con VarixCenter… 1. ¿De qué ciudad te comunicas? 2. ¿Tienes varices grandes o vasitos?"
3. (39x+34x) Info vasitos/escleroterapia: "el mejor tratamiento que existe es la escleroterapia…"
4. (30x+29x+25x) Info varices grandes: "…consulta médica especializada… escaneo venoso…"
5. (21x) Jornada: "¿te sirve en horas de la mañana o de la tarde?"
6. (13x) Horarios + dirección.

Estas 6 son el esqueleto del catálogo de templates del agente — ya están validadas por uso real.

## 8. Implicaciones para el diseño v3 (vs GoDentist)

| Dimensión | GoDentist | Varixcenter |
|-----------|-----------|-------------|
| Hook de venta | Valoración GRATIS | Valoración $100k que define tratamiento exacto |
| Triage pivote | sede (4 opciones) | tipo de venas (grandes/vasitos) + ciudad |
| Sedes | 4 (enum sede) | 1 — desaparece `seleccion_sede` |
| Disponibilidad | Robot Dentos (slots reales) | **Desconocido — pregunta abierta clave** (¿agenda manual? ¿software?) |
| Datos críticos | nombre + teléfono + sede | nombre + ciudad + tipo_venas (+cédula?) — confirmar |
| Foráneos | no aplica (local) | 10% del tráfico — template dedicado |
| Pacientes antiguos | no aplica | flujo control/reactivación — ¿scope V1? |
| Media inbound | poco | notas de voz y fotos frecuentes — política explícita necesaria |

---

*Siguiente paso: llenar `CUESTIONARIO-DISENO.md` con el usuario y de ahí derivar
`DISENO-COMPLETO.md` + `PLANTILLAS.md` (mismo proceso que agent-godentist).*
