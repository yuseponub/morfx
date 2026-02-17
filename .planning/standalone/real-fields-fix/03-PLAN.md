---
phase: standalone/real-fields-fix
plan: 03
title: CRM UI — show and edit real fields
wave: 3
depends_on: ["01", "02"]
autonomous: true
files_modified:
  - src/app/(dashboard)/crm/pedidos/components/order-form.tsx
  - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
  - src/app/(dashboard)/crm/contactos/components/contact-form.tsx
  - src/app/(dashboard)/crm/contactos/[id]/page.tsx
  - src/app/(dashboard)/crm/contactos/components/columns.tsx
  - src/components/contacts/city-combobox.tsx
must_haves:
  - CityCombobox emits department alongside city value via onDepartmentChange callback
  - Order form has "Referencia" (name) text input
  - Order form auto-sets shipping_department when shipping_city changes
  - Order sheet displays name and shipping_department
  - Kanban card shows order name when present
  - Contact form auto-sets department when city changes
  - Contact detail page shows department
  - Contact table has department column
---

# Plan 03: CRM UI — Show and Edit Real Fields

## Goal
Make all real fields visible and editable in the CRM interface. Department auto-derives from city selection.

## Tasks

<task id="03.1" name="Extend CityCombobox with onDepartmentChange">
**Action:** Edit `src/components/contacts/city-combobox.tsx`

Add optional `onDepartmentChange?: (department: string) => void` prop.

When a city is selected in `selectCity()`, call `onDepartmentChange?.(city.department)`:
```typescript
const selectCity = (cityValue: string) => {
  const city = colombiaCities.find((c) => c.value === cityValue)
  if (city) {
    onChange(cityValue)
    onDepartmentChange?.(city.department)  // ADD
    setSearch('')
    setOpen(false)
  }
}
```

Update the interface:
```typescript
interface CityComboboxProps {
  value: string
  onChange: (value: string) => void
  onDepartmentChange?: (department: string) => void  // ADD
  ...
}
```

**Verify:** CityCombobox calls `onDepartmentChange` when a city is selected.
</task>

<task id="03.2" name="Add name + shipping_department to order form">
**Action:** Edit `src/app/(dashboard)/crm/pedidos/components/order-form.tsx`

1. Add `name` and `shipping_department` to `FormData` interface:
   ```typescript
   name: string | null
   shipping_department: string | null
   ```

2. Add `name` and `shipping_department` to `defaultValues`:
   - Edit mode: `name: order.name, shipping_department: order.shipping_department`
   - Create mode: `name: null, shipping_department: null`

3. Add "Referencia" input in the Details section (before pipeline/stage):
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="name">Referencia</Label>
     <Input
       {...form.register('name')}
       placeholder="Ej: #1001, PED-2024-001"
       disabled={isPending}
     />
   </div>
   ```

4. Update CityCombobox in shipping section to auto-set department:
   ```tsx
   <Controller
     control={form.control}
     name="shipping_city"
     render={({ field }) => (
       <CityCombobox
         id="shipping_city"
         value={field.value || ''}
         onChange={field.onChange}
         onDepartmentChange={(dept) => form.setValue('shipping_department', dept)}
         disabled={isPending}
       />
     )}
   />
   ```
   The department is auto-set but not shown as a separate input (it's metadata of the city).

5. Add `name` and `shipping_department` to the `formData` object in `handleSubmit`:
   ```typescript
   name: data.name ?? null,
   shipping_department: data.shipping_department ?? null,
   ```

**Verify:** Form has name input. Department auto-sets from city. Both submitted to server action.
</task>

<task id="03.3" name="Display name + shipping_department in order sheet">
**Action:** Edit `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx`

1. In the header section, show the order name (if exists) below contact name:
   ```tsx
   <SheetTitle className="text-xl">
     {contact?.name || 'Pedido sin contacto'}
   </SheetTitle>
   {order.name && (
     <p className="text-sm font-mono text-muted-foreground">{order.name}</p>
   )}
   ```

2. In the Shipping section, add department display after city:
   ```tsx
   {order.shipping_city && (
     <p className="text-muted-foreground">
       {order.shipping_city}
       {order.shipping_department && `, ${order.shipping_department}`}
     </p>
   )}
   ```

**Verify:** Order sheet shows name and department when present.
</task>

<task id="03.4" name="Show order name on kanban card">
**Action:** Edit `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx`

Add order name display below contact name (if exists):
```tsx
{/* Header: Contact name + value */}
<div className={cn('flex items-start justify-between gap-2 mb-2', onSelectChange && 'pl-5')}>
  <div className="flex items-center gap-2 min-w-0 flex-1">
    <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
    <div className="min-w-0 flex-1">
      <span className="font-medium text-sm truncate block">
        {order.contact?.name || 'Sin contacto'}
      </span>
      {order.name && (
        <span className="text-[11px] font-mono text-muted-foreground truncate block">
          {order.name}
        </span>
      )}
    </div>
  </div>
  <span className="font-semibold text-sm text-primary shrink-0">
    {formatCurrency(order.total_value)}
  </span>
</div>
```

**Verify:** Kanban cards show order name (e.g., "#1001") when present.
</task>

<task id="03.5" name="Add department to contact form">
**Action:** Edit `src/app/(dashboard)/crm/contactos/components/contact-form.tsx`

1. Add `department` to Zod schema:
   ```typescript
   department: z.string().optional().or(z.literal('')),
   ```

2. Add `department: ''` to default values.

3. Update CityCombobox to auto-set department:
   ```tsx
   <CityCombobox
     value={form.watch('city') || ''}
     onChange={(value) => form.setValue('city', value)}
     onDepartmentChange={(dept) => form.setValue('department', dept)}
     disabled={isPending}
     error={form.formState.errors.city?.message}
   />
   ```

4. Pass department in both create and edit paths:
   - Create: `department: data.department || undefined`
   - Edit (FormData): `formData.append('department', data.department || '')`

**Verify:** Contact form auto-fills department from city selection and passes it through.
</task>

<task id="03.6" name="Show department in contact detail">
**Action:** Edit `src/app/(dashboard)/crm/contactos/[id]/page.tsx`

The contact detail page already shows `city.department` from the city lookup (line 178-179). But if the contact has a `department` column set (e.g., from Shopify), it should show that too.

Update the Ciudad card to prefer the stored department, falling back to the city-derived one:
```tsx
<Card>
  <CardHeader className="pb-2">
    <CardDescription className="flex items-center gap-2">
      <MapPinIcon className="h-4 w-4" />
      Ciudad
    </CardDescription>
  </CardHeader>
  <CardContent>
    {city ? (
      <p className="text-lg font-medium">
        {city.label}
        <span className="text-muted-foreground ml-2 text-sm">
          {contact.department || city.department}
        </span>
      </p>
    ) : contact.city ? (
      <p className="text-lg font-medium">
        {contact.city}
        {contact.department && (
          <span className="text-muted-foreground ml-2 text-sm">
            {contact.department}
          </span>
        )}
      </p>
    ) : (
      <p className="text-muted-foreground">No especificada</p>
    )}
  </CardContent>
</Card>
```

**Verify:** Contact detail shows department.
</task>

<task id="03.7" name="Add department column to contacts table">
**Action:** Edit `src/app/(dashboard)/crm/contactos/components/columns.tsx`

Add a Department column after City:
```typescript
{
  accessorKey: 'department',
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Departamento" />
  ),
  cell: ({ row }) => {
    const department = row.original.department
    if (!department) return <span className="text-muted-foreground">-</span>
    return <span>{department}</span>
  },
}
```

Also ensure the data fetch query includes `department` in the contacts select.

**Verify:** Contacts table shows department column.
</task>

## Verification
- Order form has "Referencia" field and auto-sets shipping_department from city
- Order sheet shows name and department
- Kanban card shows order name
- Contact form auto-fills department when city is selected
- Contact detail shows department
- Contact table has department column
