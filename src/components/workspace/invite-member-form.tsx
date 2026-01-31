'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Copy, Check, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteMember } from '@/app/actions/invitations'

const inviteSchema = z.object({
  email: z.string().min(1, 'El correo es requerido').email('Correo invalido'),
  role: z.enum(['admin', 'agent']),
})

type InviteFormData = z.infer<typeof inviteSchema>

interface InviteMemberFormProps {
  workspaceId: string
  onSuccess?: () => void
}

export function InviteMemberForm({ workspaceId, onSuccess }: InviteMemberFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'agent',
    },
  })

  async function onSubmit(data: InviteFormData) {
    setIsLoading(true)
    setError(null)
    setInviteLink(null)

    const result = await inviteMember(workspaceId, {
      email: data.email,
      role: data.role,
    })

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    // Generate invite link
    const link = `${window.location.origin}/invite/${result.token}`
    setInviteLink(link)
    reset()
    setIsLoading(false)
    onSuccess?.()
  }

  async function copyLink() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo electronico</Label>
          <Input
            id="email"
            type="email"
            placeholder="colaborador@empresa.com"
            {...register('email')}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Rol</Label>
          <select
            id="role"
            {...register('role')}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="agent">Agente - Solo puede ver y gestionar datos asignados</option>
            <option value="admin">Admin - Puede gestionar miembros y configuracion</option>
          </select>
          {errors.role && (
            <p className="text-sm text-destructive">{errors.role.message}</p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Enviando...' : 'Enviar invitacion'}
        </Button>
      </form>

      {inviteLink && (
        <div className="rounded-md border bg-muted/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4" />
            <span>Enlace de invitacion</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Comparte este enlace con el usuario. Expira en 7 dias.
          </p>
          <div className="flex gap-2">
            <Input
              value={inviteLink}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyLink}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
