---
type: research-stub
slug: 260507-tj9-data-deletion-page
date: 2026-05-08
references: ../../research/data-deletion-legal-research.md
---

# Quick Task: Data Deletion Page — Research stub

This quick task's research lives in the canonical legal-research location:

**→ `.planning/research/data-deletion-legal-research.md`**

The research doc covers exhaustively:

- **§1** Meta Platform Terms — Data Deletion Callback URL vs Data Deletion Instructions URL, reviewer expectations, common rejection patterns, language requirements
- **§2** GDPR Article 17 (verbatim) — six grounds for erasure, five exceptions, response timelines (Art 12), onward erasure (Art 19), identity verification
- **§3** Ley 1581/2012 + Decreto 1377/2013 — derechos ARCO (art. 8 verbatim), plazos consulta 10+5 hábiles vs reclamo 15+8 hábiles (arts. 14, 15 verbatim), requisito de procedibilidad (art. 16), SIC contact data verified, Decreto 1377 art. 13 contenido mínimo, MorfX's dual role Responsable / Encargado
- **§4** Multi-tenant SaaS B2B patterns — Maija, ManyChat, HubSpot, Twilio, Intercom analyzed; controller/processor distinction phrasing; multi-data-subject routing
- **§5** Meta-approved live examples — concrete URLs, common phrases, minimum content checklist
- **§6** Colombia-specific retention obligations — DIAN art. 632 (5 years for invoices), other rules
- **§7** Recommended page structure for MorfX — 12 sections mapped to titles + bullets + citations
- **§8** Design system inheritance — confirmed paths, tokens, i18n namespace convention, footer link placement, **middleware whitelist edit required**
- **§9** Open questions / ambiguities (8 items)
- **§10** Project Constraints (from CLAUDE.md)
- **Sources** — 23 numbered citations with retrieval dates

## Key implementation notes (from the research)

1. **Page renders at `/data-deletion` (es default) and `/en/data-deletion` (English).**
2. **`middleware.ts` `isPublicMarketingRoute()` MUST be edited** to add both paths to the exact-match allowlist or the route falls through to Supabase auth and bounces Meta reviewer.
3. **Reuse `LegalSection`** component from `src/components/marketing/legal/legal-section.tsx` — same pattern as `/privacy` and `/terms`.
4. **Add `DataDeletion` namespace to `messages/en.json` and `messages/es.json`** with 12 sections matching the existing `Privacy` / `Terms` shape.
5. **Add footer link** in `src/components/marketing/footer.tsx` Legal column after `/terms`.
6. **In Meta App Dashboard**, set "Data Deletion Instructions URL" field to `https://morfx.app/en/data-deletion` (English for reviewer default).
7. **Do NOT use `habeasdata@sic.gov.co`** — unverified. Use `contactenos@sic.gov.co` with subject "Queja por Protección de Datos Personales".
8. **DIAN art. 632 (5-year retention)** must be cited as legal-obligation exception under both GDPR Art 17(3)(b) and Ley 1581 principle of finalidad.
9. **Three-audience selector** (end-consumer / admin / visitor) is the multi-tenant SaaS best practice — do not skip this even if it adds page length.
10. **Bilingual via next-intl** is correct — same routing pattern as existing Privacy and Terms.

Open the full research doc for verbatim citations, design-token reference, and the full structural template.
