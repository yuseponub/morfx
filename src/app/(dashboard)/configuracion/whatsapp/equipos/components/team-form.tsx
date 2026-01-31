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

interface TeamFormProps {
  team?: Team
  onSuccess?: () => void
}

export function TeamForm({ team, onSuccess }: TeamFormProps) {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre del equipo</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Ventas, Soporte, Cobros"
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Equipo por defecto</Label>
          <p className="text-xs text-muted-foreground">
            Las conversaciones nuevas se asignaran a este equipo
          </p>
        </div>
        <Switch
          checked={isDefault}
          onCheckedChange={setIsDefault}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={loading || !name.trim()}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? 'Guardar Cambios' : 'Crear Equipo'}
        </Button>
      </div>
    </form>
  )
}
