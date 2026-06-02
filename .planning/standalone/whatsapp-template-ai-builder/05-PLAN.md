---
phase: whatsapp-template-ai-builder
plan: 05
type: execute
wave: 5
depends_on: [01, 02, 03, 04]
files_modified:
  - src/app/(dashboard)/configuracion/whatsapp/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx
  - docs/analysis/04-estado-actual-plataforma.md
  - docs/roadmap/features-por-fase.md
autonomous: false  # Ends with a user-confirmable regression smoke
requirements: [D-02, D-16, D-17]
user_setup: []

must_haves:
  truths:
    - "A 'Crear con IA' CTA is visible on the WhatsApp config hub (/configuracion/whatsapp) linking to the builder"
    - "A 'Crear con IA' button is visible on the templates list page next to 'Nuevo Template' — both buttons work (D-02 coexistence)"
    - "Manual form at /configuracion/whatsapp/templates/nuevo still works end-to-end (TEXT-only template creation)"
    - "docs/analysis/04-estado-actual-plataforma.md reflects that the IMAGE CREATE gap is closed (D-16, D-17)"
    - "docs/roadmap/features-por-fase.md records the standalone completion"
    - "The automation builder at /automatizaciones/builder is not regressed (Regla 6)"
  artifacts:
    - path: "src/app/(dashboard)/configuracion/whatsapp/page.tsx"
      provides: "Hub page with new 'Crear con IA' CTA card"
      contains: "builder"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx"
      provides: "Templates list with 'Crear con IA' button"
      contains: "/configuracion/whatsapp/templates/builder"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Updated platform state reflecting closed CREATE gap for IMAGE templates"
      contains: "IMAGE"
    - path: "docs/roadmap/features-por-fase.md"
      provides: "Roadmap update with this standalone completed"
      contains: "whatsapp-template-ai-builder"
  key_links:
    - from: "src/app/(dashboard)/configuracion/whatsapp/page.tsx"
      to: "/configuracion/whatsapp/templates/builder"
      via: "Link href"
      pattern: "templates/builder"
    - from: "src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx"
      to: "/configuracion/whatsapp/templates/builder"
      via: "Link href next to existing Nuevo Template link"
      pattern: "templates/builder"
---

<objective>
Wire the builder into the navigation so users can actually reach it (D-02), and update the documentation so the project's docs reflect the closed CREATE gap (Regla 4). This plan closes the standalone.

Per PATTERNS.md flag: `/configuracion/page.tsx` does NOT exist in this project — the closest hub is `/configuracion/whatsapp/page.tsx`. This plan places the "Crear con IA" CTA at the WhatsApp sub-hub AND at the templates list page, per the CONTEXT.md D-02 decision (both entry points are explicitly required).

Purpose: Complete the D-02 coexistence contract: BOTH the AI builder AND the manual form are reachable. Without this plan, the UI from Plan 04 is orphaned. Also satisfies Regla 4 (docs updated after feature completion).

Output: 2 route updates (nav CTAs) + 2 doc updates + 1 final regression smoke.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/whatsapp-template-ai-builder/CONTEXT.md
@.planning/standalone/whatsapp-template-ai-builder/PATTERNS.md
@.planning/standalone/whatsapp-template-ai-builder/04-SUMMARY.md

<interfaces>
From src/app/(dashboard)/configuracion/whatsapp/page.tsx (existing, read before editing):
```tsx
const settings = [
  { title: 'Templates', description: '...', href: '/configuracion/whatsapp/templates', icon: FileText },
  { title: 'Equipos', ... },
  { title: 'Respuestas Rapidas', ... },
  { title: 'Costos y Uso', ... },
]
// Renders a grid of Card components from @/components/ui/card
```

From src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx (existing, read before editing):
```tsx
// lines 35-49:
<div className="flex gap-2">
  <form action={handleSync}>
    <Button variant="outline" size="sm"><RefreshCw /> Sincronizar</Button>
  </form>
  <Link href="/configuracion/whatsapp/templates/nuevo">
    <Button><Plus /> Nuevo Template</Button>
  </Link>
</div>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 5.1: Add 'Crear con IA' CTA card to WhatsApp config hub</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/page.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/page.tsx (full file — existing `settings` array at lines 5-30)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `/configuracion/whatsapp/page.tsx` MODIFY)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-02)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/configuracion/whatsapp/page.tsx` to add a prominent "Crear template con IA" CTA above the existing settings grid.

    Steps:

    1. Import `Sparkles` from `lucide-react` (add to existing import from `lucide-react`).
    2. Above the existing grid `<div className="grid gap-4 md:grid-cols-2">`, add a highlighted card:

    ```tsx
    {/* AI Builder CTA — D-02 */}
    <Link href="/configuracion/whatsapp/templates/builder" className="block mb-6">
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-primary bg-primary/5">
        <CardHeader className="flex flex-row items-center gap-4">
          <Sparkles className="h-8 w-8 text-primary" />
          <div>
            <CardTitle className="text-lg">Crear template con IA</CardTitle>
            <CardDescription>
              Describe lo que necesitas en lenguaje natural y la IA te guia paso a paso — incluye soporte para imagenes de header.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
    ```

    3. Do NOT remove any existing `settings` entries. Keep the 4-card grid intact. The AI CTA sits ABOVE the grid as a visually distinct highlighted card.

    4. The final render should look like:
    ```tsx
    export default function WhatsAppSettingsPage() {
      return (
        <div className="flex-1 overflow-auto">
          <div className="container py-6 px-6">
            <h1 className="text-2xl font-bold mb-6">Configuracion de WhatsApp</h1>

            {/* NEW: AI Builder CTA */}
            <Link href="/configuracion/whatsapp/templates/builder" className="block mb-6">
              ...
            </Link>

            <div className="grid gap-4 md:grid-cols-2">
              {/* existing 4 settings cards — UNCHANGED */}
            </div>
          </div>
        </div>
      )
    }
    ```

    Do NOT modify the 4 existing settings entries or their order.
  </action>
  <verify>
    <automated>grep -q "Sparkles" src/app/\(dashboard\)/configuracion/whatsapp/page.tsx &amp;&amp; grep -q "/configuracion/whatsapp/templates/builder" src/app/\(dashboard\)/configuracion/whatsapp/page.tsx &amp;&amp; grep -q "Crear template con IA" src/app/\(dashboard\)/configuracion/whatsapp/page.tsx &amp;&amp; grep -q "Templates" src/app/\(dashboard\)/configuracion/whatsapp/page.tsx &amp;&amp; grep -q "Equipos" src/app/\(dashboard\)/configuracion/whatsapp/page.tsx &amp;&amp; grep -q "Respuestas Rapidas" src/app/\(dashboard\)/configuracion/whatsapp/page.tsx &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "configuracion/whatsapp/page.tsx" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - File imports `Sparkles` from `lucide-react`
    - Contains a `<Link href="/configuracion/whatsapp/templates/builder">` entry
    - Contains the text "Crear template con IA"
    - All 4 existing settings (`Templates`, `Equipos`, `Respuestas Rapidas`, `Costos y Uso`) remain (grep verifies)
    - `npx tsc --noEmit` reports zero errors
  </acceptance_criteria>
  <done>WhatsApp hub shows the AI builder CTA above the 4-card grid; manual pages still reachable.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.2: Add 'Crear con IA' button to templates list page</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx (full file — lines 35-49 where the action buttons live)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `/configuracion/whatsapp/templates/page.tsx` MODIFY)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-02 — coexistence with manual form)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx`. Add a new `<Link>` + `<Button>` for "Crear con IA" BEFORE the existing "Nuevo Template" button.

    1. Import `Sparkles` alongside the existing icon imports.
    2. In the action buttons flex container (currently at ~lines 35-49), add the new link BEFORE the existing "Nuevo Template" link:

    ```tsx
    <div className="flex gap-2">
      <form action={handleSync}>
        <Button variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Sincronizar
        </Button>
      </form>

      {/* NEW — AI builder entry point (D-02 coexistence) */}
      <Link href="/configuracion/whatsapp/templates/builder">
        <Button>
          <Sparkles className="h-4 w-4 mr-2" />
          Crear con IA
        </Button>
      </Link>

      {/* EXISTING — manual form entry point (unchanged) */}
      <Link href="/configuracion/whatsapp/templates/nuevo">
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Template
        </Button>
      </Link>
    </div>
    ```

    Note: the existing "Nuevo Template" button may currently be the default (non-outline) variant. To emphasize the AI path while keeping manual creation visible, change the existing "Nuevo Template" button to `variant="outline"` (as shown above). This is the only visual tweak to the existing button — the Link href stays `/configuracion/whatsapp/templates/nuevo`.

    Do NOT remove the "Sincronizar" form or the "Nuevo Template" link.
  </action>
  <verify>
    <automated>grep -q "Sparkles" src/app/\(dashboard\)/configuracion/whatsapp/templates/page.tsx &amp;&amp; grep -q "/configuracion/whatsapp/templates/builder" src/app/\(dashboard\)/configuracion/whatsapp/templates/page.tsx &amp;&amp; grep -q "/configuracion/whatsapp/templates/nuevo" src/app/\(dashboard\)/configuracion/whatsapp/templates/page.tsx &amp;&amp; grep -q "Crear con IA" src/app/\(dashboard\)/configuracion/whatsapp/templates/page.tsx &amp;&amp; grep -q "Nuevo Template" src/app/\(dashboard\)/configuracion/whatsapp/templates/page.tsx &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "templates/page.tsx" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - File imports `Sparkles`
    - Contains a `<Link>` to `/configuracion/whatsapp/templates/builder` with text "Crear con IA"
    - Contains a `<Link>` to `/configuracion/whatsapp/templates/nuevo` with text "Nuevo Template"
    - Both links are inside the same action-buttons container
    - `npx tsc --noEmit` reports zero errors
  </acceptance_criteria>
  <done>Templates list page has both entry points; D-02 coexistence satisfied.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.3: Update docs — estado-actual-plataforma.md + features-por-fase.md</name>
  <files>docs/analysis/04-estado-actual-plataforma.md, docs/roadmap/features-por-fase.md</files>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md (full file — find the WhatsApp / Templates module section; update status + remove IMAGE CREATE gap from deuda tecnica if listed)
    - docs/roadmap/features-por-fase.md (full file — find the right location to log the standalone completion)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-16, D-17 — states what was closed)
    - CLAUDE.md (Regla 4 — docs must be updated)
  </read_first>
  <action>
    **File A — `docs/analysis/04-estado-actual-plataforma.md`:**

    1. Locate the section describing "Templates WhatsApp" / "Plantillas" module state. Read the current status + deuda tecnica list.
    2. Update the module status to reflect that the IMAGE CREATE gap is closed:
       - If the file has a line like "Templates con imagen solo se pueden crear manualmente desde portal 360 Dialog" → replace with "Templates con imagen se crean desde el builder con IA en `/configuracion/whatsapp/templates/builder` (upload via 360 Dialog resumable API)."
       - If there's a "Deuda Tecnica" / "Gaps" list entry mentioning "IMAGE CREATE", "header_handle", or similar → REMOVE it (Regla 4: if resolved, delete from list).
    3. Add a new sub-section or bullet describing the new AI builder:

    ```markdown
    ### Templates WhatsApp (CREATE con IA)
    - AI builder en `/configuracion/whatsapp/templates/builder` (standalone whatsapp-template-ai-builder, completado 2026-04-XX)
    - Soporta header TEXT o IMAGE (JPG/PNG max 5 MB), body (max 1024), footer (max 60)
    - NO soporta aun: botones, header VIDEO, header DOCUMENT, edicion post-submit (limitacion Meta)
    - Coexiste con el form manual en `/configuracion/whatsapp/templates/nuevo`
    - Toda mutacion pasa por `src/lib/domain/whatsapp-templates.ts` (Regla 3)
    ```

    Adapt the wording to match the file's existing style (Spanish, headings level, bullet format).

    **File B — `docs/roadmap/features-por-fase.md`:**

    1. Find the appropriate section (likely "Standalones" or "Mejoras WhatsApp" or a chronological log).
    2. Append an entry:

    ```markdown
    ### Standalone: whatsapp-template-ai-builder (completado 2026-04-XX)
    - Builder guiado por IA para crear templates de WhatsApp
    - Cierra la brecha de CREATE para templates con header IMAGE
    - Reutiliza patron del Automation Builder (AI SDK v6 useChat + DefaultChatTransport)
    - Domain layer nuevo en `src/lib/domain/whatsapp-templates.ts`
    - Agente scope registrado: `config-builder-whatsapp-templates`
    - Archivos principales:
      - UI: `src/app/(dashboard)/configuracion/whatsapp/templates/builder/`
      - Backend: `src/app/api/config-builder/templates/{chat,upload}/route.ts`
      - Lib: `src/lib/config-builder/templates/{tools,system-prompt,validation,types}.ts`
    ```

    If the file has a different structure (e.g., by phase/version), adapt the placement accordingly. Use today's date (`2026-04-XX` → actual date at commit time — the executor should substitute).

    Do NOT modify any other documentation files in this task. This plan covers the TWO documentation touchpoints that CLAUDE.md Regla 4 requires.
  </action>
  <verify>
    <automated>grep -q "whatsapp-template-ai-builder" docs/roadmap/features-por-fase.md &amp;&amp; grep -q "builder" docs/analysis/04-estado-actual-plataforma.md &amp;&amp; grep -q "config-builder-whatsapp-templates" docs/roadmap/features-por-fase.md</automated>
  </verify>
  <acceptance_criteria>
    - `docs/analysis/04-estado-actual-plataforma.md` references the new builder route
    - `docs/analysis/04-estado-actual-plataforma.md` no longer lists "IMAGE CREATE" or "header_handle" as unresolved deuda tecnica (if previously present)
    - `docs/roadmap/features-por-fase.md` contains an entry mentioning `whatsapp-template-ai-builder`
    - `docs/roadmap/features-por-fase.md` mentions the agent scope ID `config-builder-whatsapp-templates`
  </acceptance_criteria>
  <done>Documentation reflects the closed gap + new builder. Regla 4 satisfied.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5.4: [FINAL CHECKPOINT] End-to-end regression + happy path</name>
  <what-built>
    The standalone is fully wired:
    - Agent scope registered (Plan 01)
    - Migration applied in prod (Plan 01)
    - 360 Dialog resumable upload helper (Plan 01)
    - Domain layer unifying CREATE (Plan 02)
    - Manual form delegates to domain (Plan 02) — D-02 coexistence preserved
    - AI SDK backend (types, validation, system prompt, tools, chat route, upload route) (Plan 03)
    - Full two-pane UI with live preview + image upload (Plan 04)
    - Navigation CTAs + docs updates (Plan 05)

    Push to Vercel before testing (Regla 1).
  </what-built>
  <how-to-verify>
    Perform the full regression + happy path. If ANY step fails, report the specific failure.

    **Pre-flight**
       - Confirm Vercel deploy is green and the commit hash matches HEAD
       - Open browser authenticated with a workspace that has `whatsapp_api_key` configured in `settings`

    **A. Regression: automation builder still works (Regla 6)**
       1. Visit `/automatizaciones/builder`
       2. Type: "Cuando alguien compra, ponle la etiqueta cliente"
       3. Expected: streams normally, tool calls fire, can create an automation
       4. If broken: STOP — Plan 01 session-store.ts changes need investigation

    **B. Regression: manual form still works (D-02)**
       1. Visit `/configuracion/whatsapp/templates/nuevo`
       2. Create a TEXT-only template: name `test_regression_manual`, category UTILITY, language es, body "Hola, test manual {{1}}"
       3. Save. Expected: redirects to list; new template appears with status PENDING
       4. Verify in DB / 360 portal the template reached 360 Dialog
       5. If broken: Plan 02 refactor has a bug — the action didn't delegate correctly

    **C. Happy path: AI builder creates a TEXT-only template**
       1. Visit `/configuracion/whatsapp/templates/builder` (via the new CTA at `/configuracion/whatsapp/` to prove the link works)
       2. Type: "Template de confirmacion de pedido: hola [nombre], tu pedido [numero] llega manana"
       3. Expected: AI proposes a draft, preview updates, asks for confirmation
       4. Confirm. Expected: "Template enviado a Meta" banner; a new row in `whatsapp_templates` with status='PENDING'
       5. Check DB: `variable_mapping` field is populated (e.g., `{"1": "contacto.nombre", "2": "orden.numero"}`)

    **D. Happy path: AI builder creates an IMAGE template (THE GAP CLOSER — D-16, D-17)**
       1. Start a new session (click "Nuevo" or refresh)
       2. Type: "Template con imagen para anunciar una promocion nueva"
       3. AI should suggest MARKETING category
       4. Switch header to IMAGE, upload a JPG <5 MB
       5. Confirm
       6. Expected: "Template enviado a Meta" banner
       7. Verify in DB: `components` JSONB has the HEADER component with `format: 'IMAGE'` and `example.header_handle: ["4::..."]`
       8. This is the first IMAGE template ever created from Morfx code. If this works, the CREATE gap is closed.

    **E. Documentation spot-check**
       1. Open `docs/analysis/04-estado-actual-plataforma.md` — look for the new builder reference
       2. Open `docs/roadmap/features-por-fase.md` — look for the standalone completion entry
       3. Confirm both mention `whatsapp-template-ai-builder`

    Reply:
    - "approved — standalone complete" if all 5 sections pass
    - A specific failure description otherwise
  </how-to-verify>
  <resume-signal>Type "approved — standalone complete" or describe the failure. The standalone is done only after this approval.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

(Same boundaries as Plans 02-04; no new surfaces introduced in this plan.)

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-01 | Information Disclosure | docs updated | accept | Docs live in the repo; no secrets in the changes |
| T-05-02 | Tampering | nav CTAs | accept | Pure UI links; navigation is cookie-authenticated downstream |
| T-05-03 | Repudiation | checkpoint approval | mitigate | User's "approved" signal is recorded in 05-SUMMARY.md along with git commit SHAs — audit trail |
</threat_model>

<verification>
1. Visual confirmation of both CTAs (Task 5.4 step C.1 + D.1)
2. Manual form regression verified (Task 5.4 step B)
3. Automation builder regression verified (Task 5.4 step A)
4. Docs updated (Task 5.3 verify grep + Task 5.4 step E)
5. IMAGE template creation proven working end-to-end (Task 5.4 step D — the literal D-16/D-17 closure)
</verification>

<success_criteria>
- Both nav entry points reachable and functional
- Manual form still works (D-02 coexistence proven)
- Automation builder not regressed (Regla 6 proven)
- AI builder creates TEXT template end-to-end
- AI builder creates IMAGE template end-to-end — THE CREATE gap (D-16, D-17) closed
- Docs reflect completion (Regla 4)
- User-approved checkpoint signals the standalone is complete
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-template-ai-builder/05-SUMMARY.md` documenting:
- Vercel deployment URL
- Full regression + happy path results (A/B/C/D/E)
- Any remaining known issues to defer to a follow-up standalone (e.g., image purge policy, button support)
- DB evidence that an IMAGE template was created (template ID + handle value redacted)
- User's "approved" quote
- Git commit SHAs for this plan

Also: update `$HOME/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/whatsapp_template_ai_builder.md` (the MEMORY.md companion file) to mark the standalone as COMPLETE with the date and a one-line summary.
</output>
