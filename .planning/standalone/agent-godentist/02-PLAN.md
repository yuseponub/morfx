---
phase: agent-godentist
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/godentist/comprehension-schema.ts
  - src/lib/agents/godentist/comprehension-prompt.ts
  - src/lib/agents/godentist/comprehension.ts
autonomous: true

must_haves:
  truths:
    - "Comprehension extracts 23 intents correctly from dental appointment messages"
    - "Comprehension extracts 8 data fields (nombre, telefono, sede, servicio, cedula, fecha, jornada, horario)"
    - "Servicio detection maps dental service questions to the correct enum value"
    - "Sede detection handles aliases (Jumbo->canaveral, Centro->mejoras_publicas)"
    - "Classification distinguishes datos/pregunta/mixto/irrelevante"
    - "Language detection identifies English messages"
  artifacts:
    - path: "src/lib/agents/godentist/comprehension-schema.ts"
      provides: "Zod schema for structured output with GoDentist-specific fields"
      min_lines: 40
    - path: "src/lib/agents/godentist/comprehension-prompt.ts"
      provides: "System prompt for Claude Haiku with dental service context"
      min_lines: 60
    - path: "src/lib/agents/godentist/comprehension.ts"
      provides: "comprehend() function using Anthropic SDK structured output"
      min_lines: 50
  key_links:
    - from: "src/lib/agents/godentist/comprehension-schema.ts"
      to: "src/lib/agents/godentist/constants.ts"
      via: "GD_INTENTS used in z.enum()"
      pattern: "GD_INTENTS"
    - from: "src/lib/agents/godentist/comprehension.ts"
      to: "src/lib/agents/godentist/comprehension-prompt.ts"
      via: "buildSystemPrompt imported"
      pattern: "buildSystemPrompt"
---

<objective>
Create the comprehension layer (Capa 2) for GoDentist — single Claude Haiku call that extracts intent, dental service, client data, sede, and classification from customer messages.

Purpose: This is the only AI call per turn. Everything downstream is deterministic. The comprehension layer must accurately understand dental appointment conversations in Colombian Spanish.

Output: Three files implementing the comprehension pipeline for dental appointment messages.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist/DISENO-COMPLETO.md
@src/lib/agents/somnio-v3/comprehension-schema.ts
@src/lib/agents/somnio-v3/comprehension-prompt.ts
@src/lib/agents/somnio-v3/comprehension.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create comprehension-schema.ts</name>
  <files>src/lib/agents/godentist/comprehension-schema.ts</files>
  <action>
Create the Zod schema for GoDentist comprehension output. Follow somnio-v3 pattern but adapt all fields.

Import `GD_INTENTS` and `SERVICIOS` from `./constants`.

**MessageAnalysisSchema = z.object({...})**

`intent`: z.object with:
- `primary`: z.enum(GD_INTENTS)
- `secondary`: z.enum([...GD_INTENTS, 'ninguno']) — second intent if message has two clear intentions
- `confidence`: z.number() 0-100
- `reasoning`: z.string()

`extracted_fields`: z.object with:
- `nombre`: z.string().nullable()
- `telefono`: z.string().nullable().describe('Format: 573XXXXXXXXX')
- `sede_preferida`: z.enum(['cabecera', 'mejoras_publicas', 'floridablanca', 'canaveral']).nullable().describe('Map aliases: Jumbo/Bosque/Canaveral -> canaveral, Centro -> mejoras_publicas')
- `servicio_interes`: z.enum(SERVICIOS).nullable().describe('Detected dental service from price question')
- `cedula`: z.string().nullable()
- `fecha_preferida`: z.string().nullable().describe('Normalized date: "manana" -> tomorrow date, "el martes" -> next tuesday date, "15 de marzo" -> 2026-03-15. Always YYYY-MM-DD format')
- `preferencia_jornada`: z.enum(['manana', 'tarde']).nullable().describe('"en la manana" -> manana, "en la tarde/noche" -> tarde')
- `horario_seleccionado`: z.string().nullable().describe('Selected time slot from availability shown: "el de las 10" -> "10:00"')

`classification`: z.object with:
- `category`: z.enum(['datos', 'pregunta', 'mixto', 'irrelevante'])
- `sentiment`: z.enum(['positivo', 'neutro', 'negativo'])
- `idioma`: z.enum(['es', 'en', 'otro'])

Export type `MessageAnalysis = z.infer<typeof MessageAnalysisSchema>`

IMPORTANT: The SERVICIOS constant must be defined as a const tuple in constants.ts so it can be used with z.enum(). Define it as:
```
export const SERVICIOS = [
  'corona', 'protesis', 'alineadores', 'brackets_convencional', 'brackets_zafiro',
  'autoligado_clasico', 'autoligado_pro', 'autoligado_ceramico', 'implante',
  'blanqueamiento', 'limpieza', 'extraccion_simple', 'extraccion_juicio',
  'diseno_sonrisa', 'placa_ronquidos', 'calza_resina', 'rehabilitacion',
  'radiografia', 'endodoncia', 'carillas', 'ortopedia_maxilar',
  'ortodoncia_general', 'otro_servicio',
] as const
```
  </action>
  <verify>`npx tsc --noEmit 2>&1 | grep "comprehension-schema" | head -5` — zero errors.</verify>
  <done>MessageAnalysisSchema validates all 23 intents, 23 services, 4 sedes, and classification with idioma field. Exported type is MessageAnalysis.</done>
</task>

<task type="auto">
  <name>Task 2: Create comprehension-prompt.ts and comprehension.ts</name>
  <files>src/lib/agents/godentist/comprehension-prompt.ts, src/lib/agents/godentist/comprehension.ts</files>
  <action>
**comprehension-prompt.ts:**

Create `buildSystemPrompt(existingData, recentBotMessages)` following somnio-v3 pattern.

The prompt must include:

1. **Context:** "Eres un analizador de mensajes para un agente de agendamiento de citas de GoDentist (clinica dental en Bucaramanga/Floridablanca, Colombia)."

2. **Business info:**
   - GoDentist: 4 sedes — Cabecera (Cll 52 #31-32), Mejoras Publicas (Cll 41 #27-63), Floridablanca (Cll 4 #3-06), Canaveral (CC Jumbo El Bosque)
   - Valoracion GRATIS
   - Horarios: L-V 8am-6:30pm, Sabados 8am-12md (Cabecera hasta 5pm)

3. **Extraction rules:**
   - Only extract EXPLICIT data from message
   - Telefono: normalize to 573XXXXXXXXX
   - Sede: normalize aliases (Jumbo/Bosque -> canaveral, Centro -> mejoras_publicas)
   - Servicio: map dental service questions to enum value. List ALL 23 services with common variants (e.g., "brackets metalicos" -> brackets_convencional, "alineadores invisibles" -> alineadores, "muelas del juicio" -> extraccion_juicio)
   - Fecha: normalize relative dates ("manana", "el martes", "la proxima semana") to YYYY-MM-DD. Include current date context.
   - Horario: extract from availability selection ("el de las 10", "a las 2 de la tarde" -> "14:00")

4. **Intent rules** (all 23 intents with descriptions and examples):
   - saludo: "Hola", "Buenos dias"
   - precio_servicio: "Cuanto cuestan los brackets?", "Precio de limpieza" — ALWAYS extract servicio_interes
   - valoracion_costo: "La valoracion tiene costo?", "Es gratis la cita?"
   - financiacion: "Tienen formas de pago?", "Se puede financiar?"
   - ubicacion: "Donde quedan?", "Tienen sede en Floridablanca?"
   - horarios: "Hasta que hora atienden?", "Abren sabados?"
   - materiales: "Que tipo de coronas manejan?"
   - menores: "Atienden ninos?"
   - seguros_eps: "Aceptan Sura?", "Trabajan con EPS?"
   - urgencia: "Tengo un dolor terrible", "Es urgente"
   - garantia: "Tiene garantia el implante?"
   - quiero_agendar: "Quiero pedir una cita", "Quiero agendar"
   - datos: ONLY personal info (name, phone, sede, etc.)
   - seleccion_sede: "En Cabecera", "La de Floridablanca"
   - seleccion_horario: "El de las 10", "A las 3 de la tarde"
   - confirmar: "Si, confirmo", "Todo correcto"
   - rechazar: "No me interesa", "No gracias"
   - asesor: "Quiero hablar con alguien"
   - reagendamiento: "Necesito cambiar mi cita"
   - queja: "Mala experiencia", "Quiero poner un reclamo"
   - cancelar_cita: "Quiero cancelar mi cita"
   - acknowledgment: "Ok", "Gracias", "Dale" — pure acknowledgments
   - otro: unclassifiable

5. **Classification rules:**
   - category: datos/pregunta/mixto/irrelevante (same as somnio-v3)
   - sentiment: positivo/neutro/negativo
   - idioma: es/en/otro — critical for English detection

6. **Bot context section** (same pattern as somnio-v3 for short responses):
   - If bot asked about scheduling and client says "si" -> quiero_agendar
   - If bot showed confirmation and client says "si" -> confirmar
   - If bot asked for sede and client gives one -> seleccion_sede

7. **Existing data section** (same pattern as somnio-v3)

**comprehension.ts:**

Copy somnio-v3/comprehension.ts structure exactly, but:
- Import from `./comprehension-schema` and `./comprehension-prompt`
- Import `GD_INTENTS` from `./constants` (for sanitization fallback)
- Same Anthropic client singleton pattern
- Same `comprehend()` function signature
- Same resilient parsing with sanitization
- Model: `claude-haiku-4-5-20251001`
  </action>
  <verify>`npx tsc --noEmit 2>&1 | grep "godentist/comprehension" | head -5` — zero errors.</verify>
  <done>
comprehension-prompt.ts has buildSystemPrompt with complete dental service context, all 23 intents documented, sede aliases, and date normalization rules.
comprehension.ts has comprehend() function that calls Claude Haiku with structured output and resilient parsing.
  </done>
</task>

</tasks>

<verification>
- All 3 files compile without errors
- Schema covers all 23 intents from design doc
- Schema covers all 23 dental services
- Prompt includes all intent descriptions with examples
- Comprehension function follows same pattern as somnio-v3
</verification>

<success_criteria>
- MessageAnalysisSchema validates structured output with dental-specific fields
- buildSystemPrompt includes complete dental service context and all 23 intents
- comprehend() calls Claude Haiku with Zod structured output and handles parsing errors
- idioma field present for English detection
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist/02-SUMMARY.md`
</output>
