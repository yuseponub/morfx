import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'Iniciar sesión · MORFX',
  description: 'Inicia sesión en tu cuenta de MORFX',
}

export default function LoginPage() {
  return (
    <section>
      {/* Wordmark mobile-only — el desktop lo muestra el aside del layout */}
      <Link
        href="/"
        className="mb-10 inline-flex items-baseline no-underline md:hidden"
        aria-label="morfx"
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '28px',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: 'var(--ink-1)',
          }}
        >
          morf
          <b style={{ color: 'var(--rubric-2)', fontWeight: 800 }}>·</b>x
        </span>
      </Link>

      <header className="mb-8">
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--rubric-2)',
            marginBottom: 10,
          }}
        >
          Acceso · cuenta
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            fontSize: '28px',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            color: 'var(--ink-1)',
            margin: 0,
          }}
        >
          Iniciar sesión{' '}
          <em
            style={{
              fontFamily: 'var(--font-sans)',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '15px',
              color: 'var(--ink-3)',
              marginLeft: 8,
            }}
          >
            — bienvenido de vuelta
          </em>
        </h1>
      </header>

      <Suspense>
        <LoginForm />
      </Suspense>
    </section>
  )
}
