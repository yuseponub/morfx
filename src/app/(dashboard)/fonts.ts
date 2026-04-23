// src/app/(dashboard)/fonts.ts
//
// Per-segment font preload for the editorial re-skin of the dashboard
// chrome + 7 modules (CRM, Pedidos, Tareas, Agentes, Automatizaciones,
// Analytics+Métricas, Configuración).
//
// Per D-DASH-05 + Next.js 16 docs: declaring fonts here makes Next
// preload them on ALL `/(dashboard)/**` routes. The whatsapp segment
// has its own `(dashboard)/whatsapp/fonts.ts` (shipped earlier in
// ui-redesign-conversaciones Plan 01) — Next next/font dedupes by hash,
// no double bundle.
//
// Cormorant Garamond is intentionally NOT loaded (UI-SPEC §6.3) —
// the cascade `'EB Garamond', 'Cormorant Garamond', Times, Georgia, serif`
// falls to Times/Georgia if EB Garamond fails (it never will, self-hosted).
// Avoids ~40KB unnecessary bundle.

import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'

export const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ebgaramond',
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  adjustFontFallback: true,
})

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: true,
})

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
  adjustFontFallback: true,
})
