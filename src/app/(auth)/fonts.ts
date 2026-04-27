// Per-segment font preload for `(auth)` editorial pages (login, signup,
// forgot-password, reset-password). Coherente con `(marketing)/fonts.ts`
// y `(dashboard)/fonts.ts` — mismas 3 familias, mismas CSS variables que
// el bloque `.theme-editorial` de globals.css consume.

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
