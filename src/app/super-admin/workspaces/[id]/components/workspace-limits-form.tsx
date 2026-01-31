'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { updateWorkspaceLimits } from '@/app/actions/super-admin'
import { WorkspaceLimits, TemplateCategory } from '@/lib/whatsapp/types'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface WorkspaceLimitsFormProps {
  workspaceId: string
  initialLimits: WorkspaceLimits | null
}

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'UTILITY', label: 'Utilidad' },
  { value: 'AUTHENTICATION', label: 'Autenticacion' }
]

export function WorkspaceLimitsForm({ workspaceId, initialLimits }: WorkspaceLimitsFormProps) {
  const [loading, setLoading] = useState(false)

  const [allowedCategories, setAllowedCategories] = useState<TemplateCategory[]>(
    initialLimits?.allowed_categories || ['MARKETING', 'UTILITY', 'AUTHENTICATION']
  )
  const [quickRepliesWithVariables, setQuickRepliesWithVariables] = useState(
    initialLimits?.quick_replies_with_variables || false
  )
  const [quickRepliesWithCategories, setQuickRepliesWithCategories] = useState(
    initialLimits?.quick_replies_with_categories || false
  )
  const [monthlyLimit, setMonthlyLimit] = useState<string>(
    initialLimits?.monthly_spend_limit_usd?.toString() || ''
  )
  const [alertThreshold, setAlertThreshold] = useState<number>(
    initialLimits?.alert_threshold_percent || 80
  )

  const handleCategoryToggle = (category: TemplateCategory, checked: boolean) => {
    if (checked) {
      setAllowedCategories([...allowedCategories, category])
    } else {
      setAllowedCategories(allowedCategories.filter(c => c !== category))
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      await updateWorkspaceLimits(workspaceId, {
        allowed_categories: allowedCategories,
        quick_replies_with_variables: quickRepliesWithVariables,
        quick_replies_with_categories: quickRepliesWithCategories,
        monthly_spend_limit_usd: monthlyLimit ? parseFloat(monthlyLimit) : null,
        alert_threshold_percent: alertThreshold
      })
      toast.success('Configuracion guardada')
    } catch (error) {
      toast.error('Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Template Categories */}
      <div className="space-y-3">
        <Label>Categorias de Templates Permitidas</Label>
        <div className="space-y-2">
          {CATEGORIES.map((cat) => (
            <div key={cat.value} className="flex items-center gap-2">
              <Checkbox
                id={cat.value}
                checked={allowedCategories.includes(cat.value)}
                onCheckedChange={(checked) => handleCategoryToggle(cat.value, !!checked)}
              />
              <label htmlFor={cat.value} className="text-sm">
                {cat.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Replies Features */}
      <div className="space-y-3">
        <Label>Funciones de Respuestas Rapidas</Label>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Variables dinamicas</p>
              <p className="text-xs text-muted-foreground">
                Permitir variables como {'{nombre}'} en quick replies
              </p>
            </div>
            <Switch
              checked={quickRepliesWithVariables}
              onCheckedChange={setQuickRepliesWithVariables}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Categorias</p>
              <p className="text-xs text-muted-foreground">
                Organizar quick replies en categorias
              </p>
            </div>
            <Switch
              checked={quickRepliesWithCategories}
              onCheckedChange={setQuickRepliesWithCategories}
            />
          </div>
        </div>
      </div>

      {/* Spending Limits */}
      <div className="space-y-3">
        <Label>Limites de Gasto</Label>
        <div className="grid gap-3">
          <div className="space-y-2">
            <label className="text-sm">Limite mensual (USD)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Sin limite"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Dejar vacio para sin limite
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm">Alerta al {alertThreshold}% del limite</label>
            <Input
              type="number"
              min="1"
              max="100"
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(parseInt(e.target.value) || 80)}
            />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Guardar Configuracion
      </Button>
    </div>
  )
}
