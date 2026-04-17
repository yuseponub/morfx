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

interface BoldFormData {
  username: string
  password: string
}

export function BoldForm() {
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

  if (isLoading) {
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
