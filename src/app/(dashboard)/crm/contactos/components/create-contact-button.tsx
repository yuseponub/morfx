'use client'

import * as React from 'react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContactDialog } from './contact-dialog'
import { toast } from 'sonner'

export function CreateContactButton({ v2 = false }: { v2?: boolean }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={v2 ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]' : ''}
        style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' } : undefined}
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Nuevo contacto
      </Button>
      <ContactDialog
        open={open}
        onOpenChange={setOpen}
        onSuccess={() => {
          setOpen(false)
          toast.success('Contacto creado')
        }}
      />
    </>
  )
}
