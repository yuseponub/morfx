---
plan: 04
wave: 3
phase: standalone-somnio-v4-rag-generative
depends_on: [03]
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/few-shots.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "Archivo few-shots.ts existe con 8-10 few-shots construidos del corpus REAL (de los 18 KBs y de los 17 casos del Smoke A — NO genéricos)."
    - "Cada few-shot tiene: pregunta + material + respuesta + confidence (discretizada en 5 buckets) + rationale (1 frase) + binary (RESPONDE_BIEN/FALTA_INFO/FUERA_SCOPE)."
    - "Los 5 buckets de confidence están cubiertos: 0.20, 0.40, 0.60, 0.80, 0.95 (M2 — escala discretizada)."
    - "Distribución: 2 few-shots por bucket (10 total) — o mínimo 1 por bucket si 8 total (M4 — cobertura del rango completo)."
    - "El prompt del generation-call inyecta los few-shots formateados (M1+M2+M3+M4 aplicados)."
    - "M1 — la pregunta de framing del confidence usa 'PROBABILIDAD que un compañero humano experto diría que tu respuesta es completa y NO requiere consultarlo con un humano'."
    - "M3 — el prompt instruye explícitamente al modelo a emitir el binary enum como backstop después del numérico."
    - "Idioma de los few-shots: español original del corpus (NO traducir — RESEARCH Don't Hand-Roll)."
    - "El test verifica que el prompt resultante contiene PROBABILIDAD + RESPONDE_BIEN/FALTA_INFO/FUERA_SCOPE + 5 valores de confidence discretos."
    - "v4 sigue dormant en producción."
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/few-shots.ts"
      provides: "FEW_SHOTS array con 8-10 entradas calibradas del corpus real"
      exports: ["FEW_SHOTS"]
    - path: "src/lib/agents/somnio-v4/sub-loop/prompt.ts"
      provides: "buildGenerationPrompt actualizado: usa FEW_SHOTS by default + M1 framing"
      contains: "FEW_SHOTS"
  key_links:
    - from: "src/lib/agents/somnio-v4/sub-loop/prompt.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/few-shots.ts"
      via: "import FEW_SHOTS + inyectar en buildGenerationPrompt"
      pattern: "import.*FEW_SHOTS"
    - from: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/few-shots.ts"
      via: "indirecto via buildGenerationPrompt"
      pattern: "buildGenerationPrompt"
---

<objective>
Wave 3 — Calibración del prompt Gemini Flash con few-shots construidos del corpus REAL (18 KBs + 17 casos del Smoke A). Aplica las 4 mejoras de RESEARCH (M1, M2, M3, M4) sobre la calibración base del D-17.

Purpose: combatir el sesgo sistémico de overconfidence en LLMs verbalized confidence (RESEARCH líneas 488-507: GPT-3/3.5 ECE > 0.377, GPT-4 AUROC ~62.7%). Sin calibración fuerte, el threshold 0.70 (D-19) nunca dispara → handoffs ausentes → cliente recibe respuestas mediocres.

**Las 4 mejoras (RESEARCH A1) que este plan implementa:**
- **M1 — Probability framing:** la pregunta de auto-evaluación es "¿qué PROBABILIDAD de que un compañero experto diría que tu respuesta es completa?", NO "¿qué tan confiado estás?"
- **M2 — Escala discretizada:** solo 5 valores permitidos (0.20, 0.40, 0.60, 0.80, 0.95), evita anchoring noise + fluido en 0.42, 0.67, 0.89.
- **M3 — Binary backstop:** después del confidence numérico, enum (RESPONDE_BIEN / FALTA_INFO / FUERA_SCOPE) que el orchestrator usa para forzar handoff aún si confidence ≥ 0.70.
- **M4 — Cobertura del rango completo:** los 8-10 few-shots cubren los 5 buckets (no 6 con 0.85+ y 2 con 0.30 — anchoring).

Output:
- 1 archivo NUEVO: `few-shots.ts` con FEW_SHOTS const.
- 1 archivo EDIT: `prompt.ts` para inyectar FEW_SHOTS by default en buildGenerationPrompt + asegurar que el body del prompt usa M1 framing.
- 1 archivo TEST: `few-shots.test.ts` verifica estructura.

**Nota:** M3 (`binary` enum) ya se implementó en Plan 03 (Tasks 3.5 + 3.8). Este plan refuerza el comportamiento via prompt + few-shots con valores binary diversos.
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/somnio-v4-rag-generative/CONTEXT.md
@.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md
@.planning/standalone/somnio-v4-rag-generative/RESEARCH.md
@.planning/standalone/somnio-v4-rag-generative/PATTERNS.md
@.planning/standalone/somnio-v4-rag-generative/01-SUMMARY.md
@.planning/standalone/somnio-v4-rag-generative/02-SUMMARY.md
@.planning/standalone/somnio-v4-rag-generative/03-SUMMARY.md
@src/lib/agents/somnio-v4/sub-loop/prompt.ts
@src/lib/agents/somnio-v4/sub-loop/generation-call.ts
@src/lib/agents/somnio-v4/sub-loop/tone-base.ts
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 4.1: Crear `few-shots.ts` con 10 few-shots calibrados (M2 + M4 cobertura 5 buckets)</name>
  <read_first>
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 484-552 (M1-M4 recommendations completas)
    - .planning/standalone/somnio-v4-rag-generative/PATTERNS.md líneas 695-711 (few-shots.ts pattern + cobertura por bucket)
    - .planning/standalone/somnio-v4-rag-generative/STATUS.md líneas 44-89 (17 casos del Smoke A — derivar few-shots de acá)
    - Los 18 KBs reescritos en `src/lib/agents/somnio-v4/knowledge/**/*.md` (post-Plan 02 — leer 4-5 para tener material real para los few-shots)
    - src/lib/agents/somnio-v4/sub-loop/prompt.ts (post-Plan 03 — verificar shape del FewShot type)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/sub-loop/few-shots.ts` con 10 few-shots (M4 — 2 por cada uno de los 5 buckets) derivados del corpus REAL.

    **Estructura de cada few-shot (tipo FewShot importado de prompt.ts):**

    ```ts
    {
      pregunta: string,       // pregunta del cliente (español, tono real)
      material: string,       // material del topic (Hechos + Posición + Debe contener relevantes — concatenado compacto)
      respuesta: string,      // respuesta ideal generada (español, tono Somnio)
      confidence: 0.20 | 0.40 | 0.60 | 0.80 | 0.95,  // SOLO estos 5 valores (M2)
      rationale: string,      // 1 frase: por qué este confidence
      binary: 'RESPONDE_BIEN' | 'FALTA_INFO' | 'FUERA_SCOPE',  // M3
    }
    ```

    **Distribución obligatoria (M4 — cobertura del rango completo):**

    | Bucket | # Few-shots | Casos sugeridos (del Smoke A STATUS.md líneas 44-89 + adicionales) |
    |---|---|---|
    | 0.95 (cobertura total) | 2 | "cómo se toma?" (case 6), "es adictivo?" (case 9) — material cubre directo + completo |
    | 0.80 (cobertura alta con leve adaptación) | 2 | "cuánto tarda a Medellín?" (case 10), "puedes si tomo alcohol?" (case 1 — material directo edge-case) |
    | 0.60 (cobertura parcial) | 2 | "qué hábitos ayudan?" (case 14 — KB tiene info general pero pregunta es subjetiva), un caso ad-hoc tipo "tengo insomnio de 2 semanas, ayuda?" (toca insomnio_largo_plazo parcialmente) |
    | 0.40 (cobertura baja — falta material relevante) | 2 | "tengo lupus, puedo?" (case 5 — KB dice "autoinmunes" genérico, lupus no listado), un caso ad-hoc tipo "tomo escitalopram, problema?" (KB tiene contraindicaciones genérico, escitalopram específico no listado) |
    | 0.20 (cobertura nula — material no aplica) | 2 | "envían a Miami?" (case 16 — KB es Colombia-only), "puedo pagar con criptomonedas?" (case 17 — métodos listados no incluyen cripto) |

    **Procedimiento por few-shot:**

    1. Leer el KB doc real correspondiente (ej. para case 1 alcohol → `src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md` post-Plan 02).
    2. Construir `material` concatenando: Hechos del producto + Posición del negocio + 2-3 items relevantes de Debe contener + 2 items NUNCA decir + 1-2 items Cuándo escalar. Mantener español original (NO traducir).
    3. Construir `respuesta` ideal en tono Somnio (cálido pero firme, 2-4 oraciones, "tú", sin emojis, sin moralismo, sin dramatismo).
    4. Asignar `confidence` del bucket correspondiente — SOLO los 5 valores discretos (0.20, 0.40, 0.60, 0.80, 0.95).
    5. Escribir `rationale` 1 frase ("El material cubre directamente el caso de alcohol con regla clara"; "El KB menciona autoinmunes genérico pero no lupus específico"; etc.).
    6. Asignar `binary`:
       - confidence ≥ 0.80 → "RESPONDE_BIEN"
       - confidence == 0.60 → "RESPONDE_BIEN" o "FALTA_INFO" (depende del caso; "hábitos" puede ser RESPONDE_BIEN, "insomnio 2 semanas" puede ser FALTA_INFO)
       - confidence == 0.40 → "FALTA_INFO" (KB tiene algo pero no lo específico)
       - confidence == 0.20 → "FUERA_SCOPE" (KB no aplica)

    **Snippet de estructura (template del archivo completo — adaptar contenido a cada caso):**

    ```ts
    /**
     * Few-shots de calibración del responseConfidence + binary backstop para Gemini Flash.
     * Aplicación de M1+M2+M3+M4 (RESEARCH A1) sobre D-17.
     *
     * - M1: prompt usa probability framing ("PROBABILIDAD que un compañero experto diría...").
     * - M2: confidence discretizado en 5 buckets (0.20, 0.40, 0.60, 0.80, 0.95).
     * - M3: binary enum como backstop (handled in generation-call.ts + index.ts).
     * - M4: 10 few-shots cubren los 5 buckets (2 por bucket).
     *
     * Casos derivados del Smoke A (STATUS.md líneas 44-89) + corpus real KBs post-Plan 02.
     * Idioma: español original del corpus (Don't Hand-Roll RESEARCH — NO traducir).
     *
     * Standalone somnio-v4-rag-generative Plan 04.
     */
    import type { FewShot } from './prompt'

    export const FEW_SHOTS: FewShot[] = [
      // === BUCKET 0.95 (cobertura total) ===
      {
        pregunta: 'cómo se toma?',
        material: `[Hechos] Una cápsula 30 min antes de dormir, con un vaso de agua. ELIXIR DEL SUEÑO contiene melatonina + citrato de magnesio.\n[Posición] Recomendación clara: 1 cápsula nocturna, no exceder 1 al día.\n[Debe contener] [SIEMPRE] Mencionar dosis (1 cápsula) + momento (30 min antes de dormir) + con agua. [SIEMPRE] Indicar que no excedan la dosis recomendada.\n[NUNCA decir] aprobar doble dosis, mezclar con otro sedante.`,
        respuesta: 'Tomá 1 cápsula con un vaso de agua, unos 30 minutos antes de acostarte. Es la dosis recomendada: no excedas más de una al día.',
        confidence: 0.95,
        rationale: 'El material cubre directo y completo la pregunta: dosis, momento y agua están explícitos.',
        binary: 'RESPONDE_BIEN',
      },
      {
        pregunta: 'es adictivo?',
        material: `[Hechos] La melatonina NO genera dependencia química ni síndrome de abstinencia documentado. Es una hormona natural que el cuerpo ya produce.\n[Posición] No es adictivo. Comunicar con calma, sin minimizar legítima preocupación del cliente.\n[Debe contener] [SIEMPRE] Aclarar que NO es adictivo. [SIEMPRE] Explicar brevemente el mecanismo (hormona natural). [SI APLICA] Si cliente menciona dependencia psicológica → escalar a humano.\n[NUNCA decir] minimizar la preocupación, decir "es completamente seguro siempre".`,
        respuesta: 'No, el ELIXIR DEL SUEÑO no es adictivo. La melatonina es una hormona que tu cuerpo ya produce de manera natural, por eso no genera dependencia química ni síndrome de abstinencia.',
        confidence: 0.95,
        rationale: 'El material responde de manera directa y completa.',
        binary: 'RESPONDE_BIEN',
      },

      // === BUCKET 0.80 (cobertura alta con leve adaptación) ===
      {
        pregunta: 'cuánto tarda a Medellín?',
        material: `[Hechos] Tiempos típicos por ciudad: Bogotá 1 día hábil, Medellín y Cali 2 días, ciudades intermedias 3-4 días, zonas remotas hasta 5 días. Envíos por mensajería estándar nacional Colombia.\n[Posición] Tiempos son estimados (depende de la mensajería). Comunicar el rango.\n[Debe contener] [SIEMPRE] Dar tiempo estimado según ciudad. [SI APLICA] Si cliente está en zona remota → mencionar rango más alto.`,
        respuesta: 'A Medellín suele llegar en 2 días hábiles desde que se despacha. Igual te aviso que el tiempo final depende de la mensajería.',
        confidence: 0.80,
        rationale: 'El material lista Medellín explícitamente; leve adaptación al tono conversacional.',
        binary: 'RESPONDE_BIEN',
      },
      {
        pregunta: 'puedo si tomo alcohol?',
        material: `[Hechos] La melatonina puede potenciar el efecto sedante del alcohol. Ambos son depresores del SNC.\n[Posición] NO recomendamos combinar con alcohol.\n[Debe contener] [SIEMPRE] Recomendación NO combinar. [SIEMPRE] Mención breve del mecanismo. [SI APLICA] Si cliente dice "ya bebí" → instruir saltarse dosis esa noche.\n[NUNCA decir] aprobar combinación, minimizar.`,
        respuesta: 'Te recomendamos no combinar el ELIXIR DEL SUEÑO con alcohol. Ambos son depresores del sistema nervioso y la melatonina puede potenciar el efecto sedante. Si ya bebiste esta noche, mejor saltate la dosis y retomá mañana.',
        confidence: 0.80,
        rationale: 'Material directo edge-case alcohol; ajuste al tono "ya bebiste" no agresivo.',
        binary: 'RESPONDE_BIEN',
      },

      // === BUCKET 0.60 (cobertura parcial) ===
      {
        pregunta: 'qué hábitos ayudan a dormir mejor?',
        material: `[Hechos] Hábitos generales documentados: higiene de sueño (horario consistente), evitar pantallas 1h antes, evitar cafeína después de 16h, ejercicio moderado al día, ambiente oscuro y fresco.\n[Posición] Promover hábitos como complemento; el producto no reemplaza higiene de sueño.\n[Debe contener] [SIEMPRE] Listar 2-3 hábitos clave. [SI APLICA] Si cliente reporta caso clínico complejo → escalar.`,
        respuesta: 'Algunos hábitos que ayudan: mantener un horario de sueño consistente, evitar pantallas en la última hora antes de dormir, y reducir cafeína después de las 4 PM. El ELIXIR DEL SUEÑO funciona mejor cuando lo combinás con buena higiene de sueño.',
        confidence: 0.60,
        rationale: 'El material tiene hábitos generales pero la pregunta del cliente es subjetiva — la respuesta es razonable pero podría no cubrir el caso particular.',
        binary: 'RESPONDE_BIEN',
      },
      {
        pregunta: 'tengo insomnio hace 2 semanas, qué me recomiendas?',
        material: `[Hechos] El insomnio agudo (<3 meses) suele responder a melatonina + buena higiene de sueño. Insomnio crónico (>3 meses) requiere evaluación clínica.\n[Posición] Para casos agudos, recomendar producto + hábitos. Para casos complejos, derivar a profesional.\n[Cuándo escalar] cliente reporta insomnio >3 meses o impacto severo en vida diaria.`,
        respuesta: '2 semanas se considera agudo y suele responder bien a melatonina más buena higiene de sueño (horario fijo, evitar pantallas antes de dormir). Si después de 4-6 semanas no mejorás, conviene consulta médica.',
        confidence: 0.60,
        rationale: 'El material cubre insomnio agudo en general; el caso específico (2 semanas + recomendación personalizada) requiere algo de extrapolación.',
        binary: 'FALTA_INFO',
      },

      // === BUCKET 0.40 (cobertura baja — falta material relevante) ===
      {
        pregunta: 'tengo lupus, puedo tomarlo?',
        material: `[Hechos] Las contraindicaciones específicas documentadas incluyen condiciones autoinmunes (sin especificar cuáles), embarazo, lactancia, niños <12 años.\n[Posición] En condiciones médicas crónicas, recomendar consulta médica antes de iniciar.\n[Cuándo escalar] cliente menciona condición médica no listada específicamente.`,
        respuesta: 'Como tenés una condición autoinmune, conviene que lo consultés con tu médico antes de empezar el ELIXIR DEL SUEÑO. No tenemos información específica sobre lupus, y queremos asegurar que sea seguro en tu caso.',
        confidence: 0.40,
        rationale: 'El KB menciona autoinmunes en general pero no lupus específicamente. Respuesta segura es escalar/recomendar médico.',
        binary: 'FALTA_INFO',
      },
      {
        pregunta: 'tomo escitalopram, hay problema?',
        material: `[Hechos] Documentadas interacciones genéricas con anticoagulantes, depresores del SNC. Para antidepresivos específicos (ISRS, IMAO, etc.) sin info detallada.\n[Posición] En caso de tratamiento psicotrópico, recomendar consulta médica.\n[Cuándo escalar] cliente menciona medicamento específico no listado.`,
        respuesta: 'Como estás en tratamiento con escitalopram, lo mejor es consultarlo con tu médico antes de empezar. No tenemos información específica sobre esa combinación y queremos asegurar que sea seguro en tu caso.',
        confidence: 0.40,
        rationale: 'El KB no menciona escitalopram específicamente. Respuesta correcta es escalar.',
        binary: 'FALTA_INFO',
      },

      // === BUCKET 0.20 (cobertura nula — material no aplica) ===
      {
        pregunta: 'envían a Miami?',
        material: `[Hechos] Cobertura: territorio nacional Colombia. Tiempos por ciudad. Mensajería estándar nacional.\n[Posición] Envío SOLO dentro de Colombia.\n[Cuándo escalar] cliente pide envío internacional.`,
        respuesta: '',
        confidence: 0.20,
        rationale: 'El KB es Colombia-only. Miami fuera de scope total. Handoff silente es lo correcto (responseText vacío y FUERA_SCOPE).',
        binary: 'FUERA_SCOPE',
      },
      {
        pregunta: 'puedo pagar con criptomonedas?',
        material: `[Hechos] Métodos aceptados: PSE, contra entrega, tarjeta de crédito/débito (Mastercard, Visa, AmEx).\n[Posición] Métodos fijos.\n[Cuándo escalar] cliente pide método no listado (ej. criptomonedas).`,
        respuesta: '',
        confidence: 0.20,
        rationale: 'El KB lista métodos específicos; cripto no listado. Fuera de scope.',
        binary: 'FUERA_SCOPE',
      },
    ]
    ```

    **Reglas estrictas:**
    - **NO traducir** los few-shots al inglés (RESEARCH § Don't Hand-Roll — usar idioma productivo).
    - Usar las 5 piezas materiales del KB real del post-Plan 02 (Hechos, Posición, Debe contener, NUNCA, Cuándo escalar) en cada `material` field.
    - Para los buckets 0.20: `respuesta: ''` es VÁLIDO — el caso es FUERA_SCOPE y va a disparar handoff (responseText empty + binary FUERA_SCOPE).
    - El `rationale` debe explicar por qué este confidence — 1 frase.

    **Adaptar el ejemplo template arriba** a la realidad del corpus post-Plan 02. Si el KB real para `contenido.md` (case 8 "cuánto trae el frasco?") es distinto al ejemplo, ajustá. Lo importante es:
    - Distribución 2 por bucket.
    - Material fiel al KB real.
    - Tono Somnio en la respuesta.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/few-shots.ts && grep -c "export const FEW_SHOTS" src/lib/agents/somnio-v4/sub-loop/few-shots.ts && node -e "const m=require('./src/lib/agents/somnio-v4/sub-loop/few-shots.ts'); const counts={}; m.FEW_SHOTS.forEach(f=>{counts[f.confidence]=(counts[f.confidence]||0)+1}); console.log(JSON.stringify(counts))" 2>&1 || grep -c "confidence: 0\\.95" src/lib/agents/somnio-v4/sub-loop/few-shots.ts && grep -c "confidence: 0\\.20" src/lib/agents/somnio-v4/sub-loop/few-shots.ts && grep -c "confidence: 0\\.40" src/lib/agents/somnio-v4/sub-loop/few-shots.ts && grep -c "confidence: 0\\.60" src/lib/agents/somnio-v4/sub-loop/few-shots.ts && grep -c "confidence: 0\\.80" src/lib/agents/somnio-v4/sub-loop/few-shots.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/few-shots" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/somnio-v4/sub-loop/few-shots.ts` exit 0.
    - `grep -c "export const FEW_SHOTS" src/lib/agents/somnio-v4/sub-loop/few-shots.ts` == 1.
    - 5 buckets cubiertos: `grep -c "confidence: 0\\.95"` ≥ 2, `grep -c "confidence: 0\\.80"` ≥ 2, `grep -c "confidence: 0\\.60"` ≥ 2, `grep -c "confidence: 0\\.40"` ≥ 2, `grep -c "confidence: 0\\.20"` ≥ 2.
    - NO valores intermedios prohibidos: `grep -E "confidence: 0\\.(0[1-9]|1[0-9]|2[1-9]|3[0-9]|4[1-9]|5[0-9]|6[1-9]|7[0-9]|8[1-9]|9[0-46-9])" src/lib/agents/somnio-v4/sub-loop/few-shots.ts | wc -l` == 0 (solo 0.20, 0.40, 0.60, 0.80, 0.95 permitidos).
    - 3 binary values presentes: `grep -c "binary: 'RESPONDE_BIEN'"` ≥ 1, `grep -c "binary: 'FALTA_INFO'"` ≥ 1, `grep -c "binary: 'FUERA_SCOPE'"` ≥ 1.
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/few-shots" | wc -l` == 0.
  </acceptance_criteria>
  <done>few-shots.ts creado con 10 entradas cubriendo los 5 buckets de confidence + 3 binary values.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.2: Actualizar `prompt.ts` — buildGenerationPrompt usa FEW_SHOTS by default + verifica M1 framing</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/prompt.ts (post-Plan 03 estado actual)
    - src/lib/agents/somnio-v4/sub-loop/few-shots.ts (post-Task 4.1 — para entender shape)
    - .planning/standalone/somnio-v4-rag-generative/RESEARCH.md líneas 509-542 (M1 framing reformulation exact text)
  </read_first>
  <action>
    Editar `src/lib/agents/somnio-v4/sub-loop/prompt.ts`:

    **Cambio A — Import FEW_SHOTS + default argument:**

    Cambiar la signature de `buildGenerationPrompt`:

    ```ts
    import { TONE_BASE } from './tone-base'
    import { FEW_SHOTS } from './few-shots'  // NEW
    import type { ToolingOutput } from './tooling-call'

    export type FewShot = { /* ya existe del Plan 03 */ }

    export function buildGenerationPrompt(
      material: NonNullable<ToolingOutput['material_del_topic']>,
      toneBase: string = TONE_BASE,
      fewShots: FewShot[] = FEW_SHOTS,  // ← CAMBIO: default a FEW_SHOTS importados (era [] en Plan 03)
    ): string {
      // ... compose
    }
    ```

    **Cambio B — Formatear few-shots en el prompt body:**

    En el lugar donde Plan 03 dejó el placeholder `[PLACEHOLDER FEW_SHOTS — Plan 04 inyecta los 8-10 few-shots acá]`, reemplazar por código que renderiza los few-shots:

    ```ts
    const fewShotsBlock = fewShots.length === 0
      ? ''
      : `

    EJEMPLOS DE CALIBRACIÓN (few-shots):

    ${fewShots.map((fs, i) => `
    [Few-shot ${i + 1}]
    Pregunta del cliente: ${fs.pregunta}

    Material disponible:
    ${fs.material}

    Tu respuesta ideal: ${fs.respuesta || '(handoff silente — responseText vacío)'}
    Tu responseConfidence: ${fs.confidence}
    Tu rationale: ${fs.rationale}
    Tu binary: ${fs.binary}
    `).join('\n')}
    `
    ```

    Insertar `fewShotsBlock` ANTES del bloque "MATERIAL DEL TOPIC SELECCIONADO" del prompt, y DESPUÉS del bloque "BACKSTOP BINARIO".

    **Cambio C — Verificar/asegurar M1 framing presente:**

    El prompt body debe contener literalmente la pregunta M1 (RESEARCH líneas 513-522):

    > "¿Cuál es la PROBABILIDAD (de 0 a 100) de que un compañero humano experto en Somnio diría que tu respuesta es completa y NO requiere consultarlo con un humano?"

    O bien, si Plan 03 ya la incluyó textualmente (chequear), no duplicar. Si Plan 03 usó otro framing, REEMPLAZAR por el M1 framing exacto arriba.

    **Cambio D — Asegurar M2 instrucción explícita:**

    Después del framing de probabilidad, el prompt debe decir literalmente:

    > "Usá SÓLO estos 5 buckets: 0.20, 0.40, 0.60, 0.80, 0.95. NO uses valores intermedios tipo 0.42, 0.67, 0.89."

    Si Plan 03 ya lo incluyó (chequear), no duplicar. Sino agregar.
  </action>
  <verify>
    <automated>grep -c "import { FEW_SHOTS }" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "fewShots: FewShot\\[\\] = FEW_SHOTS" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "EJEMPLOS DE CALIBRACIÓN\\|Few-shot " src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "PROBABILIDAD" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "compañero humano experto" src/lib/agents/somnio-v4/sub-loop/prompt.ts && grep -c "0.20\\|0.40\\|0.60\\|0.80\\|0.95" src/lib/agents/somnio-v4/sub-loop/prompt.ts && npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/prompt" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "import { FEW_SHOTS }" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 1.
    - `grep -c "FEW_SHOTS" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 2 (import + default arg).
    - Prompt incluye M1 framing: `grep -c "PROBABILIDAD" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 1 + `grep -c "compañero humano experto\\|compañero experto" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 1.
    - Prompt incluye M2 instrucción discretizada: `grep -c "0\\.20\\|0\\.40\\|0\\.60\\|0\\.80\\|0\\.95" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 5 (los 5 buckets listados).
    - Prompt incluye binary backstop M3: `grep -c "RESPONDE_BIEN\\|FALTA_INFO\\|FUERA_SCOPE" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 3.
    - `grep -c "EJEMPLOS DE CALIBRACIÓN\\|Few-shot " src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 1 (block de few-shots renderizado).
    - `npx tsc --noEmit -p . 2>&1 | grep -E "sub-loop/prompt" | wc -l` == 0.
  </acceptance_criteria>
  <done>prompt.ts usa FEW_SHOTS by default + M1 framing + M2 discretización + M3 backstop verificables.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.3: Crear test `few-shots.test.ts` (verifica estructura + prompt resultante)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/few-shots.ts (post-Task 4.1)
    - src/lib/agents/somnio-v4/sub-loop/prompt.ts (post-Task 4.2)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts`:

    ```ts
    import { describe, it, expect } from 'vitest'
    import { FEW_SHOTS } from '../few-shots'
    import { buildGenerationPrompt } from '../prompt'

    describe('FEW_SHOTS structure', () => {
      it('has 8-10 few-shots total', () => {
        expect(FEW_SHOTS.length).toBeGreaterThanOrEqual(8)
        expect(FEW_SHOTS.length).toBeLessThanOrEqual(10)
      })

      it('covers all 5 confidence buckets (M2 + M4)', () => {
        const buckets = new Set(FEW_SHOTS.map(f => f.confidence))
        expect(buckets.has(0.20)).toBe(true)
        expect(buckets.has(0.40)).toBe(true)
        expect(buckets.has(0.60)).toBe(true)
        expect(buckets.has(0.80)).toBe(true)
        expect(buckets.has(0.95)).toBe(true)
      })

      it('uses ONLY the 5 discrete confidence values (no fluid values)', () => {
        const allowed = new Set([0.20, 0.40, 0.60, 0.80, 0.95])
        for (const fs of FEW_SHOTS) {
          expect(allowed.has(fs.confidence)).toBe(true)
        }
      })

      it('has at least 1 of each binary backstop value (M3)', () => {
        const binaries = new Set(FEW_SHOTS.map(f => f.binary))
        expect(binaries.has('RESPONDE_BIEN')).toBe(true)
        expect(binaries.has('FALTA_INFO')).toBe(true)
        expect(binaries.has('FUERA_SCOPE')).toBe(true)
      })

      it('all few-shots have non-empty rationale + pregunta + material', () => {
        for (const fs of FEW_SHOTS) {
          expect(fs.pregunta.length).toBeGreaterThan(0)
          expect(fs.material.length).toBeGreaterThan(0)
          expect(fs.rationale.length).toBeGreaterThan(0)
        }
      })

      it('FUERA_SCOPE cases have empty respuesta (handoff silente)', () => {
        const fueraScope = FEW_SHOTS.filter(f => f.binary === 'FUERA_SCOPE')
        for (const fs of fueraScope) {
          expect(fs.respuesta).toBe('')
        }
      })
    })

    describe('buildGenerationPrompt with FEW_SHOTS', () => {
      const mockMaterial = {
        hechos: 'mock hechos',
        posicion: 'mock posicion',
        debe_contener_aplicables: ['[SIEMPRE] mock item'],
        nunca_decir: ['mock NUNCA'],
        cuando_escalar: ['mock escalar'],
      }

      it('prompt contains M1 probability framing', () => {
        const prompt = buildGenerationPrompt(mockMaterial)
        expect(prompt).toMatch(/PROBABILIDAD/i)
        expect(prompt).toMatch(/compañero (humano )?experto/i)
      })

      it('prompt lists the 5 discrete buckets (M2)', () => {
        const prompt = buildGenerationPrompt(mockMaterial)
        expect(prompt).toContain('0.20')
        expect(prompt).toContain('0.40')
        expect(prompt).toContain('0.60')
        expect(prompt).toContain('0.80')
        expect(prompt).toContain('0.95')
      })

      it('prompt instructs the binary backstop (M3)', () => {
        const prompt = buildGenerationPrompt(mockMaterial)
        expect(prompt).toContain('RESPONDE_BIEN')
        expect(prompt).toContain('FALTA_INFO')
        expect(prompt).toContain('FUERA_SCOPE')
      })

      it('prompt includes few-shots block when FEW_SHOTS not empty', () => {
        const prompt = buildGenerationPrompt(mockMaterial)
        expect(prompt).toMatch(/Few-shot 1|EJEMPLOS DE CALIBRACIÓN/i)
      })

      it('prompt includes material sections (Hechos/Posición/etc)', () => {
        const prompt = buildGenerationPrompt(mockMaterial)
        expect(prompt).toContain('mock hechos')
        expect(prompt).toContain('mock posicion')
        expect(prompt).toContain('mock NUNCA')
      })
    })
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` exit 0.
    - `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` exit code 0.
    - Todos los tests pasan (estructura + buckets + binary + framing + buckets en prompt + backstop + few-shots block).
  </acceptance_criteria>
  <done>Tests verdes. FEW_SHOTS validado estructural + integrado en prompt.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.4: Commit + push</name>
  <read_first>
    - CLAUDE.md Regla 1 (push)
  </read_first>
  <action>
    Stage + commit + push:

    ```
    git add src/lib/agents/somnio-v4/sub-loop/few-shots.ts \
            src/lib/agents/somnio-v4/sub-loop/prompt.ts \
            src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts

    git commit -m "$(cat <<'EOF'
    feat(somnio-v4-rag-generative): plan 04 — calibración few-shots Gemini Flash (M1+M2+M3+M4)

    Aplica las 4 mejoras RESEARCH A1 sobre la calibración base D-17:
    - M1: probability framing ("PROBABILIDAD que un compañero humano experto diría que tu respuesta es completa") — en buildGenerationPrompt.
    - M2: escala discretizada en 5 buckets (0.20, 0.40, 0.60, 0.80, 0.95) — explícito en prompt + enforced en few-shots.
    - M3: binary backstop (RESPONDE_BIEN/FALTA_INFO/FUERA_SCOPE) — schema ya en Plan 03, prompt instruye uso explícito.
    - M4: 10 few-shots cubren los 5 buckets (2 por bucket) — del corpus REAL (18 KBs + 17 casos Smoke A).

    - NEW few-shots.ts: const FEW_SHOTS con 10 entradas calibradas.
    - EDIT prompt.ts: buildGenerationPrompt usa FEW_SHOTS by default + verifica M1 framing.
    - TEST few-shots.test.ts: structure + buckets + binary + prompt assertions.

    Standalone: somnio-v4-rag-generative Plan 04 (Wave 3).
    Refs D-13, D-14, D-15, D-16, D-17 + RESEARCH A1 (M1-M4).

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"

    git push origin main
    ```
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "plan 04" && git log origin/main..HEAD --oneline | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --oneline` incluye "plan 04".
    - `git log origin/main..HEAD --oneline | wc -l` == 0.
    - `git status` clean.
    - v4 sigue dormant (post-push verify).
  </acceptance_criteria>
  <done>Plan 04 cerrado. Plans 05 + 06 (Wave 4 parallel) unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Few-shots → buildGenerationPrompt → Gemini Flash | Calibration data embebida en system prompt |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-04-01 | Information Disclosure | Few-shots contienen info real de clientes / pedidos | LOW | mitigate | Los few-shots son construidos a partir del KB material (NO de chats reales). Pregunta/respuesta sintéticos. |
| T-04-02 | Tampering | Anchoring artificial en confidence (RESEARCH líneas 495-499) | MEDIUM | mitigate | M2 escala discretizada + M4 cobertura del rango completo evita que el modelo "copie" un confidence default alto. Test 4.3 verifica cobertura. |
| T-04-03 | Repudiation | El modelo ignora calibración (overconfidence sistémico) | MEDIUM | accept | Riesgo residual aceptable (RESEARCH líneas 544-551). Threshold 0.70 + binary backstop + NUNCA-decir actúan como guardrails redundantes. Smoke A mide empíricamente. |
| T-04-04 | Tampering | El modelo emite confidence fluido (0.42, 0.67) ignorando M2 | LOW | accept | El schema (Plan 03) acepta z.number() — los buckets son guía soft. Si Smoke A muestra alto % no-bucket, ajustar en Plan 07 (HOLD). |
</threat_model>

<verification>
- few-shots.ts existe con 10 entradas + 5 buckets cubiertos + 3 binary values.
- prompt.ts importa FEW_SHOTS + buildGenerationPrompt los usa by default.
- Prompt contiene M1 framing + M2 buckets + M3 backstop literal.
- Tests verdes.
- v4 dormant post-push.
</verification>

<success_criteria>
Plan 04 cerrado cuando:
- [ ] FEW_SHOTS array con 10 entradas calibradas del corpus REAL.
- [ ] buildGenerationPrompt inyecta FEW_SHOTS by default.
- [ ] Tests structure + integration verdes.
- [ ] Push exitoso.
- [ ] STATUS.md actualizada.
- [ ] Plans 05 + 06 (Wave 4 parallel) unblocked.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-rag-generative/04-SUMMARY.md` documentando:
- Lista de los 10 few-shots con bucket + binary.
- M1/M2/M3/M4 verification (snippet del prompt resultante).
- Tests resultado.
- HEAD del push.
- Próximo paso: Plans 05 + 06 paralelos en Wave 4.
</output>
