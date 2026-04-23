'use client'

// ============================================================================
// BOLD Payment Link Configuration Form
// Form for saving BOLD credentials (username + password)
// Pattern: standard credentials form following the integraciones tab style
// ============================================================================

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
  saveBoldIntegration,
  getBoldIntegration,
} from '@/app/actions/bold'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Eye, EyeOff, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface BoldFormData {
  username: string
  password: string
}

export function BoldForm({ v2: v2Prop }: { v2?: boolean } = {}) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [existingConfig, setExistingConfig] = useState<{
    id: string
    username: string
    password: string
    isActive: boolean
  } | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BoldFormData>({
    defaultValues: {
      username: '',
      password: '',
    },
  })

  // Load existing config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await getBoldIntegration()
        if (config) {
          setExistingConfig(config)
          reset({
            username: config.username,
            password: config.password,
          })
        }
      } catch {
        // No config exists, that's fine
      } finally {
        setIsLoading(false)
      }
    }
    loadConfig()
  }, [reset])

  const onSubmit = (data: BoldFormData) => {
    startTransition(async () => {
      const result = await saveBoldIntegration({
        username: data.username,
        password: data.password,
      })

      if (result.success) {
        toast.success(existingConfig ? 'Credenciales actualizadas' : 'BOLD configurado')
        router.refresh()
        const updated = await getBoldIntegration()
        if (updated) {
          setExistingConfig(updated)
          reset({
            username: updated.username,
            password: updated.password,
          })
        }
      } else {
        toast.error(result.error || 'Error al guardar')
      }
    })
  }

  // Editorial tokens (v2)
  const inputV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
    : ''
  const labelV2 = v2 ? 'text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]' : ''
  const hintV2 = v2 ? 'text-[11px] text-[var(--ink-3)]' : 'text-xs text-muted-foreground'
  const errorV2 = v2 ? 'text-[12px] text-[oklch(0.45_0.14_28)]' : 'text-sm text-destructive'
  const sectionHeadingV2 = v2 ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--rubric-2)] m-0' : 'text-sm font-medium'
  const btnPrimaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] text-[13px] font-semibold'
    : ''
  const btnGhostV2 = v2 ? 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]' : ''
  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined

  if (isLoading) {
    if (v2) {
      return (
        <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
            <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
              <CreditCard className="h-5 w-5" />
              Configuracion de BOLD
            </h3>
          </div>
          <div className="px-[18px] py-[16px]">
            <div className="h-48 animate-pulse bg-[var(--paper-2)] rounded" />
          </div>
        </div>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Configuracion de BOLD
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    )
  }

  if (v2) {
    return (
      <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
        <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                <CreditCard className="h-5 w-5" />
                Configuracion de BOLD
              </h3>
              <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={v2FontSans}>
                Configura tus credenciales de BOLD para generar links de pago desde WhatsApp.
              </p>
            </div>
            {existingConfig ? (
              <span className={cn('mx-tag', existingConfig.isActive ? 'mx-tag--verdigris' : 'mx-tag--ink')}>
                {existingConfig.isActive ? 'Conectado' : 'Inactivo'}
              </span>
            ) : (
              <span className="mx-tag mx-tag--ink">No configurado</span>
            )}
          </div>
        </div>
        <div className="px-[18px] py-[16px]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h3 className={sectionHeadingV2} style={v2FontSans}>Credenciales de BOLD</h3>

              <div className="space-y-2">
                <Label htmlFor="bold-username" className={labelV2} style={v2FontSans}>Usuario / Email</Label>
                <Input
                  id="bold-username"
                  placeholder="tu-email@ejemplo.com"
                  className={inputV2}
                  style={v2FontSans}
                  {...register('username', { required: 'El usuario es requerido' })}
                />
                {errors.username && (
                  <p className={errorV2} style={v2FontSans}>{errors.username.message}</p>
                )}
                <p className={hintV2} style={v2FontSans}>
                  El email o usuario con el que inicias sesion en bold.co
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bold-password" className={labelV2} style={v2FontSans}>Contrasena</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                    className={btnGhostV2}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Input
                  id="bold-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={existingConfig ? '****' + existingConfig.password.slice(-4) : 'Tu contrasena de BOLD'}
                  className={inputV2}
                  style={v2FontSans}
                  {...register('password', { required: 'La contrasena es requerida' })}
                />
                {errors.password && (
                  <p className={errorV2} style={v2FontSans}>{errors.password.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-[var(--border)]">
              <Button type="submit" disabled={isPending} className={btnPrimaryV2} style={v2FontSans}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {existingConfig ? 'Guardar cambios' : 'Conectar BOLD'}
              </Button>
            </div>
          </form>

          {!existingConfig && (
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <h4 className={cn(sectionHeadingV2, 'mb-2')} style={v2FontSans}>Como funciona</h4>
              <ol className="list-decimal pl-4 space-y-1 text-[13px] text-[var(--ink-2)]" style={v2FontSans}>
                <li>Ingresa tus credenciales de inicio de sesion de <strong>bold.co</strong></li>
                <li>Desde cualquier conversacion de WhatsApp, usa el boton <strong>Cobrar con BOLD</strong></li>
                <li>Ingresa el monto y descripcion, y se generara un link de pago</li>
                <li>Copia el link y envialo al cliente por WhatsApp</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Configuracion de BOLD
            </CardTitle>
            <CardDescription>
              Configura tus credenciales de BOLD para generar links de pago desde WhatsApp.
            </CardDescription>
          </div>
          {existingConfig && (
            <Badge
              variant={existingConfig.isActive ? 'default' : 'secondary'}
              className={existingConfig.isActive ? 'bg-blue-600 hover:bg-blue-700' : ''}
            >
              {existingConfig.isActive ? 'Conectado' : 'Inactivo'}
            </Badge>
          )}
          {!existingConfig && (
            <Badge variant="outline">No configurado</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Credenciales de BOLD</h3>

            <div className="space-y-2">
              <Label htmlFor="bold-username">Usuario / Email</Label>
              <Input
                id="bold-username"
                placeholder="tu-email@ejemplo.com"
                {...register('username', {
                  required: 'El usuario es requerido',
                })}
              />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                El email o usuario con el que inicias sesion en bold.co
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="bold-password">Contrasena</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Input
                id="bold-password"
                type={showPassword ? 'text' : 'password'}
                placeholder={existingConfig ? '****' + existingConfig.password.slice(-4) : 'Tu contrasena de BOLD'}
                {...register('password', {
                  required: 'La contrasena es requerida',
                })}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {existingConfig ? 'Guardar cambios' : 'Conectar BOLD'}
            </Button>
          </div>
        </form>

        {!existingConfig && (
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Como funciona</h4>
            <ol className="list-decimal pl-4 space-y-1 text-sm text-muted-foreground">
              <li>Ingresa tus credenciales de inicio de sesion de <strong>bold.co</strong></li>
              <li>Desde cualquier conversacion de WhatsApp, usa el boton <strong>Cobrar con BOLD</strong></li>
              <li>Ingresa el monto y descripcion, y se generara un link de pago</li>
              <li>Copia el link y envialo al cliente por WhatsApp</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
