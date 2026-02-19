'use client'

import * as React from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LoaderIcon } from 'lucide-react'

const BULK_EDITABLE_FIELDS = [
  { value: 'carrier', label: 'Transportadora' },
  { value: 'shipping_city', label: 'Ciudad de envio' },
  { value: 'shipping_department', label: 'Departamento de envio' },
  { value: 'shipping_address', label: 'Direccion de envio' },
  { value: 'tracking_number', label: 'Numero de guia' },
  { value: 'name', label: 'Nombre del pedido' },
  { value: 'description', label: 'Notas / descripcion' },
] as const

interface BulkEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onConfirm: (field: string, value: string) => Promise<void>
}

export function BulkEditDialog({
  open, onOpenChange, selectedCount, onConfirm,
}: BulkEditDialogProps) {
  const [selectedField, setSelectedField] = React.useState<string>('')
  const [fieldValue, setFieldValue] = React.useState('')
  const [isUpdating, setIsUpdating] = React.useState(false)

  const handleConfirm = async () => {
    if (!selectedField || !fieldValue.trim()) return
    setIsUpdating(true)
    try {
      await onConfirm(selectedField, fieldValue.trim())
      onOpenChange(false)
      setSelectedField('')
      setFieldValue('')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {selectedCount} pedido{selectedCount > 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            Selecciona el campo y el valor que deseas aplicar a todos los pedidos seleccionados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Campo</Label>
            <Select value={selectedField} onValueChange={(v) => { setSelectedField(v); setFieldValue(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un campo" />
              </SelectTrigger>
              <SelectContent>
                {BULK_EDITABLE_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedField && (
            <div className="space-y-2">
              <Label>Nuevo valor</Label>
              <Input
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                placeholder={`Valor para ${BULK_EDITABLE_FIELDS.find(f => f.value === selectedField)?.label}`}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedField || !fieldValue.trim() || isUpdating}>
            {isUpdating ? (
              <><LoaderIcon className="h-4 w-4 mr-2 animate-spin" />Actualizando...</>
            ) : (
              'Aplicar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
