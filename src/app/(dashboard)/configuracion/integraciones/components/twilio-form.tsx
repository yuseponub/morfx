'use client'

// ============================================================================
// Phase 20: Twilio Configuration Form
// Form for configuring Twilio credentials with test connection
// ============================================================================

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
  saveTwilioIntegration,
  testTwilioConnection,
  getTwilioIntegration,
} from '@/app/actions/integrations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, Plug, Eye, EyeOff, Phone } from 'lucide-react'

interface TwilioFormData {
  accountSid: string
  authToken: string
  phoneNumber: string
}

export function TwilioForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [testResult, setTestResult] = useState<{
    success: boolean
    messageSid?: string
    error?: string
  } | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [showTestForm, setShowTestForm] = useState(false)
  const [existingConfig, setExistingConfig] = useState<{
    id: string
    accountSid: string
    authToken: string
    phoneNumber: string
    isActive: boolean
  } | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<TwilioFormData>({
    defaultValues: {
      accountSid: '',
      authToken: '',
      phoneNumber: '',
    },
  })

  // Load existing config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await getTwilioIntegration()
        if (config) {
          setExistingConfig(config)
          reset({
            accountSid: config.accountSid,
            authToken: config.authToken,
            phoneNumber: config.phoneNumber,
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

  // Save credentials
  const onSubmit = (data: TwilioFormData) => {
    startTransition(async () => {
      const result = await saveTwilioIntegration({
        accountSid: data.accountSid,
        authToken: data.authToken,
        phoneNumber: data.phoneNumber,
      })

      if (result.success) {
        toast.success(existingConfig ? 'Credenciales actualizadas' : 'Twilio configurado')
        router.refresh()
        // Reload to get masked token
        const updated = await getTwilioIntegration()
        if (updated) {
          setExistingConfig(updated)
          reset({
            accountSid: updated.accountSid,
            authToken: updated.authToken,
            phoneNumber: updated.phoneNumber,
          })
        }
      } else {
        toast.error(result.error || 'Error al guardar')
      }
    })
  }

  // Test connection
  const handleTestConnection = async () => {
    if (!testPhone) {
      toast.error('Ingresa un numero de prueba')
      return
    }

    setIsTesting(true)
    setTestResult(null)

    const result = await testTwilioConnection(testPhone)

    setTestResult(result)
    setIsTesting(false)

    if (result.success) {
      toast.success('SMS de prueba enviado correctamente')
    } else {
      toast.error(result.error || 'Error al enviar SMS de prueba')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-teal-600" />
            Configuracion de Twilio
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
              <Phone className="h-5 w-5 text-teal-600" />
              Configuracion de Twilio
            </CardTitle>
            <CardDescription>
              Configura tus credenciales de Twilio para enviar SMS desde automatizaciones.
            </CardDescription>
          </div>
          {existingConfig && (
            <Badge
              variant={existingConfig.isActive ? 'default' : 'secondary'}
              className={existingConfig.isActive ? 'bg-teal-600 hover:bg-teal-700' : ''}
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
          {/* Credentials Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Credenciales</h3>

            <div className="space-y-2">
              <Label htmlFor="accountSid">Account SID</Label>
              <Input
                id="accountSid"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                {...register('accountSid', {
                  required: 'Account SID es requerido',
                  pattern: {
                    value: /^AC[a-f0-9]{32}$/i,
                    message: 'Formato invalido (debe empezar con AC)',
                  },
                })}
              />
              {errors.accountSid && (
                <p className="text-sm text-destructive">{errors.accountSid.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Encuentra tu Account SID en la consola de Twilio
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="authToken">Auth Token</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Input
                id="authToken"
                type={showToken ? 'text' : 'password'}
                placeholder={existingConfig ? '****' + existingConfig.authToken.slice(-4) : 'Tu Auth Token de Twilio'}
                {...register('authToken', {
                  required: 'Auth Token es requerido',
                  minLength: { value: 10, message: 'Auth Token demasiado corto' },
                })}
              />
              {errors.authToken && (
                <p className="text-sm text-destructive">{errors.authToken.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Numero de Telefono Twilio</Label>
              <Input
                id="phoneNumber"
                placeholder="+15017122661"
                {...register('phoneNumber', {
                  required: 'Numero de telefono es requerido',
                  pattern: {
                    value: /^\+[1-9]\d{6,14}$/,
                    message: 'Formato E.164 requerido (ej: +15017122661)',
                  },
                })}
              />
              {errors.phoneNumber && (
                <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Numero en formato E.164 que aparece en tu cuenta de Twilio
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              {existingConfig && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTestForm(!showTestForm)}
                >
                  <Plug className="h-4 w-4 mr-2" />
                  Probar conexion
                </Button>
              )}
            </div>

            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {existingConfig ? 'Guardar cambios' : 'Conectar Twilio'}
            </Button>
          </div>

          {/* Test Connection Form */}
          {showTestForm && existingConfig && (
            <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
              <h4 className="text-sm font-medium">Probar conexion</h4>
              <p className="text-xs text-muted-foreground">
                Se enviara un SMS de prueba al numero que ingreses.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="+573001234567"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Enviar'
                  )}
                </Button>
              </div>
              {testResult && (
                <div className="flex items-center gap-2 pt-1">
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-600">
                        SMS enviado (SID: {testResult.messageSid?.slice(0, 10)}...)
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-red-600">{testResult.error}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Instructions */}
        {!existingConfig && (
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Como obtener credenciales</h4>
            <ol className="list-decimal pl-4 space-y-1 text-sm text-muted-foreground">
              <li>
                Crea una cuenta en{' '}
                <a
                  href="https://www.twilio.com/console"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 hover:underline"
                >
                  Twilio Console
                </a>
              </li>
              <li>En el dashboard, copia tu <strong>Account SID</strong> y <strong>Auth Token</strong></li>
              <li>Compra un numero de telefono en <strong>Phone Numbers</strong></li>
              <li>Pega las credenciales aqui y prueba la conexion</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
