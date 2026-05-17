/**
 * Few-shots de calibración del responseConfidence + binary backstop para Gemini Flash
 * (Plan 04 Wave 3 — Standalone somnio-v4-rag-generative).
 *
 * Aplicación de M1+M2+M3+M4 (RESEARCH A1) sobre la calibración base D-17:
 *
 * - **M1** (probability framing): el prompt usa "¿Cuál es la PROBABILIDAD de que un
 *   compañero humano experto en Somnio diría que tu respuesta es completa y NO requiere
 *   consultarlo con un humano?" — wired en buildGenerationPrompt (prompt.ts). El framing
 *   de estos few-shots es coherente: cada `rationale` justifica el confidence asignado
 *   en términos de "qué tan probable es que un experto la apruebe".
 *
 * - **M2** (escala discretizada): confidence ∈ {0.20, 0.40, 0.60, 0.80, 0.95} — SOLO
 *   5 valores. NO usar intermedios (0.42, 0.67, 0.89). Reduce anchoring noise y da
 *   buckets claros al modelo.
 *
 * - **M3** (binary enum backstop): cada few-shot incluye `binary` ∈ {RESPONDE_BIEN,
 *   FALTA_INFO, FUERA_SCOPE}. El orchestrator dispara handoff si binary ∈ {FALTA_INFO,
 *   FUERA_SCOPE} aún si responseConfidence ≥ 0.70 — wired en sub-loop/index.ts (Plan 03).
 *
 * - **M4** (cobertura del rango completo): 10 few-shots, 2 por cada uno de los 5 buckets,
 *   derivados del corpus REAL (18 KBs reescritos en Plan 02 + 17 casos del Smoke A en
 *   STATUS.md líneas 44-89). NO genéricos ni inventados.
 *
 * **Idioma:** español original del corpus (Don't Hand-Roll RESEARCH — NO traducir).
 * **Tono:** Somnio (cálido pero firme, "tú", 2-4 oraciones, sin emojis, sin moralismo,
 * sin "te derivo/te paso/asesor humano").
 *
 * Casos derivados de:
 * - product/como_se_toma.md (case 6 Smoke A — confidence 0.95)
 * - product/dependencia.md (case 9 Smoke A — confidence 0.95)
 * - policies/envio.md (case 10 Smoke A — confidence 0.80)
 * - edge-cases/interaccion_alcohol.md (case 1 Smoke A — confidence 0.80)
 * - faqs-no-templated/alternativas_naturales.md (case 14 Smoke A — confidence 0.60)
 * - edge-cases/insomnio_largo_plazo.md (variante — confidence 0.60)
 * - product/contraindicaciones.md (case 5 Smoke A "lupus" — confidence 0.40)
 * - edge-cases/interaccion_medicamentos.md (variante "escitalopram" — confidence 0.40)
 * - policies/envio.md (case 16 Smoke A "Miami" — confidence 0.20)
 * - policies/pago.md (case 17 Smoke A "criptomonedas" — confidence 0.20)
 */
import type { FewShot } from './prompt'

export const FEW_SHOTS: FewShot[] = [
  // === BUCKET 0.95 (cobertura total — material cubre directo y completo) ===
  {
    pregunta: '¿cómo se toma?',
    material: `[Hechos] ELIXIR DEL SUEÑO se presenta en comprimidos (no gotas, no jarabe). La dosis estándar es 1 comprimido diario, 30 minutos antes de acostarse, pasándolo con agua. El comprimido se traga entero — no se mastica, no se chupa, no se disuelve. La consistencia con la hora cada noche favorece que el cuerpo se vaya acostumbrando al ritmo del sueño.
[Posición] La dosis de 1 comprimido diario es estándar para población adulta sana. Cualquier ajuste debe consultarse con el médico tratante.
[Debe contener] [SIEMPRE] Indicar dosis: 1 comprimido diario, 30 minutos antes de acostarse, pasado con agua. [SIEMPRE] Aclarar que se traga entero (no se mastica, no se disuelve). [SIEMPRE] Mencionar consistencia con la hora cada noche.
[NUNCA decir] recomendar dosis distinta a 1 comprimido diario; recomendar masticar, chupar o disolver; describir el producto como "gotas".
[Cuándo escalar] cliente con condición médica preexistente pregunta por dosis específica.`,
    respuesta: 'Tomás 1 comprimido cada noche, unos 30 minutos antes de acostarte, pasado con un vaso de agua. Se traga entero, no se mastica ni se disuelve. Lo importante es ser consistente con la hora cada noche para que el cuerpo se vaya acostumbrando al ritmo del sueño.',
    confidence: 0.95,
    rationale: 'El material cubre directo y completo la pregunta: dosis, momento, forma de tragarlo y consistencia están explícitos en [SIEMPRE].',
    binary: 'RESPONDE_BIEN',
  },
  {
    pregunta: '¿es adictivo?',
    material: `[Hechos] ELIXIR DEL SUEÑO contiene melatonina (10mg) — una sustancia que el cuerpo humano produce de forma natural para regular el ciclo del sueño — y citrato de magnesio (50mg). En las dosis recomendadas, no genera dependencia farmacológica como sí ocurre con benzodiacepinas u otros sedantes recetados.
[Posición] El producto está pensado para uso por temporadas, no de por vida. Cuando el ciclo del sueño se regula, el cuerpo lo sostiene solo. NO comparamos favorablemente con benzodiacepinas u otros recetados.
[Debe contener] [SIEMPRE] Aclarar que NO genera dependencia farmacológica en dosis recomendadas. [SIEMPRE] Explicar que la melatonina es una sustancia que el cuerpo produce naturalmente. [SIEMPRE] Mencionar que el producto busca regular el ritmo del sueño.
[NUNCA decir] garantizar "cero efectos en todas las personas"; afirmar que es imposible generar tolerancia individual; compararlo favorablemente con benzodiacepinas.
[Cuándo escalar] cliente con antecedentes confirmados de adicciones pide protocolo específico.`,
    respuesta: 'No genera dependencia farmacológica en las dosis recomendadas. La melatonina es una sustancia que tu cuerpo ya produce de forma natural para regular el ciclo del sueño — el producto la acompaña, no la reemplaza. La idea es usarlo por temporadas: una vez que el ritmo del sueño se regula, el cuerpo lo sostiene solo.',
    confidence: 0.95,
    rationale: 'El material responde directo y completo con [SIEMPRE] cubriendo los 3 puntos clave (no dependencia, melatonina natural, regula ritmo).',
    binary: 'RESPONDE_BIEN',
  },

  // === BUCKET 0.80 (cobertura alta con leve adaptación) ===
  {
    pregunta: '¿cuánto tarda a Medellín?',
    material: `[Hechos] ELIXIR DEL SUEÑO se despacha a todo Colombia. Tiempos varían según la ciudad:
- Día siguiente (transportadora): Medellín y área metropolitana (Bello, Itagüí, Envigado, Sabaneta, La Estrella, Caldas, Copacabana, Girardota, Barbosa), Cali y área metropolitana, Barranquilla y área, Soacha, Chía, Cajicá, Zipaquirá.
NO existe cobertura internacional — solo Colombia.
[Posición] Los tiempos son estimados de la transportadora, excepto para mismo-día dentro del horario de corte.
[Debe contener] [SIEMPRE] Confirmar que despachamos a Colombia. [SI APLICA] Si el cliente menciona su ciudad → ubicarla en el rango correspondiente (mismo día / día siguiente / 1-3 días / 2-4 días). [SI APLICA] Si pide fecha exacta → aclarar que los tiempos son estimados (no garantizados) excepto mismo-día dentro del horario.
[NUNCA decir] prometer fechas exactas de entrega fuera del mismo-día; garantizar entrega en zonas rurales sin confirmar.
[Cuándo escalar] cliente reporta retraso del pedido vs estimado entregado.`,
    respuesta: 'A Medellín llega al día siguiente vía transportadora, contando desde que se despacha. Igual te recuerdo que el tiempo de transportadora es un estimado: lo más normal es al día siguiente, pero podría variar un poquito según la operación.',
    confidence: 0.80,
    rationale: 'El material lista Medellín explícitamente en "día siguiente"; leve adaptación al tono conversacional + caveat de estimado.',
    binary: 'RESPONDE_BIEN',
  },
  {
    pregunta: '¿puedo si tomo alcohol?',
    material: `[Hechos] La melatonina puede potenciar el efecto sedante del alcohol y causar somnolencia excesiva o malestar al día siguiente. Ambos compuestos son depresores del sistema nervioso central (SNC). El ELIXIR DEL SUEÑO contiene melatonina (10mg) + citrato de magnesio (50mg).
[Posición] NO recomendamos combinar el ELIXIR DEL SUEÑO con alcohol. La empresa prioriza seguridad sobre conveniencia. Si el cliente bebió en una ocasión social, la recomendación es saltarse la dosis esa noche y retomar al día siguiente.
[Debe contener] [SIEMPRE] Recomendación explícita de NO combinar con alcohol. [SIEMPRE] Mención breve del mecanismo (potencia sedación / depresor SNC) sin tecnicismos. [SI APLICA] Si menciona "ya bebí" → instruir saltarse la dosis esa noche.
[NUNCA decir] aprobar combinación con alcohol; minimizar el riesgo ("una cerveza no afecta"); recomendar "tomar más para dormir más rápido si bebiste".
[Cuándo escalar] cliente insiste en combinar tras la advertencia.`,
    respuesta: 'No te recomendamos combinarlo con alcohol. La melatonina puede potenciar el efecto sedante porque ambos son depresores del sistema nervioso, y eso puede dejarte con somnolencia excesiva o malestar al otro día. Si ya bebiste esta noche, saltate la dosis y la retomás mañana con normalidad.',
    confidence: 0.80,
    rationale: 'Material directo cubre el caso alcohol con regla clara; leve adaptación de tono al manejar el "ya bebí" preventivamente.',
    binary: 'RESPONDE_BIEN',
  },

  // === BUCKET 0.60 (cobertura parcial — el caso es subjetivo o requiere extrapolación) ===
  {
    pregunta: '¿qué hábitos ayudan a dormir mejor?',
    material: `[Hechos] Hábitos naturales bien documentados que favorecen un mejor sueño y son complementarios al uso de ELIXIR DEL SUEÑO (no excluyentes):
- Evitar pantallas 30 minutos antes de acostarse
- Mantener una hora fija para dormir cada noche
- Cenas livianas y al menos 1-2 horas antes de acostarse
- Reducir cafeína después de las 2 pm
- Ambiente oscuro, temperatura templada, ruido controlado
[Posición] Recomendamos combinar el producto con buenos hábitos de higiene del sueño. NO presionamos la venta si el cliente ya está bien con sus hábitos.
[Debe contener] [SIEMPRE] Listar al menos 3 hábitos de higiene del sueño. [SIEMPRE] Posicionar el producto como complementario a los hábitos, no como reemplazo.
[NUNCA decir] recomendar otros productos consumibles (manzanilla, valeriana, tilo); descartar hábitos saludables como inferiores al producto.
[Cuándo escalar] cliente reporta haber probado todos los hábitos y aún no duerme tras varias semanas.`,
    respuesta: 'Te ayudan varios hábitos sencillos: mantener una hora fija para acostarte cada noche, evitar pantallas los 30 minutos previos y reducir cafeína después de las 2 pm. También cenar liviano 1-2 horas antes de dormir y un ambiente oscuro y fresco hacen mucha diferencia. El ELIXIR DEL SUEÑO funciona mejor cuando lo combinás con esos hábitos.',
    confidence: 0.60,
    rationale: 'El material lista hábitos generales pero la pregunta del cliente es subjetiva — la respuesta cubre bien lo general pero no garantiza el caso particular del cliente.',
    binary: 'RESPONDE_BIEN',
  },
  {
    pregunta: 'llevo 3 semanas sin dormir bien, ¿qué me recomiendas?',
    material: `[Hechos] ELIXIR DEL SUEÑO es un suplemento natural a base de melatonina (10mg) + citrato de magnesio (50mg) pensado para acompañar el ritmo del sueño en población adulta sana. NO es un medicamento recetado para insomnio crónico ni reemplaza fármacos como zolpidem, clonazepam o alprazolam.
[Posición] Para casos de insomnio crónico que ya están en tratamiento con medicación recetada, recomendamos un protocolo de bajada paulatina (~15 días por escalón). Casos con componente de salud mental severo (depresión, ansiedad aguda, ideación negativa) NO se atienden por chat — se escalan a humano.
[Debe contener] [SIEMPRE] Empezar con empatía breve. [SIEMPRE] NO prometer que el producto resuelve insomnio crónico ni que dormirá "como antes en pocos días". [SI APLICA] Si solo describe insomnio crónico sin medicación recetada → mencionar que el producto puede acompañar pero requiere consistencia + sugerir consultar profesional si lleva meses sin dormir.
[NUNCA decir] afirmar que el producto "resuelve cualquier tipo de insomnio"; prometer que "vas a dormir como antes en pocos días"; diagnosticar.
[Cuándo escalar] cliente menciona depresión o ansiedad severa; cliente expresa sufrimiento extremo sin pregunta concreta.`,
    respuesta: 'Lamento lo que estás viviendo — 3 semanas no es poco. El ELIXIR DEL SUEÑO puede acompañar el proceso, pero requiere consistencia: 1 comprimido cada noche, 30 minutos antes de dormir, junto con buenos hábitos (hora fija, sin pantallas, cenas livianas). No te prometo que vas a dormir como antes en pocos días, eso depende de cada cuerpo. Si después de unas semanas con producto y hábitos seguís igual, te conviene consultar con un profesional.',
    confidence: 0.60,
    rationale: 'El material cubre insomnio acompañado por el producto pero NO da una recomendación específica para "3 semanas" — requiere extrapolar entre agudo (semanas) y crónico (meses).',
    binary: 'FALTA_INFO',
  },

  // === BUCKET 0.40 (cobertura baja — falta material específico relevante) ===
  {
    pregunta: 'tengo lupus, ¿puedo tomarlo?',
    material: `[Hechos] ELIXIR DEL SUEÑO está formulado para población adulta sana (a partir de los 14 años). NO se recomienda su uso en:
- Personas con enfermedades autoinmunes (la melatonina puede modular respuesta inmune)
- Personas con anticoagulantes
- Personas con medicación recetada activa sin validación del médico tratante
Las categorías listadas son las contraindicaciones documentadas para combinación general. Cualquier condición médica NO listada aquí requiere validación por el médico tratante antes de iniciar.
[Posición] NO aprobamos uso en ninguna de las categorías listadas. Si el cliente menciona alguna condición o medicación específica fuera de las generales listadas (ej. lupus, sertralina, paroxetina, warfarina), derivamos a su médico tratante — no improvisamos por chat.
[Debe contener] [SIEMPRE] Listar las categorías generales contraindicadas. [SIEMPRE] Recomendar consultar al médico tratante. [SI APLICA] Si menciona una condición específica NO listada → derivar al médico tratante sin aprobar la combinación.
[NUNCA decir] aprobar el uso en autoinmunes; decir "es natural, así que cualquiera lo puede tomar"; diagnosticar.
[Cuándo escalar] cliente menciona condición médica no listada (ej. lupus, fibromialgia); cliente con autoinmune insiste sin acompañamiento médico.`,
    respuesta: 'El lupus es una condición autoinmune, y la melatonina puede modular la respuesta inmune — por eso no podemos aprobar el uso solo por chat. Lo correcto en tu caso es validarlo primero con tu médico tratante, que conoce tu cuadro completo. Si te lo aprueba, lo retomamos.',
    confidence: 0.40,
    rationale: 'El KB menciona "autoinmunes" genérico pero NO lupus específicamente. La política dice "deriva al médico tratante" para casos específicos no listados — respuesta segura pero el experto humano podría querer revisar.',
    binary: 'FALTA_INFO',
  },
  {
    pregunta: 'tomo escitalopram, ¿hay problema?',
    material: `[Hechos] ELIXIR DEL SUEÑO contiene melatonina (10mg) + citrato de magnesio (50mg). Aunque ambos ingredientes son naturales, pueden interactuar con varios grupos farmacológicos: antidepresivos (potencia serotoninérgica), ansiolíticos y benzodiacepinas (sedación aditiva), anticoagulantes, inmunosupresores y medicamentos para hipertensión. Solo el médico tratante conoce el cuadro completo del paciente y puede validar la combinación.
[Posición] Si el cliente toma cualquier medicamento recetado, la respuesta correcta es derivar a su médico tratante antes de combinar con ELIXIR DEL SUEÑO. NO improvisamos lista de medicamentos "compatibles".
[Debe contener] [SIEMPRE] Recomendar consultar al médico tratante. [SIEMPRE] Mencionar que melatonina + citrato de magnesio son naturales pero SÍ pueden interactuar con medicamentos recetados. [SI APLICA] Si el cliente nombra una familia específica (antidepresivos, ansiolíticos, anticoagulantes) → confirmar que esa familia está dentro de las que pueden interactuar.
[NUNCA decir] afirmar que "no hay interacciones con ningún medicamento"; aprobar la combinación con cualquier medicamento recetado; improvisar lista de "compatibles"; sugerir dejar el medicamento.
[Cuándo escalar] cliente con medicamento recetado insiste en comprar sin consulta médica; antidepresivos con intención de compra.`,
    respuesta: 'El escitalopram es un antidepresivo, y los antidepresivos están dentro de los grupos que pueden interactuar con la melatonina por la parte serotoninérgica. La melatonina y el citrato de magnesio son naturales, pero eso no quita que haya interacción. Lo correcto es validarlo con tu médico tratante antes de combinarlos.',
    confidence: 0.40,
    rationale: 'El KB menciona "antidepresivos" como familia pero NO escitalopram específicamente. Hay base para responder familia + recomendar consulta, pero el caso individual requiere validación profesional.',
    binary: 'FALTA_INFO',
  },

  // === BUCKET 0.20 (cobertura nula — material no aplica / handoff silente) ===
  {
    pregunta: '¿envían a Miami?',
    material: `[Hechos] ELIXIR DEL SUEÑO se despacha a todo Colombia. Tiempos varían según la ciudad. NO existe cobertura internacional — solo Colombia.
[Posición] La empresa solo despacha dentro de Colombia. Cualquier envío fuera de Colombia (Miami, Madrid, etc.) se escala a humano para confirmar si hay opción especial o se rechaza el pedido.
[Debe contener] [SI APLICA] Si pregunta por envío internacional o ciudades fuera de Colombia (Miami, Madrid, etc.) → escalar a humano.
[NUNCA decir] aprobar envío fuera de Colombia sin confirmación humana.
[Cuándo escalar] cliente pide envío internacional (Miami, Madrid, México, EEUU, Europa, etc.); cliente pide envío fuera de Colombia (cualquier país).`,
    respuesta: '',
    confidence: 0.20,
    rationale: 'El KB lista Miami explícitamente como caso de escalado a humano. Handoff silente es la respuesta correcta (responseText vacío + FUERA_SCOPE).',
    binary: 'FUERA_SCOPE',
  },
  {
    pregunta: '¿puedo pagar con criptomonedas?',
    material: `[Hechos] Métodos de pago aceptados: pago contra-entrega, transferencias (Bancolombia, Nequi, Daviplata), tarjeta débito/crédito vía link de pago. NO existen otros métodos (no criptomonedas, no pagos en moneda extranjera, no PayPal, no Bitcoin).
[Posición] Si el cliente pregunta por métodos no listados (cripto, PayPal, Bitcoin, etc.) → escalar a humano.
[Debe contener] [SI APLICA] Si pregunta por métodos no listados (cripto, PayPal, Bitcoin, etc.) → escalar a humano.
[NUNCA decir] aprobar pagos con criptomonedas / PayPal / Bitcoin / moneda extranjera.
[Cuándo escalar] cliente pide pagar con criptomonedas, Bitcoin, PayPal o método no listado.`,
    respuesta: '',
    confidence: 0.20,
    rationale: 'El KB lista métodos específicos y dice "NO criptomonedas" explícitamente + escalada a humano. Fuera de scope total — handoff silente.',
    binary: 'FUERA_SCOPE',
  },
]
