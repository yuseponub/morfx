'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { updateSMSConfig } from '@/app/actions/sms'

interface SmsSettingsProps {
  allowNegativeBalance: boolean
  isActive: boolean
}

export function SmsSettings({ allowNegativeBalance, isActive }: SmsSettingsProps) {
  // The toggle shown to user is "block when zero" which is the INVERSE of allow_negative_balance
  const [blockOnZero, setBlockOnZero] = useState(!allowNegativeBalance)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const hasChanges = blockOnZero !== !allowNegativeBalance

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const result = await updateSMSConfig({ allowNegativeBalance: !blockOnZero })
    setSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado del servicio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge
              variant={isActive ? 'default' : 'secondary'}
              className={isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : ''}
            >
              {isActive ? 'Activo' : 'Inactivo'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {isActive
                ? 'El servicio de SMS esta activo para este workspace'
                : 'El servicio de SMS no esta activo. Contacta al administrador.'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Balance settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuracion de saldo</CardTitle>
          <CardDescription>
            Controla como se comporta el envio de SMS cuando el saldo llega a cero.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Bloquear envio cuando saldo es $0</p>
              <p className="text-xs text-muted-foreground">
                {blockOnZero
                  ? 'Los SMS no se enviaran cuando el saldo llegue a cero. Las automatizaciones registraran un error.'
                  : 'Los SMS se seguiran enviando aunque el saldo sea negativo. Se recomienda recargar lo antes posible.'}
              </p>
            </div>
            <Switch
              checked={blockOnZero}
              onCheckedChange={setBlockOnZero}
            />
          </div>

          {hasChanges && (
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              {saved && (
                <span className="text-sm text-green-600 dark:text-green-400">Guardado</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
