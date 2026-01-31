'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { acceptInvitation } from '@/app/actions/invitations'

interface AcceptInvitationButtonProps {
  token: string
  disabled?: boolean
}

export function AcceptInvitationButton({ token, disabled }: AcceptInvitationButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setIsLoading(true)
    setError(null)

    const result = await acceptInvitation(token)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    // Redirect to dashboard
    router.push('/crm')
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button
        onClick={handleAccept}
        disabled={disabled || isLoading}
        className="w-full"
      >
        {isLoading ? 'Aceptando...' : 'Aceptar invitacion'}
      </Button>
    </div>
  )
}
