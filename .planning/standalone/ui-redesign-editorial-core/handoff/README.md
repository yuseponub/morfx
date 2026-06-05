# morfx Design System

**morfx** is a WhatsApp-first customer operations platform (CRM + conversational AI agents + order management) built by Yusepo Nub. The codebase is a Next.js 15 / React 19 monorepo with Supabase, shadcn/ui (new-york), Tailwind 4, Radix, and Lucide icons. Language: **Spanish (es-CO)**, timezone **America/Bogota**.

This design system reimagines the existing default shadcn UI into a deliberate aesthetic:
**paper / Bible / dictionary**. Warm cream pages, deep ink, rubric red, hairline rules,
small caps, serif type first. Simplista but dense with typographic craft.

---

## Sources

- **Logo:** `uploads/morf x.png` (bold serif wordmark "morf · x"). Also `public/logo-light.png` + `public/logo-dark.png` from the repo — copied to `assets/`.
- **Repo:** `github.com/yuseponub/morfx` (main branch). Next.js app at `src/app/(dashboard)/{whatsapp, crm}`.
- **Functional scope referenced:** sidebar (`src/components/layout/sidebar.tsx`), WhatsApp inbox (`src/app/(dashboard)/whatsapp/components/*`), CRM contactos + pedidos kanban (`src/app/(dashboard)/crm/**`).
- **Original design:** shadcn new-york + slate — generic, not used as visual reference. We keep its _structure_ (sidebar → inbox layout → kanban) and re-skin.

---

## Index

- `README.md` — this file
- `colors_and_type.css` — CSS variables: paper palette, ink scale, rubric accents, serif/sans/mono families, type classes, rules
- `fonts/` — (empty; see **Font substitutions** below)
- `assets/` — logos + brand marks
- `preview/` — cards that populate the Design System tab
- `ui_kits/whatsapp/` — WhatsApp inbox recreation (paper-themed)
- `ui_kits/crm/` — CRM contacts + pedidos kanban recreation
- `SKILL.md` — agent skill manifest

---

## Content fundamentals

**Language:** Spanish (Colombia). UI copy in infinitive or imperative: _"Crear contacto", "Enviar mensaje", "Asignar"_. No English leaking into UI chrome.

**Voice:** neutral, direct, slightly formal — like a dictionary definition, not a marketing blurb. Don't over-explain. Use **tú** when addressing the user in prose; UI buttons stay tense-less (_Crear_, not _Crea_).

**Casing:** Sentence case for every label, heading, and button. **No Title Case**, no ALL CAPS except small-caps typographic treatment (which is a visual choice, not a shout).

**Numerals:** old-style figures (`onum`) in serif body text; lining figures in tables and KPIs. Use Colombian punctuation: `1.234.567,50`. Dates in `es-CO` long form (_21 abr 2026_) or compact (_21/04/26_).

**Emoji:** avoided in product chrome. Preserved only where the existing platform already uses them as _data_ — order-stage avatar indicators (🥬 🍳 📦 🚚) surface inside rubric-red ornament rings, not as free-floating UI icons.

**Vibe:** a printed page from a 1950s technical lexicon. Quiet. Typographic. The information does the work; the UI gets out of the way.

**Examples:**
- Section header: `Conversaciones — Bandeja de entrada`  (em-dash separator, lowercase sub)
- Empty state: `No hay conversaciones nuevas.` (period, no emoji, no illustration)
- Tag: `ᴄʟɪᴇɴᴛᴇ` (small caps)
- Action: `Asignar a mí`  /  `Marcar como leído`
- Error: `No fue posible enviar el mensaje.` (complete sentence, period)

---

## Visual foundations

**Palette.** Four paper tones (cream 985 → 915), five inks (ink-1 deepest, ink-5 faintest), one rubric red (for accents, links in running prose, critical status), three quiet accent inks (verdigris, gold, indigo) used only as _ink colors_, never fills. No neon, no gradients-as-brand, no saturated flat UI blocks.

**Backgrounds.** Every surface is _paper_. A subtle SVG grain + fiber texture is blended via `multiply` on `.mx-doc`. Cards are a brighter cream (`--paper-0`), the page is `--paper-1`, sunken areas are `--paper-2`. No white — white reads as plastic against cream and breaks the metaphor. Occasional full-bleed hero pages use `--paper-2` with a thick `--ink-1` rule at top and bottom (dictionary page header/footer).

**Typography.** Serif-first. **EB Garamond** carries display, headings, body, small caps, and italic. **Inter** is reserved for dense UI chrome (table column labels, buttons, input text) where serif gets noisy. **JetBrains Mono** for phone numbers, IDs, tokens. Small caps (`font-variant: small-caps` + tracking 0.06–0.08em) do most of the "label" work — they replace uppercase sans eyebrows and read as proper typography, not branding.

**Spacing.** 4-point grid (4/8/12/16/24/32/48/64/96). Generous outer margins (like book margins); tight inner leading. Columns are narrow (≤ 68ch) for running text; tables can break this.

**Animation.** Minimal. Paper doesn't bounce. Transitions are `120ms ease-out` for color/opacity; `180ms cubic-bezier(0.2, 0, 0, 1)` for small position shifts. No fade-in-on-scroll, no scale-pop, no skeletons that pulse — replace with a static "Cargando…" in italic small caps.

**Hover states.** Surface shifts one paper step darker (`--paper-1` → `--paper-3`). Buttons underline. Links: rubric red gets a double underline on hover (`text-decoration: underline double`). No color flash.

**Press states.** Buttons shift `translateY(1px)` and lose their shadow — like pressing a stamp into paper. No scale.

**Borders.** `1px solid --border` on all structural edges; `1px solid --ink-1` for "emphasized" containers (a dictionary box / sidebar callout). Double rules (`mx-rule-double`) separate major sections. Curly ornament (`❦` or `§ § §`) centered between long sections.

**Inner/outer shadows.** Warm, low-opacity, oklch-based. `--shadow-page` for top-level containers (simulates page curl); `--shadow-card` for cards; `--shadow-raised` for modals. No purple/blue shadows, no hard offsets — paper casts soft shadows.

**Transparency & blur.** Almost never. Overlays use `--paper-shadow` at 40–60% opacity (warm, not gray) with no blur. Modal dialogs sit flat on a dim paper overlay, no glass effects.

**Corner radius.** Very small: 0–4px. Tables and rules have no radius. Buttons and inputs: `--radius-3` (4px). Pills / avatars: `--radius-pill`. Rounding over 4px reads as "modern SaaS" and breaks the metaphor.

**Cards.** Cream paper one step brighter than the page, `1px solid --border`, `--shadow-card`. Heading: small-caps eyebrow in rubric red + serif title + hairline rule + body. No colored left borders, no tags floating at top-right.

**Imagery.** Monochrome or sepia-toned. No stock photography; when we must illustrate, lean on woodcut/engraving visual vocabulary. The logo wordmark itself is the primary visual asset.

**Layout rules.** Persistent elements (sidebar, top rule, page footer with page number) are fixed. Content is scroll. Sidebar width: 256px. Content max-width for prose: 68ch. Dashboard content: 100% with 48px outer gutter.

---

## Iconography

morfx's codebase uses **Lucide React** (pinned `lucide-react@^0.563.0`, `components.json: iconLibrary: "lucide"`). We keep Lucide but treat icons as engraved/hairline marks, not filled glyphs:

- **Stroke:** 1.5px default (Lucide's default 2px is too heavy against serif type)
- **Size:** 16px in UI chrome, 20px in nav, 14px inside badges
- **Color:** `currentColor` — they inherit ink color, never get tinted independently
- **Spacing:** 8px gap from adjacent text, always aligned to cap-height of serif

**Delivery:** via CDN (`https://unpkg.com/lucide@latest`) in HTML previews; via `lucide-react` in the codebase.

**Emoji:** _only_ as data (order-stage indicators set by end users). Never in navigation, labels, or marketing copy.

**Logos:** `assets/logo.png` (light bg), `assets/logo-dark.png` (dark bg), `assets/logo-original.png` (raw user upload — cleanest).

**Custom marks used in the system:**
- `❦` (U+2766, floral heart) — section ornament
- `§` (section sign) — used for legal / fine-print callouts
- `¶` (pilcrow) — optional paragraph marker in long prose
- `·` (middle dot) — used inside the wordmark "morf · x" and between inline meta
- `—` (em-dash) — the subtitle separator of choice, not a colon

No icon fonts, no SVG sprites, no hand-rolled illustration.

**Font substitution flag:** the repo ships Next.js default **Geist Sans + Geist Mono**, which don't match the paper/Bible brief. We substituted:

- Display/serif → **EB Garamond** (Google Fonts) — close to a classic Bible/dictionary cut
- UI sans → **Inter** (Google Fonts)
- Mono → **JetBrains Mono** (Google Fonts)

➤ **Ask for the user:** if you have a licensed cut in mind (Adobe Garamond Pro, Le Monde Livre, Lyon Text, a Bible-specific face), drop the `.woff2` files into `fonts/` and update `colors_and_type.css`. The rest of the system will inherit.

---

## UI kits

- `ui_kits/whatsapp/` — the conversations inbox: sidebar → conversation list → chat view with bubbles, composer, contact drawer. Paper-themed.
- `ui_kits/crm/` — contacts table + orders kanban, dictionary-column style.

Each contains `README.md`, `index.html` (interactive click-thru), and small JSX component files.

---

## Next steps (manager notes)

1. Provide real licensed font files if the Google Fonts substitutes are wrong.
2. Confirm: keep Lucide icons at 1.5 stroke, or commission custom engraved marks?
3. Decide on dark mode — the current brief reads as _paper-only_. We have not designed a dark variant; a vellum-on-ink reversal is possible but needs buy-in.
