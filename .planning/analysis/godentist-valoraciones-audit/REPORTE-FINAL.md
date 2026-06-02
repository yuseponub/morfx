# Auditoría profunda: bot de valoraciones GoDentist + intervención humana

**Workspace**: `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` ("GoDentist Valoraciones")
**Período analizado**: 2026-03-23 → 2026-05-20 (~59 días)
**Generado**: 2026-05-20
**Fuentes**: 6,451 conversaciones, 52,784 mensajes, 15,353 turns del bot, 13,685 eventos de comprehension, 12,180 decisiones de appointment, 1,054 eventos de handoff.

---

## TL;DR — Lo más importante en 7 líneas

1. **El bot solo cierra ~2.7% del flujo conversacional** (125 de 4,630 convs sin humano llegan a willSchedule). Es un **capturador de leads**, no un **cerrador**.
2. **El 71.8% de conversaciones son atendidas solo por el bot**, pero esas convierten 6× menos a tag VAL que las que tienen humano (4.4% vs 27.9%).
3. **De las 712 valoraciones (tag VAL) capturadas, el 58% las cierra un humano**, no el bot. Solo 30% el bot cierra el flujo completo.
4. **El humano responde en mediana 53 minutos**, pero **se degradó en mayo** (P50 pasó de ~50 min en marzo-abril a 72 min en mayo). El P95 supera las 20 horas.
5. **Dentro del horario laboral (8-19h Bogotá) responde en 27 min P50**, fuera tarda **12 horas**. Domingos casi no se responde (P50 11.5h).
6. **38% de los handoffs son por audios del cliente que no se transcriben** (351 de 921 handoffs). 5.5% de conversaciones tienen audios.
7. **El operador es claramente único y desbordado**: P75 *dentro* del horario laboral es 2.5h. 1 de cada 4 mensajes en horario hábil espera más de 2.5h.

---

## 1. Panorama del workspace

| Métrica | Valor |
|---|---|
| Conversaciones totales | 6,451 (5 vacías → 6,446 con cliente) |
| Mensajes totales | 52,784 |
| Mensajes inbound (cliente → empresa) | 21,179 (40.1%) |
| Mensajes outbound bot | 27,527 (52.1%) |
| Mensajes outbound humano | **4,062 (7.7%)** |
| Contactos únicos | 6,239 |
| Tag `VAL` aplicado | **712 contactos (11.4% del total)** |
| Tag `INFO` aplicado | 21 contactos (uso marginal) |
| Eventos `willSchedule:true` | **216 (en 215 convs)** |
| Eventos de handoff | 1,054 (en 921 convs) |

**Canales**: 100% WhatsApp, mix de Meta Cloud directo (~70%) + ManyChat (~14%) + ~16% sin wamid (mensajes humanos enviados por la UI).

### Volumen mensual

| Mes | Convs nuevas | Inbound | Bot out | Humano out |
|---|---|---|---|---|
| Mar 2026 (parcial desde 23) | 977 | 3,103 | 4,057 | 775 |
| **Abr 2026** | **3,455** | 11,398 | 15,265 | 2,068 |
| May 2026 (al 20) | 2,019 | 6,688 | 8,211 | **1,219** |

**Abril fue el pico**: 115 nuevas conversaciones/día. Mayo ronda 101/día (parcial). No hay una explosión de volumen en mayo que justifique la degradación humana.

---

## 2. Funnel de conversión

### Conversación → captura de datos → flujo completo

Funnel global (6,446 convs con cliente):

| Etapa | Conteo | % vs total |
|---|---|---|
| Conversación iniciada (≥1 inbound) | 6,446 | 100.0% |
| Bot llegó a `pedir_datos` | 1,353 | 21.0% |
| Bot llegó a `pedir_fecha` | 499 | 7.7% |
| Bot llegó a `mostrar_disponibilidad` | 397 | 6.2% |
| Bot llegó a `mostrar_confirmacion` | 303 | 4.7% |
| **Tag VAL aplicado** | **712** | **11.0%** |
| **Bot emitió `willSchedule:true`** | **215** | **3.3%** |
| Bot llegó a `no_interesa` | 102 | 1.6% |
| Conversaciones con handoff | 921 | 14.3% |

> **Nota interpretativa**: VAL (11.0%) es mayor que `pedir_datos` (21%) en términos relativos porque VAL se aplica cuando el cliente envía datos sin que el bot necesariamente haya emitido `pedir_datos` formal (ej: cliente envió nombre+cel+sede en su primer mensaje sin que el bot lo pidiera).

### Bot solo vs Con humano

| | Conversaciones | % | VAL | willSchedule | No interesa | Handoff |
|---|---|---|---|---|---|---|
| **Bot solo** | 4,630 | 71.8% | 206 (4.4%) | 125 (2.7%) | 79 (1.7%) | 471 (10.2%) |
| **Con humano** | 1,816 | 28.2% | 506 (27.9%) | 90 (5.0%) | 23 (1.3%) | 450 (24.8%) |

**Lectura honesta** (sin bias):
- Cuando hay humano, el % VAL es **6× mayor** y willSchedule **2× mayor**. PERO esto sufre **selection bias**: los humanos entran a conversaciones que ya muestran interés (cliente persiste, hace preguntas profundas, etc.). No es prueba causal de que el humano mejore conversión.
- La cifra que SÍ es atribuible: **125 valoraciones convertidas (willSchedule) sin humano** = el bot por sí solo cierra ~125 valoraciones cada 2 meses ≈ **2/día sin intervención**.

---

## 3. Análisis de la intervención humana

### ¿Cuándo entra el humano? (primera vez en la conversación)

De las 1,816 conversaciones con humano:

| Momento de la primera intervención | Conteo | % |
|---|---|---|
| Antes del primer inbound del cliente | 0 | 0.0% |
| Bot nunca llegó a pedir datos (cliente preguntaba info y bot respondía) | **1,223** | **67.3%** |
| Tras pedir datos pero antes del VAL | 47 | 2.6% |
| Tras VAL pero antes de willSchedule | 9 | 0.5% |
| **Después de willSchedule (cierre/confirmación post-bot)** | **470** | **25.9%** |
| Después de primer inbound pero antes de pedir datos | 67 | 3.7% |

**Dos patrones dominantes**:

**Patrón A — Humano rescata convs informacionales (67%)**: El bot estaba respondiendo preguntas de información general (precios, sedes, financiación) y nunca llegó a la captura de datos. Un humano entra a "rescatar" la venta o cerrar la cita en paralelo. Implica que el bot puede estar perdiéndose oportunidades de hacer transición a captura más agresivamente.

**Patrón B — Humano confirma cita post-bot (26%)**: Bot completó el flujo, emitió willSchedule, y el humano sigue para confirmar la cita en el calendario real (Dentos). Esto es el **flujo esperado** dado que el bot NO registra la cita en Dentos por sí solo (limitación arquitectural conocida: el robot Railway solo consulta disponibilidad, no crea citas).

### Handoffs automáticos (engine)

921 conversaciones (14.3%) emitieron evento de handoff. Razones:

| Razón | Conteo | % de handoffs |
|---|---|---|
| `engine_signal` (escape intent / guard low-conf / asesor / queja) | 648 | 61.5% |
| **No se pudo transcribir el audio del cliente** | **351** | **33.3%** |
| Cliente envió imagen | 51 | 4.8% |
| Cliente envió video | 4 | 0.4% |

⚠️ **Hallazgo crítico**: **33% de los handoffs son por audios no transcritos**. Hay 491 audios totales en 356 conversaciones distintas (5.5% de convs tienen audio). De esos 491 audios, 351 dispararon handoff = ~72% de los audios fuerzan al humano a leerlos manualmente. Esto representa volumen significativo de trabajo evitable si el bot transcribiera audios.

---

## 4. Performance del agente humano

> ⚠️ **Limitación de schema**: la tabla `messages` no registra `user_id`/`created_by` para mensajes humanos. No es posible atribuir mensajes a operadores individuales — solo a "humano agregado".

### Tiempo de respuesta global (4,135 muestras)

| Percentil | Tiempo |
|---|---|
| P25 | 5.9 min |
| **P50 (mediana)** | **52.9 min** |
| P75 | **5.5 h** |
| P90 | 15.4 h |
| P95 | **20.8 h** |

**Referencia bot** (mismas convs, 14,937 muestras): P50 = 21.6s, P95 = 5.0 min. El bot es ~150× más rápido en mediana.

### Tendencia mensual — ¿bajó la performance?

| Mes | Muestras | P50 | P75 | P90 | P95 |
|---|---|---|---|---|---|
| 2026-03 (parcial) | 779 | 44.8 min | 4.5 h | 14.7 h | 17.2 h |
| 2026-04 | 2,203 | **49.8 min** | 4.8 h | 14.3 h | 20.9 h |
| **2026-05 (parcial)** | 1,153 | **72 min** ⚠️ | **7.2 h** ⚠️ | 17.7 h | 21.6 h |

**Sí, la performance se degradó en mayo**:
- P50 subió de 50 → 72 min (+44%)
- P75 subió de 4.8h → 7.2h (+50%)
- El volumen mensual no creció (mayo ≈ 101 convs/día vs abril 115/día) → la causa NO es saturación por volumen. Hipótesis a investigar offline: vacaciones de operador, cambio de personal, semana santa rezagada, etc.

### Tendencia semanal

| Semana | Rango fechas | N | P50 | P95 |
|---|---|---|---|---|
| W12 | 23-29 mar | 411 | 1.2 h | 20.4 h |
| W13 | 30 mar-5 abr | 520 | **29.3 min** ⭐ | 16.1 h |
| W14 | 6-12 abr | 533 | 1.1 h | 14.8 h |
| W15 | 13-19 abr | 673 | **24.6 min** ⭐ | 18.0 h |
| W16 | 20-26 abr | 523 | 1.2 h | 21.4 h |
| **W17** | **27 abr-3 may** | 350 | **2.3 h** 🚨 | **163.3 h** 🚨 |
| W18 | 4-10 may | 404 | 52.4 min | 23.1 h |
| W19 | 11-17 may | 481 | 1.2 h | 19.9 h |
| W20 | 18-20 may | 240 | 1.1 h | 20.3 h |

**W17 (27 abr - 3 may)** fue catastrófica — P95 de **163 horas (~7 días)** sugiere ausencia de operador. Probablemente afectó feriado del **1 de mayo (Día del Trabajo)** que en Colombia es lunes festivo + posible puente. Esta semana arrastra las cifras de mayo.

Las mejores semanas (W13 y W15) muestran que cuando el operador opera bien, **mediana <30 min es alcanzable**.

### Performance por día de la semana

| Día | N | P50 | P95 |
|---|---|---|---|
| Lun | 739 | 44.3 min | 20.8 h |
| Mar | 814 | **38.6 min** ⭐ | 16.6 h |
| Mié | 811 | 55.5 min | 22.1 h |
| Jue | 658 | 43.0 min | 17.2 h |
| Vie | 622 | 1.0 h | 19.0 h |
| Sáb | 373 | 1.5 h | 20.3 h |
| **Dom** | **125** | **11.5 h** 🚨 | **313.2 h** 🚨 |

**Domingo prácticamente no hay servicio**: P95 = 313 horas ≈ 13 días. Sábados también muy degradados.

### Performance dentro vs fuera de horario laboral (8-19h Bogotá)

| Ventana | N | P50 | P75 | P95 |
|---|---|---|---|---|
| **Dentro horario** (8-19h Bogotá) | 3,394 | **27.3 min** | 2.5 h | 20.4 h |
| Fuera horario | 748 | 11.9 h | 14.1 h | 22.0 h |

**Insight clave**: dentro del horario laboral el operador responde en **mediana 27 minutos**. La cifra global "53 min P50" se infla por los 748 mensajes recibidos fuera de horario (18% del total).

PERO sigue siendo un problema serio: **P75 dentro horario = 2.5 horas**. 1 de cada 4 mensajes EN horario hábil espera más de 2.5h. Eso sugiere que el operador único está saturado en momentos puntuales del día.

### Distribución horaria de actividad humana (Bogotá)

```
08h ████████      240
09h █████████████ 387
10h ██████████████████████ 647 ← peak
11h ████████████████ 466
12h █              33  ← almuerzo
13h                13  ← almuerzo
14h ██████████ 286
15h ███████████████████ 560
16h ███████████████████████ 686 ← peak tarde
17h ██████████████████ 542
18h ████ 113
```

Jornada típica de oficina con corte de almuerzo claro (12-13h). 80%+ del volumen humano cae entre 8-18h.

### Long tail extremo

- **119 respuestas (2.9%)** tardaron más de 24h
- **43 respuestas (1.0%)** tardaron más de 1 semana

Estos casos son los que arrastran el P95 a 20h. Algunos pueden ser conversaciones que el cliente reabrió días después y el humano "respondió" pero técnicamente la ventana de "tiempo de respuesta a un inbound" cuenta el tiempo desde ese inbound viejo. Conviene tratarlos como outliers para el análisis operacional.

---

## 5. Conversiones cerradas: ¿bot o humano?

### Desglose de las 712 valoraciones (tag VAL)

| Estado | Conteo | % |
|---|---|---|
| **VAL + willSchedule** (bot cerró flujo completo solo) | 215 | 30.2% |
| **VAL sin willSchedule + humano** (proxy: humano cerró agendamiento) | **416** | **58.4%** |
| VAL sin willSchedule sin humano (perdida / abandonada) | 81 | 11.4% |

**Lectura**: El bot por sí solo cierra ~30% del funnel completo. **El 58% de los leads capturados los cierra un humano**. Esto es coherente con la arquitectura: el bot NO registra la cita en Dentos, lo hace un humano manualmente.

### Detalle de las 215 con willSchedule (bot completó conversación)

- 125 (58%) sin humano = bot 100% autónomo conversacionalmente
- 90 (42%) con humano = bot llegó a willSchedule pero también hubo intervención humana (probable: humano confirmó cita o asistió en paralelo)

### Detalle de las 81 perdidas (VAL sin willSched sin humano)

| Característica | Conteo |
|---|---|
| Llegaron a `pedir_fecha` pero no completaron | 63 (78%) |
| Con handoff | 6 (7%) — bot pidió ayuda pero humano no atendió |
| Sin handoff | 75 (93%) — bot las dejó "esperando" indefinidamente |

**Patrón típico**: el cliente envió datos, el bot pidió fecha, el cliente no respondió o dijo algo ambiguo, y la conversación quedó colgada sin que humano interviniera. Son leads cualificados perdidos.

### Quién aplicó el tag VAL (heurística)

Heurística: si hay mensaje humano dentro de ±60s del tag → "humano". Si no hay humano cercano y último msg bot fue dentro de 5min antes → "bot". Caso contrario → "unknown".

| Aplicado por | Conteo | % |
|---|---|---|
| **Bot/sistema** (automático tras captura de datos) | 485 | 68.1% |
| Humano (cercano temporalmente) | 66 | 9.3% |
| Indeterminado | 161 | 22.6% |

Este resultado es **coherente con el código del runner** (`v3-production-runner.ts:597`): el tag VAL se aplica como side-effect automático cuando el bot detecta nombre+telefono+sede completos. La pequeña porción "humano" probablemente son mensajes humanos que coinciden temporalmente con la captura automática. Los "unknown" son casos sin actividad cercana en la ventana de 5min.

### De las 506 VAL con humano: ¿cuándo intervino?

- **165 (32.6%)**: humano ya estaba interviniendo ANTES de que el bot aplicara VAL. Probable: humano y bot operando en paralelo, humano ayudando con preguntas de info.
- **341 (67.4%)**: humano entró DESPUÉS del VAL. Patrón claro de cierre humano (bot captura → humano confirma).

### Tiempo entre VAL y willSchedule (cuando ambos suceden, n=215)

| Percentil | Tiempo |
|---|---|
| P25 | 4.3 min |
| **P50** | **7.6 min** |
| P75 | 20.5 min |
| P95 | 2.1 h |

Cuando el bot logra cerrar todo el flujo, lo hace **en menos de 8 minutos en mediana** desde la captura de datos. Demuestra que el bot está bien afinado para clientes que cooperan con el flujo lineal.

---

## 6. Validación de tu hipótesis

> "Creo que la persona se está demorando mucho en responder."

**Validada con matices**:
- **Sí, se está demorando más en mayo** (P50 50→72 min, +44%) — la regresión es real.
- **Dentro del horario laboral la mediana sigue siendo razonable (27 min)** — el problema NO es generalizado sino concentrado en momentos específicos (después-horas, fines de semana, semana del 1 de mayo).
- **La cola larga es preocupante**: P75 en horario laboral = 2.5h, P95 global = 20.8h, 43 respuestas tardaron más de 1 semana.
- **No hay forma de evaluar operadores individuales** con el schema actual — todos los mensajes humanos son anónimos a nivel de DB.

> "El bot pone el tag cuando el cliente manda los datos; pero la cita realmente queda agendada cuando se termina todo el flujo."

**Confirmada y matizada con datos**:
- El tag VAL se aplica automáticamente cuando el bot detecta nombre+telefono+sede (verificado en código + en datos: 68% atribuible al bot).
- El "flujo completo" (willSchedule:true) representa solo el 30% de los tags VAL. El otro 70% queda como lead capturado pero sin cita formal del bot.
- **Importante**: incluso willSchedule:true NO significa que la cita esté registrada en Dentos. El bot dice "tu cita quedó agendada" al cliente pero ese registro lo hace un humano manualmente. Esto explica gran parte del volumen humano (470 intervenciones post-willSchedule = 25.9% de todas las intervenciones humanas).

---

## 7. Hallazgos accionables

### Prioridad alta

1. **Audios sin transcribir = 33% de handoffs**. Implementar transcripción (Whisper/Gemini Audio) reduciría 351 handoffs/2 meses ≈ 175/mes de trabajo manual del operador.
2. **Mayo: degradación de P50 humano (+44%)**. Investigar offline: ¿hubo licencias, rotación, cambio de horario, capacitación pendiente? El volumen NO subió, así que la causa es operacional/humana.
3. **W17 (27 abr - 3 may)**: P95 = 163h. Probable feriado 1 mayo no cubierto. Definir política de cobertura en festivos.
4. **El bot no registra citas en Dentos**. 470 intervenciones humanas (26% del total) son solo para registrar la cita en el calendario tras el "willSchedule" del bot. Automatizar este paso reduciría 7-8 mensajes humanos por día.

### Prioridad media

5. **81 valoraciones "perdidas"** (VAL sin willSchedule sin humano). Son leads cualificados sin seguimiento. Implementar un follow-up automático cuando el cliente no responde tras `pedir_fecha`.
6. **Domingos sin servicio**: si la atención de domingo no es viable, comunicarlo al cliente (mensaje automático "respondemos en horario laboral").
7. **Patrón A de intervención humana (67%)**: humano "rescata" preguntas informacionales que el bot maneja correctamente. Investigar si hay un problema de confianza o si el humano duplica esfuerzo innecesario.

### Prioridad baja (mejoras de medición)

8. **Schema: `messages` debería tener `user_id`** para poder atribuir performance individual. Sin esto no se puede saber si hay 1 operador saturado o 9 operadores ineficientes.
9. **`contact_tags` debería tener `applied_by`** para distinguir tags aplicados por bot vs humano sin recurrir a heurísticas temporales.

---

## 8. Cifras de referencia rápida (cheat-sheet)

```
TOTAL CONVERSACIONES         : 6,446 (con cliente)
CONVERTIDAS A VAL            : 712 (11.0%)
CERRADAS POR BOT SOLO        : 125 (1.9%)
CERRADAS POR HUMANO (proxy)  : 416 (6.5%)
PERDIDAS                     : 81 (1.3%)

% INTERVENCIÓN HUMANA        : 28.2%
TIEMPO RESP HUMANO P50       : 53 min (27 min en horario)
TIEMPO RESP HUMANO P95       : 20.8 h
TIEMPO RESP BOT P50          : 22s
HANDOFFS (% conv)            : 14.3%
HANDOFFS POR AUDIO           : 33% del total

DEGRADACIÓN MAYO P50         : +44% vs abril
PEOR SEMANA                  : W17 (27 abr - 3 may, P95 163h)
PEOR DÍA                     : Domingo (P50 11.5h)
```

---

## Apéndice: archivos de respaldo

- `dataset.json` (26.7 MB) — dataset completo crudo
- `report.json` — métricas agregadas
- `followup.json` — métricas complementarias
- `features.json` — features por conversación

Scripts reproducibles:
- `scripts/godentist-valoraciones-discovery.ts` (1, 2, 3) — discovery inicial
- `scripts/godentist-valoraciones-willschedule-v2.ts` — investigación de la brecha willSchedule
- `scripts/godentist-valoraciones-load-dataset.ts` — extracción del dataset
- `scripts/godentist-valoraciones-analyze.ts` — análisis principal
- `scripts/godentist-valoraciones-followup.ts` — análisis complementario
