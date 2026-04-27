'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'

const loginSchema = z.object({
  email: z.string().min(1, 'El correo es requerido').email('Correo inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormData) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Credenciales inválidas'
          : authError.message
      )
      setIsLoading(false)
      return
    }

    router.push(redirect || '/crm')
    router.refresh()
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-sans)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--ink-2)',
    marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    padding: '10px 12px',
    background: 'var(--paper-0)',
    color: 'var(--ink-1)',
    border: '1px solid var(--ink-1)',
    borderRadius: 4,
    outline: 'none',
    boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.02)',
  }

  const errorStyle: React.CSSProperties = {
    marginTop: 6,
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    color: 'var(--rubric-2)',
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label htmlFor="email" style={labelStyle}>
          Correo electrónico
        </label>
        <input
          id="email"
          type="email"
          placeholder="correo@ejemplo.com"
          autoComplete="email"
          {...register('email')}
          aria-invalid={!!errors.email}
          style={inputStyle}
        />
        {errors.email && <p style={errorStyle}>{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="password" style={labelStyle}>
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          {...register('password')}
          aria-invalid={!!errors.password}
          style={inputStyle}
        />
        {errors.password && (
          <p style={errorStyle}>{errors.password.message}</p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--rubric-2)',
            background: 'color-mix(in oklch, var(--rubric-2) 8%, transparent)',
            border: '1px solid color-mix(in oklch, var(--rubric-2) 30%, transparent)',
            padding: '10px 12px',
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="btn pri"
        style={{
          width: '100%',
          justifyContent: 'center',
          padding: '11px 14px',
          fontSize: '13px',
          opacity: isLoading ? 0.65 : 1,
          cursor: isLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {isLoading ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </button>

      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--ink-3)',
          textAlign: 'center',
          paddingTop: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <Link
          href="/forgot-password"
          style={{ color: 'var(--ink-2)', textDecoration: 'none' }}
        >
          ¿Olvidaste tu contraseña?
        </Link>
        <span>
          ¿No tienes cuenta?{' '}
          <Link
            href={
              redirect
                ? `/signup?redirect=${encodeURIComponent(redirect)}`
                : '/signup'
            }
            style={{
              color: 'var(--rubric-2)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Crear cuenta
          </Link>
        </span>
      </div>
    </form>
  )
}
