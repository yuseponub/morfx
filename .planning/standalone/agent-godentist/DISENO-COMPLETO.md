# Diseño Completo — Agente GoDentist

> Motor: Somnio v3 (comprehension → state → gates → guards → sales track → response track)
> Objetivo: Agendar valoraciones GRATIS en clínica dental GoDentist (4 sedes, Bucaramanga/Floridablanca)

---

## 1. Intenciones (Intents)

### Informacionales (11)

| Intent | Frecuencia | Ejemplo |
|--------|-----------|---------|
| `saludo` | frecuente | "Hola buenos días" |
| `precio_servicio` | 67% | "¿Cuánto cuestan los brackets?" |
| `valoracion_costo` | 27% | "¿La valoración tiene costo?" |
| `financiacion` | 9% | "¿Tienen formas de pago?" |
| `ubicacion` | 8% | "¿Dónde quedan ubicados?" |
| `horarios` | 2% | "¿Hasta qué hora atienden el sábado?" |
| `materiales` | 0.8% | "¿Qué tipo de coronas manejan?" |
| `menores` | 0.5% | "¿Atienden niños de 8 años?" |
| `seguros_eps` | 0.2% | "¿Aceptan Sura/Compensar?" |
| `urgencia` | 0.1% | "Tengo un dolor terrible" |
| `garantia` | raro | "¿Tiene garantía el implante?" |

### Acciones del cliente (6)

| Intent | Significado |
|--------|------------|
| `quiero_agendar` | "Quiero pedir una cita" |
| `datos` | Envía nombre, teléfono, sede, fecha, etc. |
| `seleccion_sede` | Elige sede: "En Cabecera" |
| `seleccion_horario` | Elige horario de los mostrados |
| `confirmar` | "Sí, confirmo la cita" |
| `rechazar` | "No me interesa" / "No gracias" |

### Escape (4)

| Intent | Ejemplo |
|--------|---------|
| `asesor` | "Quiero hablar con alguien" |
| `reagendamiento` | "Necesito cambiar mi cita" |
| `queja` | "Mala experiencia / reclamo" |
| `cancelar_cita` | "Quiero cancelar mi cita" |

### Otros (2)

| Intent | Uso |
|--------|-----|
| `acknowledgment` | "Ok", "Gracias", "Dale" |
| `otro` | No clasificable |

---

## 2. Datos a Capturar (Comprehension Schema)

### Campos

| Campo | Crítico | Fase | Ejemplo |
|-------|---------|------|---------|
| `nombre` | Sí | captura | "Soy María López" |
| `telefono` | Sí | captura | "3001234567" → normalizar 573XXXXXXXXX |
| `sede_preferida` | Sí | captura | "Cabecera" / "Floridablanca" |
| `servicio_interes` | No | captura | "Coronas" / "Ortodoncia" |
| `cedula` | No | captura | "1098765432" |
| `fecha_preferida` | Sí (fase 2) | fecha | "El martes" / "Mañana" |
| `preferencia_jornada` | No | fecha | "En la mañana" / "En la tarde" |
| `horario_seleccionado` | Sí (fase 3) | disponibilidad | Elige de slots Dentos |

### Servicio detectado (enum)

Cuando intent = `precio_servicio`, extraer cuál servicio:

`corona, protesis, alineadores, brackets_convencional, brackets_zafiro, autoligado_clasico, autoligado_pro, autoligado_ceramico, implante, blanqueamiento, limpieza, extraccion_simple, extraccion_juicio, diseno_sonrisa, placa_ronquidos, calza_resina, rehabilitacion, radiografia, endodoncia, carillas, ortopedia_maxilar, ortodoncia_general, otro_servicio`

### Sede (enum)

`cabecera, mejoras_publicas, floridablanca, canaveral`

Mapeos: "Jumbo"/"Bosque"/"Cañaveral" → `canaveral`. "Centro" → `mejoras_publicas`.

### Clasificación

| Campo | Valores |
|-------|---------|
| `category` | `datos`, `pregunta`, `mixto`, `irrelevante` |
| `sentiment` | `positivo`, `neutro`, `negativo` |
| `idioma` | `es`, `en`, `otro` |

---

## 3. Fases (Máquina de Estados)

| Fase | Significado | Llega por acción |
|------|------------|-----------------|
| `initial` | Sin interacción significativa | (default) |
| `capturing_data` | Pidiendo nombre/tel/sede | `pedir_datos`, `pedir_datos_parcial` |
| `capturing_fecha` | Datos OK, pidiendo fecha | `pedir_fecha` |
| `showing_availability` | Mostrando horarios Dentos | `mostrar_disponibilidad` |
| `confirming` | Resumen completo, esperando "sí" | `mostrar_confirmacion` |
| `appointment_registered` | Cita registrada | `agendar_cita` |
| `closed` | Handoff/rechazo | `handoff`, `no_interesa` |

---

## 4. Gates

| Gate | Condición |
|------|-----------|
| `datosCriticos` | `nombre` + `telefono` + `sede_preferida` ≠ null |
| `fechaElegida` | `fecha_preferida` ≠ null |
| `horarioElegido` | `horario_seleccionado` ≠ null |
| `datosCompletos` | críticos + fecha + horario |

---

## 5. Acciones (TipoAccion)

| Acción | Efecto |
|--------|--------|
| `pedir_datos` | Pide todos los datos faltantes |
| `pedir_datos_parcial` | Pide solo campos faltantes |
| `pedir_fecha` | Pide fecha preferida |
| `mostrar_disponibilidad` | Consulta Dentos → muestra slots AM/PM |
| `mostrar_confirmacion` | Resumen completo para confirmar |
| `agendar_cita` | Registra cita, notifica equipo |
| `invitar_agendar` | CTA: "¿Agendar valoración GRATIS?" |
| `handoff` | Transferir a humano |
| `silence` | No hacer nada (solo responder info) |
| `no_interesa` | Despedida amable |
| `retoma_datos` | Follow-up datos faltantes |
| `retoma_fecha` | Follow-up pidiendo fecha |
| `retoma_horario` | Follow-up selección horario |
| `retoma_confirmacion` | Follow-up confirmación |

---

## 6. Timers

| Level | Duración | Contexto |
|-------|----------|----------|
| L1 | 3 min | Esperando datos básicos |
| L2 | 2 min | Respondió info, invitar a agendar |
| L3 | 2 min | Esperando fecha |
| L4 | 2 min | Esperando selección de horario |
| L5 | 3 min | Esperando confirmación |
| L6 | 90 seg | Ack / silencio |

Un solo intento de retoma por fase. Si no responde, se acabó.

---

## 7. Tabla de Transiciones

### Desde `initial`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 1 | `saludo` | — | `silence` | — |
| 2 | `quiero_agendar` | — | `pedir_datos` | L1 |
| 3 | `quiero_agendar` | `datosCriticos` + `!fechaElegida` | `pedir_fecha` | L3 |
| 4 | `quiero_agendar` | `datosCriticos` + `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 5 | `datos` | `!datosCriticos` | `pedir_datos_parcial` | L1 |
| 6 | `datos` | `datosCriticos` + `!fechaElegida` | `pedir_fecha` | L3 |
| 7 | `datos` | `datosCriticos` + `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 8 | `seleccion_sede` | `!datosCriticos` | `pedir_datos_parcial` | L1 |
| 9 | `seleccion_sede` | `datosCriticos` + `!fechaElegida` | `pedir_fecha` | L3 |
| 10 | `precio_servicio` | — | `silence` | L2 |
| 11 | `valoracion_costo` | — | `silence` | L2 |
| 12 | `financiacion` | — | `silence` | L2 |
| 13 | `ubicacion` | — | `silence` | L2 |
| 14 | `horarios` | — | `silence` | L2 |
| 15 | `urgencia` | — | `silence` | — |
| 16 | `materiales` | — | `silence` | L2 |
| 17 | `menores` | — | `silence` | L2 |
| 18 | `seguros_eps` | — | `silence` | L2 |
| 19 | `garantia` | — | `silence` | L2 |
| 20 | `otro` (conf < 80) | — | `handoff` | cancel |
| 21 | `timer_expired:L2` | — | `invitar_agendar` | — |

### Desde `capturing_data`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 22 | `datos` | `!datosCriticos` | `pedir_datos_parcial` | L1 |
| 23 | `datos` | `datosCriticos` + `!fechaElegida` | `pedir_fecha` | L3 |
| 24 | `datos` | `datosCriticos` + `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 25 | `seleccion_sede` | `!datosCriticos` | `pedir_datos_parcial` | L1 |
| 26 | `seleccion_sede` | `datosCriticos` + `!fechaElegida` | `pedir_fecha` | L3 |
| 27 | `auto:datos_criticos` | `!fechaElegida` | `pedir_fecha` | L3 |
| 28 | `auto:datos_criticos` | `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 29 | (info intents) | — | `silence` | reevaluate |
| 30 | `acknowledgment` | — | `silence` | L6 |
| 31 | `timer_expired:L1` | — | `retoma_datos` | — |

### Desde `capturing_fecha`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 32 | `datos` | `fechaElegida` | `mostrar_disponibilidad` | L4 |
| 33 | `datos` | `!fechaElegida` | `silence` | reevaluate |
| 34 | (info intents) | — | `silence` | reevaluate |
| 35 | `acknowledgment` | — | `silence` | L6 |
| 36 | `timer_expired:L3` | — | `retoma_fecha` | — |

### Desde `showing_availability`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 37 | `seleccion_horario` | — | `mostrar_confirmacion` | L5 |
| 38 | `datos` | nueva fecha | `mostrar_disponibilidad` | L4 |
| 39 | (info intents) | — | `silence` | reevaluate |
| 40 | `timer_expired:L4` | — | `retoma_horario` | — |

### Desde `confirming`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 41 | `confirmar` | `datosCompletos` | `agendar_cita` | cancel |
| 42 | `rechazar` | — | `pedir_datos` | L1 |
| 43 | `datos` | — | `mostrar_confirmacion` | L5 |
| 44 | (info intents) | — | `silence` | reevaluate |
| 45 | `timer_expired:L5` | — | `retoma_confirmacion` | — |

### Desde `appointment_registered`

| # | On | Condición | Acción | Timer |
|---|-----|-----------|--------|-------|
| 46 | `reagendamiento` | — | `handoff` | cancel |
| 47 | `cancelar_cita` | — | `handoff` | cancel |
| 48 | (info intents) | — | `silence` | — |
| 49 | `*` | — | `silence` | — |

### Escape (cualquier fase)

| # | On | Acción | Timer |
|---|----|--------|-------|
| 50 | `asesor` | `handoff` | cancel |
| 51 | `queja` | `handoff` | cancel |
| 52 | `reagendamiento` | `handoff` | cancel |
| 53 | `cancelar_cita` | `handoff` | cancel |
| 54 | `no_interesa` | `no_interesa` | cancel |

---

## 8. Plantillas

### Saludo

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `saludo` | CORE | "¡Hola! Bienvenido a GoDentist, nuestra felicidad es verte sonreír 😊 ¿Deseas agendar tu cita de valoración GRATIS?" |

### Opcional Universal

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `recordatorio_sin_compromiso` | OPCIONAL | "Recuerda que puedes recibir tu cotización completa sin ningún tipo de compromiso 😊" |

### Precios de Servicios

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_corona` | CORE | "Las coronas en zirconio tienen un valor desde $700.000, elaboradas con materiales de la más alta calidad. En algunos casos puede requerir tratamientos previos que se determinan en la valoración." |
| `precio_corona_comp` | COMP | "Trabajamos con zirconio y disilicato de litio, todos nuestros tratamientos incluyen garantía ✅" |
| `precio_protesis` | CORE | "Las prótesis dentales inician desde $1.100.000. Cada prótesis se elabora a la medida del paciente para un ajuste perfecto." |
| `precio_protesis_comp` | COMP | "El valor puede variar según el tipo y los materiales. En la valoración te entregamos la cotización exacta para tu caso." |
| `precio_alineadores` | CORE | "Los alineadores inician con escaneo y planificación digital por $600.000, colocación de attachments $300.000 por maxilar y cada alineador $125.000. Trabajamos con GoAligner, marca colombiana 🇨🇴" |
| `precio_alineadores_comp` | COMP | "La cantidad de alineadores depende de tu caso. En la valoración el especialista te da el plan completo con el número exacto." |
| `precio_brackets_conv` | CORE | "El montaje de brackets convencionales tiene un valor de $550.000 (superior $275.000 + inferior $275.000). Los controles mensuales son de $90.000 cada uno." |
| `precio_brackets_conv_comp` | COMP | "El tratamiento incluye aproximadamente 24 controles. ¡Es la mejor opción para empezar tu camino a una sonrisa perfecta!" |
| `precio_brackets_zafiro` | CORE | "Los brackets de zafiro tienen un montaje de $2.400.000 (superior $1.200.000 + inferior $1.200.000). Los controles son de $140.000 cada uno." |
| `precio_brackets_zafiro_comp` | COMP | "El zafiro es prácticamente invisible y muy resistente. ¡Ideal si buscas estética durante el tratamiento!" |
| `precio_autoligado_clasico` | CORE | "La ortodoncia de autoligado clásico tiene un montaje de $1.400.000 ($700.000 + $700.000). Los controles son de $140.000 cada uno." |
| `precio_autoligado_clasico_comp` | COMP | "El sistema autoligado requiere menos citas de ajuste y puede acortar el tiempo de tratamiento." |
| `precio_autoligado_pro` | CORE | "La ortodoncia autoligado pro tiene un montaje de $2.400.000 ($1.200.000 + $1.200.000). Los controles son de $140.000 cada uno." |
| `precio_autoligado_pro_comp` | COMP | "Es nuestra línea premium de autoligado, con brackets de última generación para resultados más rápidos." |
| `precio_autoligado_ceramico` | CORE | "La ortodoncia autoligado cerámico tiene un montaje de $3.000.000 ($1.500.000 + $1.500.000). Los controles son de $140.000 cada uno." |
| `precio_autoligado_ceramico_comp` | COMP | "Combina la eficiencia del autoligado con la estética del cerámico. ¡Prácticamente no se nota!" |
| `precio_implante` | CORE | "Los implantes dentales tienen un valor desde $2.100.000. Trabajamos con marcas de prestigio mundial: Microdent, Neodent y Straumann." |
| `precio_implante_comp` | COMP | "Según tu caso puede requerirse tomografía, injerto de hueso o membrana. Todo se evalúa en la valoración." |
| `precio_blanqueamiento` | CORE | "Manejamos diferentes protocolos de blanqueamiento: casero, en consultorio y combinado. El valor depende del tono actual y el aclaramiento que buscas." |
| `precio_blanqueamiento_comp` | COMP | "En la valoración el especialista evalúa tu tono y te recomienda el protocolo ideal con su cotización exacta." |
| `precio_limpieza` | CORE | "La limpieza premium tiene un valor de $160.000. Para pacientes con ortodoncia es de $90.000." |
| `precio_limpieza_comp` | COMP | "Se recomienda cada 6 meses, o cada 3-4 meses si tienes ortodoncia. ¡Tu sonrisa te lo agradece!" |
| `precio_extraccion_simple` | CORE | "Las extracciones simples tienen un valor entre $115.000 y $175.000 según la complejidad." |
| `precio_extraccion_juicio` | CORE | "La extracción de muela del juicio tiene un valor desde $225.000 por unidad según la complejidad del caso." |
| `precio_diseno_sonrisa` | CORE | "El diseño de sonrisa tiene un valor desde $260.000 por diente, con correcciones en bordes incisales para una sonrisa armónica." |
| `precio_diseno_sonrisa_comp` | COMP | "Utilizamos tecnología digital para planificar tu sonrisa ideal antes de empezar. ¡Verás el resultado antes del tratamiento!" |
| `precio_placa_ronquidos` | CORE | "La placa anti-ronquido tiene un valor de $1.590.000. Es un dispositivo para apnea del sueño que te ayuda a descansar mejor a ti y a tu familia." |
| `precio_calza_resina` | CORE | "Las calzas en resina tienen un valor desde $120.000 en adelante según el tamaño de la restauración." |
| `precio_rehabilitacion` | CORE | "La rehabilitación oral es un tratamiento completamente personalizado. Utilizamos tecnología digital y robótica para los mejores resultados. El valor se define en la valoración según tu plan de tratamiento." |
| `precio_radiografia` | CORE | "La radiografía individual tiene un valor de $31.000. También tenemos el paquete de 9 fotos + 2 radiografías por $70.000." |
| `precio_endodoncia` | CORE | "La endodoncia tiene un valor desde $430.000. Incluye radiografía periapical antes y después del procedimiento." |
| `precio_carillas` | CORE | "Las carillas en resina directa van desde $410.000/diente, en resina impresa desde $650.000/diente y en cerámica desde $1.600.000/diente." |
| `precio_carillas_comp` | COMP | "En la valoración el especialista te recomienda el material ideal según tu caso y expectativas." |
| `precio_ortopedia` | CORE | "La ortopedia maxilar tiene un valor desde $2.000.000. Se maneja con cuota inicial de $1.000.000 + 10 controles de $100.000." |
| `precio_ortopedia_comp` | COMP | "En algunos casos puede requerirse máscara de Petit ($200.000). El especialista te indica en la valoración." |
| `precio_ortodoncia_general` | CORE | "¡Tenemos varias opciones de ortodoncia!\n• Brackets convencionales: $550.000 montaje + $90.000/control\n• Autoligado clásico: $1.400.000 + $140.000/control\n• Autoligado pro: $2.400.000 + $140.000/control\n• Brackets zafiro: $2.400.000 + $140.000/control\n• Autoligado cerámico: $3.000.000 + $140.000/control\n• Alineadores GoAligner: desde $600.000 + $125.000/alineador\n\nEn la valoración el especialista te recomienda la mejor opción para tu caso." |

### Informacionales

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `valoracion_costo` | CORE | "¡La valoración es totalmente GRATIS! Incluye revisión completa con el odontólogo y tu plan de tratamiento personalizado con cotización." |
| `valoracion_costo_comp` | COMP | "Si hay especialistas disponibles, se hace interconsulta inmediata. Duración aproximada 15-30 minutos." |
| `valoracion_excepcion` | COMP | "La única excepción es la valoración de cirugía maxilofacial que tiene un costo de $200.000." |
| `financiacion_resumen` | CORE | "¡Tenemos opciones de financiación desde 3 hasta 36 cuotas! Trabajamos con Meddipay, Sistecrédito, Addi, Sumaspay y otros convenios. Solo necesitas tu cédula, no estar en Datacrédito y un dispositivo con internet." |
| `financiacion_medios_pago` | COMP | "También aceptamos Visa y Mastercard (crédito y débito), efectivo y transferencia a Bancolombia o BBVA. Si pagas de contado el día de la valoración, te damos un 5% de descuento 💪" |
| `ubicacion` | CORE | "Contamos con 4 sedes para tu comodidad: Cabecera (Cll 52 #31-32), Mejoras Públicas (Cll 41 #27-63), Floridablanca (Cll 4 #3-06) y Cañaveral en CC Jumbo El Bosque. ¿Cuál te queda mejor?" |
| `horarios` | CORE | "Atendemos de lunes a viernes de 8:00am a 6:30pm y sábados de 8:00am a 12:00md. No abrimos domingos ni festivos." |
| `horarios_comp` | COMP | "La sede Cabecera los sábados tiene jornada continua hasta las 5:00pm." |
| `materiales` | CORE | "Trabajamos con materiales de la más alta calidad: coronas en zirconio y disilicato de litio, implantes Microdent/Neodent/Straumann, y alineadores GoAligner 🇨🇴" |
| `menores` | CORE | "¡Sí, atendemos todas las edades! Los menores de edad deben asistir con un acompañante." |
| `seguros_eps` | CORE | "Somos clínica particular, no manejamos EPS ni seguros. Pero tenemos excelentes opciones de financiación desde 3 hasta 36 cuotas para que puedas acceder a tu tratamiento." |
| `urgencia` | CORE | "¡Sí manejamos urgencias dentales! Te recomendamos acercarte lo antes posible a la sede más cercana." |
| `urgencia_comp` | COMP | "Nuestras sedes: Cabecera (Cll 52 #31-32), Mejoras Públicas (Cll 41 #27-63), Floridablanca (Cll 4 #3-06) y Cañaveral en CC Jumbo El Bosque." |
| `garantia` | CORE | "Sí manejamos garantía en nuestros tratamientos, sujeta a asistencia a controles y seguimiento fotográfico del proceso." |

### Flujo de Agendamiento

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `pedir_datos` | CORE | "¡Excelente! Para agendarte tu valoración GRATIS necesito: tu nombre completo, número de celular y la sede de tu preferencia: Cabecera, Mejoras Públicas, Floridablanca o Cañaveral." |
| `pedir_datos_parcial` | CORE | "Para completar tu agendamiento me falta: {{campos_faltantes}}." |
| `pedir_fecha` | CORE | "¡Perfecto {{nombre}}! ¿Para qué día te gustaría agendar tu valoración?" |
| `mostrar_disponibilidad` | CORE | "Para el {{fecha}} en la sede {{sede_preferida}} tenemos disponibilidad:\n\n🌅 Mañana:\n{{slots_manana}}\n\n🌆 Tarde:\n{{slots_tarde}}\n\n¿Cuál horario te queda mejor?" |
| `mostrar_disponibilidad_jornada` | CORE | "Para el {{fecha}} en la {{jornada}} en sede {{sede_preferida}} tenemos:\n\n{{slots}}\n\n¿Cuál horario te queda mejor?" |
| `sin_disponibilidad` | CORE | "Para el {{fecha}} no tenemos disponibilidad en esa sede. ¿Te gustaría consultar otro día o en otra sede?" |
| `confirmar_cita` | CORE | "Perfecto, confirmo tu cita:\n• Nombre: {{nombre}}\n• Teléfono: {{telefono}}\n• Sede: {{sede_preferida}}\n• Fecha: {{fecha}}\n• Hora: {{horario_seleccionado}}\n¿Todo correcto?" |
| `cita_agendada` | CORE | "¡Listo, quedas agendado/a! 🎉 Tu cita es el {{fecha}} a las {{horario_seleccionado}} en la sede {{sede_preferida}}. Te confirmaremos el día anterior por llamada y WhatsApp." |
| `invitar_agendar` | CORE | "¿Te gustaría agendar tu valoración GRATIS? 😊" |

### Escape / Control

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `handoff` | CORE | "Te comunico con un asesor para atenderte personalmente. En un momento te contactan 🙌" |
| `reagendamiento` | CORE | "Para reagendar tu cita te comunico con nuestra coordinadora. Ella te ayudará con la nueva fecha." |
| `cancelar_cita` | CORE | "Entendido, te comunico con nuestra coordinadora para gestionar la cancelación." |
| `no_interesa` | CORE | "Entendido, sin problema. Quedamos a tu disposición cuando lo necesites 🙌" |
| `despedida` | CORE | "¡Gracias por escribirnos! Quedamos atentos ante cualquier inquietud." |
| `queja` | CORE | "Lamento que hayas tenido una mala experiencia. Te comunico con un asesor para atenderte personalmente." |

### Caso especial: Inglés

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `english_response` | CORE | "Hi! Thank you for reaching out to GoDentist. We'd love to help you. Could you write in Spanish so we can assist you better? Or if you prefer, we can connect you with an advisor. 😊" |

### Follow-ups (timer)

| ID | Timer | Contenido |
|----|-------|-----------|
| `retoma_post_info` | L2 (2min) | "¿Te gustaría agendar tu valoración GRATIS? 😊" |
| `retoma_datos` | L1 (3min) | "Para completar tu cita me falta: {{campos_faltantes}}. ¿Me los compartes?" |
| `retoma_fecha` | L3 (2min) | "¿Para qué día te gustaría agendar tu valoración? 😊" |
| `retoma_horario` | L4 (2min) | "¿Te queda bien alguno de los horarios disponibles?" |
| `retoma_confirmacion` | L5 (3min) | "¿Confirmamos tu cita con los datos que me compartiste?" |

---

## 9. Flujo Flexible

### Regla principal

**Responder la pregunta PRIMERO, vender después.**

### Response track

```
Si intent es informacional:
  1. Enviar CORE del intent
  2. Si aplica, enviar COMP
  3. Si no se ha mostrado, enviar OPCIONAL (recordatorio_sin_compromiso)
  4. Timer L2 → si no responde → invitar_agendar

Si intent es acción:
  1. Sales track determina acción
  2. Response track envía plantilla de esa acción
```

### Preguntas durante captura

Si el cliente está en captura y pregunta info:
- Responder con plantilla CORE del intent
- NO repetir pedido de datos en el mismo turno
- Timer hace reevaluate (no reinicia)

### Intent combinado (mixto)

```
"Soy María López, 3001234567. ¿Cuánto cuesta una corona?"
```
1. Comprehension: intent=precio_servicio, datos={nombre, telefono}, category=mixto
2. State merge guarda datos
3. Response track: plantilla de precio
4. Sales track: evalúa gates, si falta sede → timer reevaluate
5. Retoma pedirá solo lo faltante

---

## 10. Casos Especiales

### Inglés
Comprehension detecta `idioma: 'en'` → plantilla `english_response`. Si insiste → `handoff`.

### Reagendamiento / Cancelación
Intent `reagendamiento` o `cancelar_cita` → `handoff` inmediato. Bot no gestiona cambios.

### Queja
Intent `queja` → `handoff` inmediato con mensaje empático.

### Urgencia
Intent `urgencia` → responder con sedes. NO handoff (quieren ir directo).

### Múltiples servicios
"¿Cuánto cuestan los brackets y la limpieza?" → enviar ambas plantillas CORE (max 3 mensajes por turno).

### Cliente ya agendado
Fase `appointment_registered` → responder preguntas informacionales normalmente, sin intentar agendar de nuevo.

---

## 11. Flujo Visual

```
Pregunta info → CORE + COMP + OPCIONAL → L2 (2min) → invitar_agendar
                                                            │
"Quiero agendar" ──→ pedir_datos (nombre, cel, sede) ──→ L1 (3min) → retoma_datos
                            │
                     datos OK ──→ pedir_fecha ──→ L3 (2min) → retoma_fecha
                                      │
                              fecha OK ──→ [Consulta Dentos] ──→ mostrar_disponibilidad ──→ L4 (2min) → retoma_horario
                                                                        │
                                                              elige horario ──→ confirmar_cita ──→ L5 (3min) → retoma_confirmacion
                                                                                      │
                                                                              "Sí" ──→ agendar_cita ✅
```

---

## 12. Resumen de Plantillas

| Categoría | Cantidad |
|-----------|----------|
| Saludo | 1 |
| Opcional universal | 1 |
| Precios (CORE) | 22 |
| Precios (COMP) | 14 |
| Informacionales (CORE) | 10 |
| Informacionales (COMP) | 5 |
| Flujo agendamiento | 9 |
| Escape / control | 6 |
| Caso inglés | 1 |
| Follow-ups | 5 |
| **TOTAL** | **~74** |
