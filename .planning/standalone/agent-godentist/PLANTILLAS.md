# Plantillas Agente GoDentist

> Todas las plantillas se almacenan en `agent_templates` con `agent_id = 'godentist'`.
> Se pueden modificar en cualquier momento sin deploy.

---

## SALUDO

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `saludo` | CORE | "¡Hola! Bienvenido a GoDentist, nuestra felicidad es verte sonreír 😊 ¿Deseas agendar tu cita de valoración GRATIS?" |

---

## OPCIONAL UNIVERSAL (acompaña respuestas de precio/info)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `recordatorio_sin_compromiso` | OPCIONAL | "Recuerda que puedes recibir tu cotización completa sin ningún tipo de compromiso 😊" |

---

## PRECIOS DE SERVICIOS

### Corona dental (309 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_corona` | CORE | "Las coronas en zirconio tienen un valor desde $700.000, elaboradas con materiales de la más alta calidad. En algunos casos puede requerir tratamientos previos que se determinan en la valoración." |
| `precio_corona_comp` | COMP | "Trabajamos con zirconio y disilicato de litio, todos nuestros tratamientos incluyen garantía ✅" |

### Prótesis dental (144 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_protesis` | CORE | "Las prótesis dentales inician desde $1.100.000. Cada prótesis se elabora a la medida del paciente para un ajuste perfecto." |
| `precio_protesis_comp` | COMP | "El valor puede variar según el tipo y los materiales. En la valoración te entregamos la cotización exacta para tu caso." |

### Alineadores dentales (132 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_alineadores` | CORE | "Los alineadores inician con escaneo y planificación digital por $600.000, colocación de attachments $300.000 por maxilar y cada alineador $125.000. Trabajamos con GoAligner, marca colombiana 🇨🇴" |
| `precio_alineadores_comp` | COMP | "La cantidad de alineadores depende de tu caso. En la valoración el especialista te da el plan completo con el número exacto." |

### Brackets convencionales (130 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_brackets_conv` | CORE | "El montaje de brackets convencionales tiene un valor de $550.000 (superior $275.000 + inferior $275.000). Los controles mensuales son de $90.000 cada uno." |
| `precio_brackets_conv_comp` | COMP | "El tratamiento incluye aproximadamente 24 controles. ¡Es la mejor opción para empezar tu camino a una sonrisa perfecta!" |

### Brackets zafiro

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_brackets_zafiro` | CORE | "Los brackets de zafiro tienen un montaje de $2.400.000 (superior $1.200.000 + inferior $1.200.000). Los controles son de $140.000 cada uno." |
| `precio_brackets_zafiro_comp` | COMP | "El zafiro es prácticamente invisible y muy resistente. ¡Ideal si buscas estética durante el tratamiento!" |

### Autoligado clásico

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_autoligado_clasico` | CORE | "La ortodoncia de autoligado clásico tiene un montaje de $1.400.000 ($700.000 + $700.000). Los controles son de $140.000 cada uno." |
| `precio_autoligado_clasico_comp` | COMP | "El sistema autoligado requiere menos citas de ajuste y puede acortar el tiempo de tratamiento." |

### Autoligado pro

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_autoligado_pro` | CORE | "La ortodoncia autoligado pro tiene un montaje de $2.400.000 ($1.200.000 + $1.200.000). Los controles son de $140.000 cada uno." |
| `precio_autoligado_pro_comp` | COMP | "Es nuestra línea premium de autoligado, con brackets de última generación para resultados más rápidos." |

### Autoligado cerámico

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_autoligado_ceramico` | CORE | "La ortodoncia autoligado cerámico tiene un montaje de $3.000.000 ($1.500.000 + $1.500.000). Los controles son de $140.000 cada uno." |
| `precio_autoligado_ceramico_comp` | COMP | "Combina la eficiencia del autoligado con la estética del cerámico. ¡Prácticamente no se nota!" |

### Implante dental (44 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_implante` | CORE | "Los implantes dentales tienen un valor desde $2.100.000. Trabajamos con marcas de prestigio mundial: Microdent, Neodent y Straumann." |
| `precio_implante_comp` | COMP | "Según tu caso puede requerirse tomografía, injerto de hueso o membrana. Todo se evalúa en la valoración." |

### Blanqueamiento dental (35 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_blanqueamiento` | CORE | "Manejamos diferentes protocolos de blanqueamiento: casero, en consultorio y combinado. El valor depende del tono actual y el aclaramiento que buscas." |
| `precio_blanqueamiento_comp` | COMP | "En la valoración el especialista evalúa tu tono y te recomienda el protocolo ideal con su cotización exacta." |

### Limpieza dental (26 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_limpieza` | CORE | "La limpieza premium tiene un valor de $160.000. Para pacientes con ortodoncia es de $90.000." |
| `precio_limpieza_comp` | COMP | "Se recomienda cada 6 meses, o cada 3-4 meses si tienes ortodoncia. ¡Tu sonrisa te lo agradece!" |

### Extracción simple (25 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_extraccion_simple` | CORE | "Las extracciones simples tienen un valor entre $115.000 y $175.000 según la complejidad." |

### Extracción muela del juicio

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_extraccion_juicio` | CORE | "La extracción de muela del juicio tiene un valor desde $225.000 por unidad según la complejidad del caso." |

### Diseño de sonrisa (24 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_diseno_sonrisa` | CORE | "El diseño de sonrisa tiene un valor desde $260.000 por diente, con correcciones en bordes incisales para una sonrisa armónica." |
| `precio_diseno_sonrisa_comp` | COMP | "Utilizamos tecnología digital para planificar tu sonrisa ideal antes de empezar. ¡Verás el resultado antes del tratamiento!" |

### Placa anti-ronquidos (13 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_placa_ronquidos` | CORE | "La placa anti-ronquido tiene un valor de $1.590.000. Es un dispositivo para apnea del sueño que te ayuda a descansar mejor a ti y a tu familia." |

### Calza / Resina (13 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_calza_resina` | CORE | "Las calzas en resina tienen un valor desde $120.000 en adelante según el tamaño de la restauración." |

### Rehabilitación oral (13 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_rehabilitacion` | CORE | "La rehabilitación oral es un tratamiento completamente personalizado. Utilizamos tecnología digital y robótica para los mejores resultados. El valor se define en la valoración según tu plan de tratamiento." |

### Radiografía panorámica (10 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_radiografia` | CORE | "La radiografía individual tiene un valor de $31.000. También tenemos el paquete de 9 fotos + 2 radiografías por $70.000." |

### Endodoncia (4 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_endodoncia` | CORE | "La endodoncia tiene un valor desde $430.000. Incluye radiografía periapical antes y después del procedimiento." |

### Carillas dentales (4 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_carillas` | CORE | "Las carillas en resina directa van desde $410.000/diente, en resina impresa desde $650.000/diente y en cerámica desde $1.600.000/diente." |
| `precio_carillas_comp` | COMP | "En la valoración el especialista te recomienda el material ideal según tu caso y expectativas." |

### Ortopedia maxilar (3 preguntas)

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `precio_ortopedia` | CORE | "La ortopedia maxilar tiene un valor desde $2.000.000. Se maneja con cuota inicial de $1.000.000 + 10 controles de $100.000." |
| `precio_ortopedia_comp` | COMP | "En algunos casos puede requerirse máscara de Petit ($200.000). El especialista te indica en la valoración." |

---

## INFORMACIONALES

### Valoración

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `valoracion_costo` | CORE | "¡La valoración es totalmente GRATIS! Incluye revisión completa con el odontólogo y tu plan de tratamiento personalizado con cotización." |
| `valoracion_costo_comp` | COMP | "Si hay especialistas disponibles, se hace interconsulta inmediata. Duración aproximada 15-30 minutos." |
| `valoracion_excepcion` | COMP | "La única excepción es la valoración de cirugía maxilofacial que tiene un costo de $200.000." |

### Financiación

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `financiacion_resumen` | CORE | "¡Tenemos opciones de financiación desde 3 hasta 36 cuotas! Trabajamos con Meddipay, Sistecrédito, Addi, Sumaspay y otros convenios. Solo necesitas tu cédula, no estar en Datacrédito y un dispositivo con internet." |
| `financiacion_medios_pago` | COMP | "También aceptamos Visa y Mastercard (crédito y débito), efectivo y transferencia a Bancolombia o BBVA. Si pagas de contado el día de la valoración, te damos un 5% de descuento 💪" |

### Ubicación

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `ubicacion` | CORE | "Contamos con 4 sedes para tu comodidad: Cabecera (Cll 52 #31-32), Mejoras Públicas (Cll 41 #27-63), Floridablanca (Cll 4 #3-06) y Cañaveral en CC Jumbo El Bosque. ¿Cuál te queda mejor?" |

### Horarios

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `horarios` | CORE | "Atendemos de lunes a viernes de 8:00am a 6:30pm y sábados de 8:00am a 12:00md. No abrimos domingos ni festivos." |
| `horarios_comp` | COMP | "La sede Cabecera los sábados tiene jornada continua hasta las 5:00pm." |

### Materiales

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `materiales` | CORE | "Trabajamos con materiales de la más alta calidad: coronas en zirconio y disilicato de litio, implantes Microdent/Neodent/Straumann, y alineadores GoAligner 🇨🇴" |

### Menores

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `menores` | CORE | "¡Sí, atendemos todas las edades! Los menores de edad deben asistir con un acompañante." |

### Seguros / EPS

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `seguros_eps` | CORE | "Somos clínica particular, no manejamos EPS ni seguros. Pero tenemos excelentes opciones de financiación desde 3 hasta 36 cuotas para que puedas acceder a tu tratamiento." |

### Urgencia

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `urgencia` | CORE | "¡Sí manejamos urgencias dentales! Te recomendamos acercarte lo antes posible a la sede más cercana." |
| `urgencia_comp` | COMP | "Nuestras sedes: Cabecera (Cll 52 #31-32), Mejoras Públicas (Cll 41 #27-63), Floridablanca (Cll 4 #3-06) y Cañaveral en CC Jumbo El Bosque." |

### Garantía

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `garantia` | CORE | "Sí manejamos garantía en nuestros tratamientos, sujeta a asistencia a controles y seguimiento fotográfico del proceso." |

### Objeción de precio

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `objecion_precio` | CORE | "Entiendo que quieras comparar. Nuestros precios reflejan la calidad de los materiales, la experiencia profesional y el seguimiento completo del tratamiento. Ofrecemos resultados confiables y con garantía ✅" |

---

## FLUJO DE AGENDAMIENTO

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `pedir_datos` | CORE | "¡Excelente! Para agendarte tu valoración GRATIS necesito: tu nombre completo, número de celular y la sede de tu preferencia: Cabecera, Mejoras Públicas, Floridablanca o Cañaveral." |
| `pedir_datos_parcial` | CORE | "Para completar tu agendamiento me falta: {{campos_faltantes}}." |
| `confirmar_cita` | CORE | "Perfecto, confirmo tus datos:\n• Nombre: {{nombre}}\n• Teléfono: {{telefono}}\n• Sede: {{sede_preferida}}\n¿Todo correcto?" |
| `cita_agendada` | CORE | "¡Listo, quedas agendado/a! 🎉 Nuestro equipo te contactará para confirmar fecha y hora. Si necesitas reagendar, escríbenos con tiempo." |
| `invitar_agendar` | CORE | "¿Te gustaría agendar tu valoración GRATIS? 😊" |

---

## ESCAPE / CONTROL

| ID | Prioridad | Contenido |
|----|-----------|-----------|
| `handoff` | CORE | "Te comunico con un asesor para atenderte personalmente. En un momento te contactan 🙌" |
| `reagendamiento` | CORE | "Para reagendar tu cita te comunico con nuestra coordinadora. Ella te ayudará con la nueva fecha." |
| `cancelar_cita` | CORE | "Entendido, te comunico con nuestra coordinadora para gestionar la cancelación." |
| `fuera_horario` | CORE | "En este momento estamos fuera del horario de atención. Tomo tus datos y te contactamos el siguiente día hábil 📞" |
| `no_interesa` | CORE | "Entendido, sin problema. Quedamos a tu disposición cuando lo necesites 🙌" |
| `despedida` | CORE | "¡Gracias por escribirnos! Quedamos atentos ante cualquier inquietud." |

---

## FOLLOW-UPS (timer)

| ID | Timer | Contenido |
|----|-------|-----------|
| `retoma_post_info` | L2 (2min) | "¿Te gustaría agendar tu valoración GRATIS? 😊" |
| `retoma_datos` | L1 (3min) | "Para completar tu cita me falta: {{campos_faltantes}}. ¿Me los compartes?" |
| `retoma_confirmacion` | L3 (5min) | "¿Confirmamos tu cita con los datos que me compartiste?" |
| `retoma_final` | L0 (5min) | "¡Hola! Seguimos a tu disposición. ¿Te gustaría agendar tu valoración GRATIS?" |

---

## RESUMEN

| Categoría | Cantidad |
|-----------|----------|
| Saludo | 1 |
| Opcional universal | 1 |
| Precios (CORE) | 21 |
| Precios (COMP) | 14 |
| Informacionales (CORE) | 11 |
| Informacionales (COMP) | 7 |
| Flujo agendamiento | 5 |
| Escape / control | 6 |
| Follow-ups | 4 |
| **TOTAL** | **70** |
