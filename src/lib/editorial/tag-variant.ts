// src/lib/editorial/tag-variant.ts
//
// GAP-03 (standalone ui-redesign-editorial-core, Plan 05).
//
// Pure helper that maps a tag's REAL stored color (a `#rrggbb` / `#rgb` hex from
// the DB `tags.color` column) to the NEAREST editorial `mx-tag--*` variant by
// hue. This replaces the previous hardcoded name→variant tables across the 3
// editorial screens (ficha tag cloud, contactos table, pedidos kanban/table):
// the operator wants tags to respect the configured color while staying inside
// the editorial palette (rubric / gold / indigo / verdigris / ink / success).
//
// The mapping keeps the editorial accent set — it does NOT emit arbitrary inline
// colors. Tags continue to render via `MxTag` / `mx-tag--{variant}` (no shadcn
// Badge, no inline arbitrary backgrounds). Only the variant SELECTION changes.
//
// This module is framework-free and side-effect-free so it can be unit tested in
// isolation (`src/lib/editorial/__tests__/tag-variant.test.ts`). It NEVER throws:
// null / empty / malformed input falls back to `'ink'` (neutral).

/** Editorial tag variant union — mirrors `MxTagVariant` in `mx-tag.tsx`. */
export type MxTagVariant =
  | 'rubric'
  | 'gold'
  | 'indigo'
  | 'verdigris'
  | 'ink'
  | 'success'
  | 'violet'
  | 'rose'

/**
 * Parse a hex color string into 8-bit RGB channels.
 *
 * Tolerates: leading/trailing whitespace, missing `#`, 3-digit shorthand
 * (`#abc` → `aabbcc`) and 6-digit form. Returns `null` for anything else
 * (empty, wrong length, non-hex chars) so callers can fail safe.
 *
 * Exported (Vivificación v3 ajustes 2026-06): reused by
 * `stageHexToVivClass` in kanban-column.tsx to project `stage.color`.
 */
export function parseHex(input: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!input || typeof input !== 'string') return null
  let hex = input.trim().toLowerCase()
  if (hex.startsWith('#')) hex = hex.slice(1)
  // Expand 3-digit shorthand to 6-digit.
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  if (hex.length !== 6) return null
  if (!/^[0-9a-f]{6}$/.test(hex)) return null
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return { r, g, b }
}

/**
 * Convert 8-bit RGB to HSL.
 * h ∈ [0,360), s ∈ [0,1], l ∈ [0,1].
 *
 * Exported (Vivificación v3 ajustes 2026-06): reused by
 * `stageHexToVivClass` in kanban-column.tsx.
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min

  let h = 0
  let s = 0

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6
        break
      case gn:
        h = (bn - rn) / delta + 2
        break
      default: // bn
        h = (rn - gn) / delta + 4
        break
    }
    h *= 60
    if (h < 0) h += 360
  }

  return { h, s, l }
}

/**
 * Map a real tag color (hex) to the nearest editorial `mx-tag--*` variant.
 *
 * Bucketing (UI-SPEC §7 editorial accents):
 *  - invalid / empty hex          → `ink`   (fail-safe, never throws)
 *  - very low saturation          → `ink`   (greys)
 *  - near-black / near-white       → `ink`
 *  - red            (~345–20°)     → `rubric`
 *  - amber / yellow (~20–70°)      → `gold`
 *  - green          (~70–160°)     → `verdigris`, or `success` for a saturated
 *                                    true-green (~110–150°, parity with the
 *                                    kanban "C" confirmado tag)
 *  - cyan / teal    (~160–195°)    → `verdigris`
 *  - sky / blue / indigo (~195–245°) → `indigo`
 *  - violet         (~245–320°)    → `violet`
 *  - pink / magenta (~320–345°)    → `rose`
 *
 * @param hex The stored tag color (e.g. `#e11d48`). `null`/invalid → `'ink'`.
 */
export function tagColorToVariant(hex: string | null | undefined): MxTagVariant {
  const rgb = parseHex(hex)
  if (!rgb) return 'ink'

  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b)

  // Neutral greys / slate / near-black / near-white → ink. A color with low
  // chroma carries no usable hue signal (e.g. tailwind slate s≈0.16), so it
  // must not be forced into an accent.
  if (s < 0.2) return 'ink'
  if (l < 0.08) return 'ink'
  if (l > 0.94) return 'ink'

  // Hue buckets. Reds wrap around 360→0. (Vivificación v3 2026-06: violet
  // and rose split off from indigo/rubric so e.g. RECO #8b5cf6 h≈258 → violet
  // and Rosa #ec4899 h≈330 → rose, matching the DB palette projection.)
  if (h >= 345 || h < 20) return 'rubric'
  if (h < 70) return 'gold'
  if (h < 160) {
    // Saturated true-green → success (parity with the kanban "C" confirmado
    // tag, mx-tag--success over --semantic-success). Otherwise verdigris.
    if (h >= 110 && h <= 150 && s >= 0.4) return 'success'
    return 'verdigris'
  }
  if (h < 195) return 'verdigris' // teal / cyan nuance folds into verdigris
  if (h < 245) return 'indigo'   // azul 217 + indigo 239
  if (h < 320) return 'violet'   // violeta 258–300
  return 'rose'                  // 320–345 (rosa 330)
}
