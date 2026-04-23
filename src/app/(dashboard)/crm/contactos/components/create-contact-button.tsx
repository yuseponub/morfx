'use client'

import * as React from 'react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContactDialog } from './contact-dialog'
import { toast } from 'sonner'

export function CreateContactButton() {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
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
