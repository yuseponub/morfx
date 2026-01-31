'use client'

import * as React from 'react'
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, TrashIcon, PackageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatCurrency } from './columns'
import type { Product, OrderProductFormData } from '@/lib/orders/types'

interface OrderLineItem extends OrderProductFormData {
  _id: string // Internal ID for React keys
}

interface ProductPickerProps {
  products: Product[]
  value: OrderProductFormData[]
  onChange: (items: OrderProductFormData[]) => void
  disabled?: boolean
}

export function ProductPicker({
  products,
  value,
  onChange,
  disabled,
}: ProductPickerProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [manualEntry, setManualEntry] = React.useState(false)
  const [manualSku, setManualSku] = React.useState('')
  const [manualTitle, setManualTitle] = React.useState('')
  const [manualPrice, setManualPrice] = React.useState('')

  // Convert value to line items with internal IDs
  const lineItems: OrderLineItem[] = React.useMemo(() => {
    return value.map((item, index) => ({
      ...item,
      _id: `item-${index}-${item.sku}`,
    }))
  }, [value])

  // Filter products by search
  const filteredProducts = React.useMemo(() => {
    if (!search) return products.slice(0, 30)
    const searchLower = search.toLowerCase()
    return products
      .filter(
        (p) =>
          p.title.toLowerCase().includes(searchLower) ||
          p.sku.toLowerCase().includes(searchLower)
      )
      .slice(0, 30)
  }, [products, search])

  // Calculate total
  const total = React.useMemo(() => {
    return lineItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  }, [lineItems])

  const handleAddProduct = (product: Product) => {
    const newItem: OrderProductFormData = {
      product_id: product.id,
      sku: product.sku,
      title: product.title,
      unit_price: product.price,
      quantity: 1,
    }
    onChange([...value, newItem])
    setPopoverOpen(false)
    setSearch('')
  }

  const handleAddManual = () => {
    if (!manualSku.trim() || !manualTitle.trim()) return

    const price = parseFloat(manualPrice.replace(/[^0-9]/g, '')) || 0
    const newItem: OrderProductFormData = {
      product_id: null,
      sku: manualSku.trim(),
      title: manualTitle.trim(),
      unit_price: price,
      quantity: 1,
    }
    onChange([...value, newItem])
    setManualEntry(false)
    setManualSku('')
    setManualTitle('')
    setManualPrice('')
    setPopoverOpen(false)
  }

  const handleRemoveItem = (index: number) => {
    const newItems = [...value]
    newItems.splice(index, 1)
    onChange(newItems)
  }

  const handleQuantityChange = (index: number, quantity: number) => {
    if (quantity < 1) return
    const newItems = [...value]
    newItems[index] = { ...newItems[index], quantity }
    onChange(newItems)
  }

  const handlePriceChange = (index: number, price: number) => {
    if (price < 0) return
    const newItems = [...value]
    newItems[index] = { ...newItems[index], unit_price: price }
    onChange(newItems)
  }

  const formatPriceInput = (val: string): string => {
    const numericValue = val.replace(/[^0-9]/g, '')
    if (!numericValue) return ''
    return new Intl.NumberFormat('es-CO').format(parseInt(numericValue, 10))
  }

  return (
    <div className="space-y-4">
      {/* Product list */}
      {lineItems.length > 0 && (
        <div className="space-y-2">
          {lineItems.map((item, index) => (
            <div
              key={item._id}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
            >
              <PackageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {item.sku}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleQuantityChange(index, item.quantity - 1)}
                    disabled={disabled || item.quantity <= 1}
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) =>
                      handleQuantityChange(index, parseInt(e.target.value, 10) || 1)
                    }
                    className="w-14 h-8 text-center"
                    min={1}
                    disabled={disabled}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleQuantityChange(index, item.quantity + 1)}
                    disabled={disabled}
                  >
                    +
                  </Button>
                </div>
                <div className="w-28">
                  <Input
                    value={formatPriceInput(item.unit_price.toString())}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      handlePriceChange(index, parseInt(raw, 10) || 0)
                    }}
                    className="h-8 text-right"
                    disabled={disabled}
                  />
                </div>
                <div className="w-24 text-right font-medium">
                  {formatCurrency(item.unit_price * item.quantity)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleRemoveItem(index)}
                  disabled={disabled}
                >
                  <TrashIcon className="h-4 w-4" />
                  <span className="sr-only">Eliminar</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add product button */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            disabled={disabled}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Agregar producto
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          {manualEntry ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Producto manual</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setManualEntry(false)}
                >
                  Cancelar
                </Button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="manual-sku">SKU</Label>
                  <Input
                    id="manual-sku"
                    value={manualSku}
                    onChange={(e) => setManualSku(e.target.value)}
                    placeholder="PRD-CUSTOM"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manual-title">Titulo</Label>
                  <Input
                    id="manual-title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Nombre del producto"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manual-price">Precio (COP)</Label>
                  <Input
                    id="manual-price"
                    value={formatPriceInput(manualPrice)}
                    onChange={(e) => setManualPrice(e.target.value)}
                    placeholder="$ 0"
                    inputMode="numeric"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleAddManual}
                  className="w-full"
                  disabled={!manualSku.trim() || !manualTitle.trim()}
                >
                  Agregar
                </Button>
              </div>
            </div>
          ) : (
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar producto..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    No se encontraron productos
                  </div>
                </CommandEmpty>
                <CommandGroup heading="Productos del catalogo">
                  {filteredProducts.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={product.id}
                      onSelect={() => handleAddProduct(product)}
                      className="flex items-center gap-2"
                    >
                      <PackageIcon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{product.title}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {product.sku}
                        </div>
                      </div>
                      <div className="text-sm font-medium">
                        {formatCurrency(product.price)}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => setManualEntry(true)}
                    className="flex items-center gap-2"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Agregar producto manual
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>

      {/* Total */}
      {lineItems.length > 0 && (
        <div className="flex items-center justify-between pt-3 border-t">
          <span className="font-medium">Total</span>
          <span className="text-lg font-bold">{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  )
}
