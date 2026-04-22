// src/app/(dashboard)/whatsapp/fonts.ts
//
// Per-route font preload for the editorial re-skin of /whatsapp.
// Per RESEARCH Pattern 2 + Next.js 16 docs: declaring fonts here makes
// Next preload them ONLY on /whatsapp/** routes (not on /crm, /tareas, etc.).
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
