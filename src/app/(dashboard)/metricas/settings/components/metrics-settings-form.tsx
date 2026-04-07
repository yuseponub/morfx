'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { updateMetricsSettings } from '@/app/actions/metricas-conversaciones-settings'
import type { MetricsSettings } from '@/lib/metricas-conversaciones/types'

interface Props {
  initial: MetricsSettings
}

export function MetricsSettingsForm({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [reopenDays, setReopenDays] = useState<number>(initial.reopen_window_days)
  const [tagName, setTagName] = useState(initial.scheduled_tag_name)
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateMetricsSettings({
        enabled,
        reopen_window_days: Number(reopenDays),
        scheduled_tag_name: tagName.trim(),
      })
      if (result.ok) {
        toast.success('Configuracion guardada', {
          description: enabled
            ? 'El modulo esta activo. Recarga la pagina para ver el item en el sidebar.'
            : 'El modulo quedo desactivado.',
        })
        // Sync state from server response (covers defaults applied server-side).
        setEnabled(result.settings.enabled)
        setReopenDays(result.settings.reopen_window_days)
        setTagName(result.settings.scheduled_tag_name)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parametros del modulo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="metrics-enabled">Modulo activo</Label>
            <p className="text-xs text-muted-foreground">
              Si esta desactivado, el item &quot;Metricas&quot; no aparece en el sidebar
              y la ruta /metricas redirige a CRM.
            </p>
          </div>
          <Switch
            id="metrics-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="metrics-reopen">
            Dias de silencio para &quot;reabierta&quot;
          </Label>
          <Input
            id="metrics-reopen"
            type="number"
            min={1}
            max={90}
            step={1}
            value={reopenDays}
            onChange={(e) => setReopenDays(Number(e.target.value))}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Default: 7. Rango valido: 1–90 dias. Un contacto que vuelve a
            escribir tras este numero de dias sin actividad cuenta como
            &quot;reabierta&quot;.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="metrics-tag">Tag de &quot;valoracion agendada&quot;</Label>
          <Input
            id="metrics-tag"
            type="text"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Default: VAL. Debe coincidir con el nombre exacto del tag en este
            workspace. El modulo cuenta un agendamiento el dia en que se aplica
            este tag a un contacto.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
