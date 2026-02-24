# Plan 28-05 Summary: Server Actions + Chat de Comandos Commands

## Status: COMPLETE

## What Was Done

### Task 1: Server actions for 3 guide generation commands
- Added `executeGenerarGuiasInter`, `executeGenerarGuiasBogota`, `executeGenerarExcelEnvia` to `src/app/actions/comandos.ts`
- Each follows CommandResult<GuideGenResult> pattern: auth → getGuideGenStage → check active job → fetch orders → create job → inngest.send
- All awaiting inngest.send (serverless safety)

### Task 2: Command handler + message types + UI chips + download link
- Extended `CommandMessage` union with `document_result` type in comandos-layout.tsx
- Added 3 command handlers in handleCommand (generar guias inter/bogota, generar excel envia)
- Fixed race condition: server-side fetch of final items on completion (Realtime events arrive out of order)
- Added 3 quick-action chips in command-input.tsx (FileText for PDFs, FileSpreadsheet for Excel)
- Added document_result renderer with download link in command-output.tsx
- Updated HELP_COMMANDS to 8 entries
- Fixed history panel job type labels (full Record<string, string> map for 6 types)

### Task 3: Human verification checkpoint
- User tested end-to-end: configured Inter stage → ran "generar guias inter" → PDF generated
- Fixed bugs found during testing:
  - Race condition: Realtime job status arrives before item updates → server fetch fallback
  - History labels: binary ternary only handled 2 types → full 6-type map
  - PDFKit ENOENT on Vercel: added serverExternalPackages config
  - PDF layout mismatch: rewrote to SOMNIO reference format (logo, separators, labels, spacing)

## Commits
- feat(28-05): wire 3 guide generation commands into Chat de Comandos
- fix(28): resolve pnpm lockfile sync after npm install
- fix(28): fix race condition in document completion + history labels
- fix(28): add pdfkit and bwip-js to serverExternalPackages for Vercel
- fix(28): rewrite PDF layout to match SOMNIO reference format

## Deviations
- **PDF layout rewrite**: Original plan assumed basic layout would work. User testing revealed layout didn't match SOMNIO reference format. Rewrote generate-guide-pdf.ts with proper logo, separators, labels, and spacing.
- **serverExternalPackages**: PDFKit needs filesystem access to .afm font files that Vercel's bundler strips. Added to next.config.ts.
- **Race condition fix**: Realtime events from different tables arrive out of order. Added server-side fetch fallback for document job completion.
- **SOMNIO logo**: Added public/somnio-logo.jpg, updated orchestrator to use it instead of logo-light.png.
