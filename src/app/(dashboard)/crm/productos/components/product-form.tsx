'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { createProduct, updateProduct } from '@/app/actions/products'
import { LoaderIcon } from 'lucide-react'
import type { Product } from '@/lib/orders/types'

const productFormSchema = z.object({
  sku: z.string().min(1, 'El SKU es requerido'),
  title: z.string().min(1, 'El titulo es requerido'),
  price: z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  shopify_product_id: z.string().optional().or(z.literal('')),
  is_active: z.boolean(),
})

type ProductFormData = z.infer<typeof productFormSchema>

interface ProductFormProps {
  mode: 'create' | 'edit'
  defaultValues?: ProductFormData
  productId?: string
  onSuccess?: () => void
}

export function ProductForm({
  mode,
  defaultValues,
  productId,
  onSuccess,
}: ProductFormProps) {
  const [isPending, setIsPending] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: defaultValues || {
      sku: '',
      title: '',
      price: 0,
      shopify_product_id: '',
      is_active: true,
    },
  })

  const handleSubmit = async (data: ProductFormData) => {
    setIsPending(true)
    setServerError(null)

    try {
      const formData = new FormData()
      formData.append('sku', data.sku)
      formData.append('title', data.title)
      formData.append('price', data.price.toString())
      formData.append('shopify_product_id', data.shopify_product_id || '')
      formData.append('is_active', data.is_active.toString())

      const result =
        mode === 'edit' && productId
          ? await updateProduct(productId, formData)
          : await createProduct(formData)

      if ('error' in result) {
        if (result.field) {
          form.setError(result.field as keyof ProductFormData, {
            message: result.error,
          })
        } else {
          setServerError(result.error)
        }
        return
      }

      onSuccess?.()
    } finally {
      setIsPending(false)
    }
  }

  // Format price input for display
  const formatPriceInput = (value: string): string => {
    // Remove non-numeric characters except decimal point
    const numericValue = value.replace(/[^0-9]/g, '')
    if (!numericValue) return ''
    return new Intl.NumberFormat('es-CO').format(parseInt(numericValue, 10))
  }

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '')
    const numericValue = rawValue ? parseInt(rawValue, 10) : 0
    form.setValue('price', numericValue, { shouldValidate: true })
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      {serverError && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {serverError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="sku">SKU *</Label>
        <Input
          id="sku"
          {...form.register('sku')}
          placeholder="PRD-001"
          disabled={isPending}
          className="font-mono"
        />
        {form.formState.errors.sku && (
          <p className="text-sm text-destructive">
            {form.formState.errors.sku.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Titulo *</Label>
        <Input
          id="title"
          {...form.register('title')}
          placeholder="Nombre del producto"
          disabled={isPending}
        />
        {form.formState.errors.title && (
          <p className="text-sm text-destructive">
            {form.formState.errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="price">Precio (COP) *</Label>
        <Input
          id="price"
          value={formatPriceInput(form.watch('price').toString())}
          onChange={handlePriceChange}
          placeholder="$ 0"
          disabled={isPending}
          inputMode="numeric"
        />
        {form.formState.errors.price && (
          <p className="text-sm text-destructive">
            {form.formState.errors.price.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="shopify_product_id">Shopify Product ID</Label>
        <Input
          id="shopify_product_id"
          {...form.register('shopify_product_id')}
          placeholder="gid://shopify/Product/..."
          disabled={isPending}
          className="text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Se llenara automaticamente al sincronizar con Shopify
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_active"
          checked={form.watch('is_active')}
          onCheckedChange={(checked) =>
            form.setValue('is_active', !!checked, { shouldValidate: true })
          }
          disabled={isPending}
        />
        <Label htmlFor="is_active" className="cursor-pointer">
          Producto activo
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'edit' ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}

// Helper to convert Product to form data
export function productToFormData(product: Product): ProductFormData {
  return {
    sku: product.sku,
    title: product.title,
    price: product.price,
    shopify_product_id: product.shopify_product_id || '',
    is_active: product.is_active,
  }
}
