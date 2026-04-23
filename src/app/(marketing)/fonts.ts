// src/app/(marketing)/fonts.ts
//
// Per-segment font preload for the editorial re-skin of the marketing pages
// (landing + terms + privacy). Análogo a src/app/(dashboard)/whatsapp/fonts.ts,
// pero para el segment `(marketing)`.
//
// Next.js 15 App Router carga fuentes per-segment: declarar aquí hace que Next
// las incluya SOLO en rutas de `(marketing)/**`, no en dashboard ni API routes.
// D-LND-03 (CONTEXT): cada segment tiene su propio loader — Next no duplica
// las requests si los hash coinciden.
//
// Las 3 familias mapean 1:1 a las variables CSS que `.theme-editorial` consume
// desde `src/app/globals.css`:
//   --font-ebgaramond      → display + headings (EB Garamond)
//   --font-inter           → body + UI copy     (Inter)
//   --font-jetbrains-mono  → metadata + mono    (JetBrains Mono)

import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google';

export const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ebgaramond',
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  adjustFontFallback: true,
});

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: true,
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
  adjustFontFallback: true,
});
