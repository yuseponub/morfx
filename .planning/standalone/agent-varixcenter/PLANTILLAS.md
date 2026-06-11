# Plantillas — Agente Varixcenter

> Wording verbatim para `agent_templates` (agent_id `varixcenter`). Basado en el playbook real
> del equipo ("MENSAJE PARA CUANDO PREGUNTAN VALORACION") + estructura GoDentist.
> Prioridades: CORE (siempre), COMP (complementaria), OPCIONAL (una vez por conversación).
> ⚠️ PENDIENTE del cliente: escoger 1 de las 5 opciones de saludo (sección 1).

---

## 1. Saludo — 5 OPCIONES (escoger una)

Todas hacen el doble triage (ciudad + tipo de venas) que el equipo ya usa hoy.

**Opción A (la del cliente, pulida):**
> ¡Hola! 👋 Bienvenido a VarixCenter, donde tus várices son cosa del pasado ✨
> Somos un centro médico especializado en venas várices en Bucaramanga, con más de 28 años de experiencia.
> Para ayudarte mejor, cuéntame:
> 1️⃣ ¿De qué ciudad nos escribes?
> 2️⃣ ¿Tienes várices grandes o vasitos?

**Opción B (institucional, la más cercana a la actual):**
> ¡Hola! ✨ Muchas gracias por comunicarte con VarixCenter, centro médico especializado en venas
> várices en Bucaramanga, con más de 28 años de experiencia.
> Por favor indícame:
> 1️⃣ ¿De qué ciudad te comunicas?
> 2️⃣ ¿Tienes várices grandes o vasitos?

**Opción C (beneficio por delante):**
> ¡Hola! 💙 En VarixCenter llevamos más de 28 años devolviéndole la salud y la belleza a las
> piernas de nuestros pacientes. Cuéntame para orientarte:
> 1️⃣ ¿Desde qué ciudad nos escribes?
> 2️⃣ ¿Tu caso son várices grandes o vasitos?

**Opción D (corta y directa):**
> ¡Hola! 👋 Bienvenido a VarixCenter ✨ (28+ años tratando venas várices en Bucaramanga).
> Para ayudarte: 1️⃣ ¿De qué ciudad nos escribes? 2️⃣ ¿Várices grandes o vasitos?

**Opción E (con el médico como protagonista):**
> ¡Hola! ✨ Bienvenido a VarixCenter, centro médico flebológico con más de 28 años de experiencia
> en Bucaramanga. Nuestros especialistas te dan un diagnóstico exacto en tu valoración.
> Cuéntame: 1️⃣ ¿De qué ciudad te comunicas? 2️⃣ ¿Tienes várices grandes o vasitos?

## 2. Triage (cuando piden precio sin haber dado tipo de venas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `triage` | CORE | "Con gusto te cuento 😊 Depende de si tienes várices grandes o vasitos, ¿cuál es tu caso? Y cuéntame, ¿de qué ciudad nos escribes?" |

## 3. Info por tipo de venas

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `info_vasitos` | CORE | "Para los vasitos el mejor tratamiento que existe es la escleroterapia 💉 Utilizamos un medicamento muy seguro y técnicas que eliminan esas venitas de la forma adecuada. El objetivo es mejorar la circulación de la zona y evitar que empeore con los años." |
| `info_vasitos_comp` | COMP | "Inicialmente se realiza una valoración: el Dr. te hace un escaneo venoso (examen de las venas internas) para determinar tu plan a seguir. La consulta especializada tiene un valor de $100.000 y cada sesión de escleroterapia $95.000 — el número de sesiones se define en la valoración." |
| `info_grandes` | CORE | "El objetivo de tratar las venas várices es mejorar la circulación de la zona afectada y evitar que empeore con los años. Inicialmente se realiza una consulta médica especializada: el Dr. te hace un escaneo venoso (se observan las venas internas) y determina el tratamiento exacto que requieres." |
| `info_grandes_comp` | COMP | "La valoración tiene un costo de $100.000 e incluye el escaneo venoso. Ese mismo día recibes tu plan de tratamiento con los costos, en físico." |
| `info_ambas` | CORE | "Tranquil@, es muy común tener los dos casos 😊 El tratamiento combina técnicas: para los vasitos usamos escleroterapia y para las várices grandes el Dr. determina el procedimiento exacto en la valoración con el escaneo venoso." |
| `info_ambas_comp` | COMP | "La valoración tiene un valor de $100.000 e incluye el escaneo venoso — ahí mismo sale tu plan de tratamiento completo con costos." |

## 4. Precios / Informacionales

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_valoracion` | CORE | "La consulta de valoración tiene un valor de $100.000 e incluye un escaneo venoso con equipo Eco Doppler, con el cual el Dr. te da tu diagnóstico y tu plan de tratamiento exacto ese mismo día." |
| `precio_tratamiento` | CORE | "El valor del tratamiento se define según lo que el Dr. encuentre en la valoración (depende de la cantidad de sesiones que requiera cada pierna). Lo que sí te puedo adelantar: la sesión de escleroterapia tiene un valor de $95.000 y la valoración $100.000 (incluye el escaneo venoso)." |
| `precio_cirugia` | CORE | "Manejamos procedimientos como la ecorreabsorción guiada por Doppler y cirugía endovascular para várices grandes — son nuestro tratamiento insignia. El valor exacto se determina en la valoración, porque depende de lo que el Dr. encuentre en el escaneo venoso." |
| `info_laser` | CORE | "En el momento no manejamos láser para vasitos, ya que no se puede usar en todos los casos. Usamos láser endovascular, que es diferente: trata la vena interna que está generando las várices grandes. El Dr. te indica en la valoración si es tu caso." |
| `info_examen_doppler` | CORE | "La valoración incluye un escaneo venoso con equipo Eco Doppler, con el que el Dr. da tu diagnóstico. Si lo que necesitas son las imágenes impresas y un reporte escrito (por ejemplo para otro médico), eso es una cita de Doppler venoso aparte — te comunico con el equipo para agendarla." |
| `info_medias` | CORE | "Para iniciar el tratamiento necesitas una media de compresión venosa. Sus características exactas (compresión, tipo) te las indicamos en la valoración, y aquí mismo las manejamos para tu comodidad." |
| `ubicacion` | CORE | "Nuestra dirección es: Cra 34 # 52-125, segundo piso, Bucaramanga — VarixCenter (Cabecera)." |
| `horarios` | CORE | "Nuestros horarios de citas son:\n• Lunes a viernes: 8:00am a 11:30am y 2:30pm a 3:30pm\n• Sábados: 8:00am a 12:00pm\n📍 Cra 34 # 52-125, segundo piso, Bucaramanga." |
| `financiacion` | CORE | "Sabemos que tu bienestar no tiene precio y queremos que recuperes la salud de tus piernas de manera asequible 💙 Ofrecemos financiamiento con Addi y Sistecrédito: la simulación del crédito se hace directamente en nuestras instalaciones y en pocos minutos tienes respuesta, para iniciar tu tratamiento de inmediato." |
| `financiacion_opcional` | OPCIONAL | "Recuerda que tenemos opciones de financiamiento con Addi y Sistecrédito por si deseas iniciar tu tratamiento de una vez 😊" |
| `seguros_eps` | CORE | "Somos un centro médico totalmente particular — no manejamos EPS ni prepagadas. Pero contamos con opciones de financiación con Addi y Sistecrédito para que puedas iniciar tu tratamiento." |
| `fuera_de_ciudad` | COMP | "Por el momento únicamente tenemos sede en Bucaramanga (Cra 34 # 52-125, segundo piso). Muchos de nuestros pacientes viajan para su valoración — si lo deseas, con gusto te agendamos para la fecha en que puedas venir 😊" |

## 5. Síntomas / médicas

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `no_diagnostico` | CORE | "Gracias por contarme tu caso 🙏 Para darte un diagnóstico exacto y seguro, el Dr. necesita revisarte en la valoración con el escaneo venoso — por fotos o descripción no es posible determinar el tratamiento. La valoración tiene un valor de $100.000 e incluye el examen. ¿Te gustaría agendarla?" |
| `preguntas_medicas` | CORE | "Esa es una muy buena pregunta, y la respuesta depende de tu caso particular — eso lo determina el Dr. directamente en la valoración. Ahí mismo resuelves todas tus dudas con el especialista. ¿Te gustaría agendar?" |
| `pedir_texto` | CORE | "¿Me lo puedes escribir por mensaje de texto, por favor? 🙏 Así te ayudo más rápido." |

## 6. Flujo de Agendamiento

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `pedir_datos` | CORE | "¡Excelente decisión! 😊 Para agendar tu valoración necesito estos datos:\n• Nombre completo\n• Número de cédula\n• Número de teléfono de contacto" |
| `pedir_datos_parcial` | CORE | "Para completar tu agendamiento me falta: {{campos_faltantes}}." |
| `pedir_fecha` | CORE | "¡Perfecto, {{nombre}}! ¿Para qué día te gustaría tu valoración? Y cuéntame si prefieres en la mañana o en la tarde 😊" |
| `mostrar_disponibilidad` | CORE | "Para el {{fecha}} tenemos disponibilidad:\n\n🌅 Mañana:\n{{slots_manana}}\n\n🌆 Tarde:\n{{slots_tarde}}\n\n¿Cuál horario te queda mejor?" |
| `mostrar_disponibilidad_jornada` | CORE | "Para el {{fecha}} en la {{jornada}} tenemos:\n\n{{slots}}\n\n¿Cuál horario te queda mejor?" |
| `sin_disponibilidad` | CORE | "Para el {{fecha}} ya no tenemos cupos disponibles 😔 ¿Quieres que miremos otro día?" |
| `confirmar_cita` | CORE | "Perfecto, confirmo tu cita de valoración:\n• Nombre: {{nombre}}\n• Cédula: {{cedula}}\n• Teléfono: {{telefono}}\n• Fecha: {{fecha}}\n• Hora: {{horario_seleccionado}}\n¿Todo correcto?" |
| `cita_agendada` | CORE | "¡Listo, {{nombre}}! 🎉 Tu cita de valoración quedó agendada para el {{fecha}} a las {{horario_seleccionado}} en la Cra 34 # 52-125, piso 2, Cabecera — VarixCenter Centro Médico Flebológico.\n\nRECUERDA:\n• Traer tu propio short tipo pijama\n• Agradecemos pagos en efectivo o con tarjeta\n\n¡Te esperamos! 🤩" |
| `invitar_agendar` | CORE | "¿Te gustaría agendar tu valoración? El Dr. te da tu diagnóstico exacto y tu plan de tratamiento ese mismo día 😊" |

## 7. Escape / Control

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `handoff` | CORE | "Te comunico con nuestro equipo para atenderte personalmente. En un momento te contactan 🙌" |
| `paciente_antiguo` | CORE | "¡Qué gusto saludarte de nuevo! 💙 Para temas de tu tratamiento, controles o seguimiento te comunico con nuestro equipo — en un momento te contactan 🙌" |
| `reagendamiento` | CORE | "Claro que sí, para reagendar tu cita te comunico con nuestro equipo. Ellos te ayudan con la nueva fecha 🙌" |
| `cancelar_cita` | CORE | "Entendido, te comunico con nuestro equipo para gestionar la cancelación." |
| `queja` | CORE | "Lamento mucho que hayas tenido esa experiencia 🙏 Te comunico de inmediato con nuestro equipo para atenderte personalmente." |
| `no_interesa` | CORE | "Entendido, sin problema 😊 Quedamos a tu disposición cuando lo necesites. ¡Que tus piernas estén siempre sanas! 💙" |
| `despedida` | CORE | "¡Gracias por escribirnos! Quedamos atentos a cualquier inquietud 💙" |
| `english_response` | CORE | "Hi! Thank you for reaching out to VarixCenter. We'd love to help you. Could you write in Spanish so we can assist you better? Or if you prefer, we can connect you with an advisor 😊" |

## 8. Follow-ups (retomas por timer)

| ID | Timer | Contenido |
|----|-------|-----------|
| `retoma_post_info` | L2 (2min) | "¿Te gustaría agendar tu valoración? Recuerda que incluye el escaneo venoso y sales con tu plan de tratamiento exacto 😊" |
| `retoma_datos` | L1 (3min) | "Para completar tu cita me falta: {{campos_faltantes}}. ¿Me los compartes? 😊" |
| `retoma_fecha` | L3 (2min) | "¿Para qué día te gustaría tu valoración? 😊" |
| `retoma_horario` | L4 (2min) | "¿Te queda bien alguno de los horarios disponibles?" |
| `retoma_confirmacion` | L5 (3min) | "¿Confirmamos tu cita con los datos que me compartiste? 😊" |

---

## Notas de wording

1. La confirmación de cita del playbook original incluía "y las medias largas" — eso aplica a
   sesiones/controles, NO a la primera valoración (las características de la media se indican EN
   la valoración). Por eso `cita_agendada` solo pide el short. ⚠️ Confirmar con la clínica.
2. Verificar con la clínica el wording de `info_medias` (¿se venden ahí mismo? varix-medias existe).
3. Los precios en plantillas: valoración $100.000 y sesión $95.000 (D-06). Si cambian, se
   actualizan vía SQL en `agent_templates` (mismo flujo GoDentist).
