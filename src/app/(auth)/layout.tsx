import Link from 'next/link'
import { ebGaramond, inter, jetbrainsMono } from './fonts'

/**
 * Auth layout editorial 2026-04-27. Reemplaza el gradient slate básico
 * por el sistema editorial v2.1 (paper/ink/rubric + EB Garamond/Inter/
 * JetBrains). Pattern hermano de `(marketing)/[locale]/layout.tsx` —
 * mismo wrapper `.theme-editorial`, misma carga de fonts per-segment.
 *
 * Layout 2-col en desktop, brand panel a la izquierda + form a la derecha.
 * En mobile colapsa a 1-col (solo el form, el brand panel se oculta md-).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={`${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} theme-editorial min-h-screen`}
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
        {/* Brand panel — visible md+, oculto en mobile */}
        <aside
          className="relative hidden flex-col justify-between border-r p-12 md:flex"
          style={{
            background: 'var(--bg-sidebar)',
            borderColor: 'var(--ink-1)',
          }}
        >
          {/* Wordmark */}
          <Link
            href="/"
            className="inline-flex items-baseline no-underline"
            aria-label="morfx"
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '36px',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: 'var(--ink-1)',
              }}
            >
              morf
              <b style={{ color: 'var(--rubric-2)', fontWeight: 800 }}>·</b>x
            </span>
          </Link>

          {/* Manifesto */}
          <div className="max-w-md">
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--rubric-2)',
                marginBottom: 12,
              }}
            >
              Plataforma · MORFX
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '32px',
                lineHeight: 1.15,
                letterSpacing: '-0.015em',
                color: 'var(--ink-1)',
                marginBottom: 16,
              }}
            >
              Un sistema para vender, responder y entregar.
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                lineHeight: 1.6,
                color: 'var(--ink-3)',
              }}
            >
              CRM, atención conversacional y automatizaciones en una sola
              plataforma para empresas de e-commerce que quieren vender,
              responder y cumplir con mayor precisión y menor costo operativo.
            </p>
          </div>

          {/* Back to landing */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 no-underline transition-colors"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-2)',
            }}
          >
            <span aria-hidden>←</span>
            Volver al sitio
          </Link>
        </aside>

        {/* Form area */}
        <main
          className="flex items-center justify-center p-6 md:p-12"
          style={{ background: 'var(--bg-app)' }}
        >
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  )
}
