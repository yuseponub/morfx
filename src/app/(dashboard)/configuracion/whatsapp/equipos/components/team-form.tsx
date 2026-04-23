'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { createTeam, updateTeam, Team } from '@/app/actions/teams'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface TeamFormProps {
  team?: Team
  onSuccess?: () => void
  v2?: boolean
}

export function TeamForm({ team, onSuccess, v2: v2Prop }: TeamFormProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(team?.name || '')
  const [isDefault, setIsDefault] = useState(team?.is_default || false)

  const isEditing = !!team

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isEditing) {
        const result = await updateTeam(team.id, { name, is_default: isDefault })
        if ('error' in result) {
          toast.error(result.error)
          setLoading(false)
          return
        }
        toast.success('Equipo actualizado')
      } else {
        const result = await createTeam({ name, is_default: isDefault })
        if ('error' in result) {
          toast.error(result.error)
          setLoading(false)
          return
        }
        toast.success('Equipo creado')
      }
      router.refresh()
      onSuccess?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  const inputV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
    : ''
  const labelV2 = v2 ? 'text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]' : ''
  const hintV2 = v2 ? 'text-[11px] text-[var(--ink-3)]' : 'text-xs text-muted-foreground'
  const switchV2 = v2
    ? 'data-[state=checked]:bg-[oklch(0.58_0.14_150)] data-[state=unchecked]:bg-[var(--paper-3)] data-[state=unchecked]:border data-[state=unchecked]:border-[var(--border)]'
    : ''
  const btnPrimaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] text-[13px] font-semibold'
    : ''
  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name" className={labelV2} style={v2FontSans}>Nombre del equipo</Label>
        <Input
          id="name"
          className={inputV2}
          style={v2FontSans}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Ventas, Soporte, Cobros"
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className={labelV2} style={v2FontSans}>Equipo por defecto</Label>
          <p className={hintV2} style={v2FontSans}>
            Las conversaciones nuevas se asignaran a este equipo
          </p>
        </div>
        <Switch
          checked={isDefault}
          onCheckedChange={setIsDefault}
          className={switchV2}
        />
      </div>

      <div className={cn('flex justify-end gap-2 pt-2', v2 && 'border-t border-[var(--border)]')}>
        <Button type="submit" disabled={loading || !name.trim()} className={btnPrimaryV2} style={v2FontSans}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? 'Guardar Cambios' : 'Crear Equipo'}
        </Button>
      </div>
    </form>
  )
}
