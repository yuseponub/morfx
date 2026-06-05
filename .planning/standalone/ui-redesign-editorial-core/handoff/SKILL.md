---
name: morfx-design
description: Use this skill to generate well-branded interfaces and assets for morfx, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

Key files:
- `README.md` — brand overview, content fundamentals, visual foundations, iconography
- `colors_and_type.css` — paper palette, ink scale, rubric reds, desaturated accents, serif/sans/mono families, type classes, rules/ornaments
- `assets/` — morf·x wordmark (original + light + dark)
- `ui_kits/whatsapp/` — WhatsApp inbox recreation
- `ui_kits/crm/` — CRM contacts + orders kanban recreation
- `preview/` — per-token/component specimen cards

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. Always link `colors_and_type.css`; always prefer EB Garamond for display/serif, Inter for dense UI chrome, JetBrains Mono for phone numbers/IDs. Use small-caps eyebrows in rubric red, hairline + double rules to separate sections, and keep radii ≤ 4px. No gradient brand fills, no emoji in UI chrome, copy in Spanish (es-CO) by default.

If working on production code, the source repo is a Next.js 15 + Tailwind 4 + shadcn (new-york) + Radix + Lucide stack. The design system's CSS variables can be mapped onto shadcn tokens (`--background` → `--paper-1`, `--foreground` → `--ink-1`, `--primary` → `--ink-1`, `--destructive` → `--rubric-2`, etc.) in `src/app/globals.css`.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
