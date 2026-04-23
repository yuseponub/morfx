import { cookies } from 'next/headers'
import { getProducts } from '@/app/actions/products'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { ProductsTable } from './components/products-table'

export default async function ProductsPage() {
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false

  const products = await getProducts()

  return (
    <div className="space-y-6" data-theme-scope={v2 ? 'dashboard-editorial' : undefined}>
      {v2 ? (
        <div className="flex items-end justify-between pb-4 border-b border-[var(--ink-1)]">
          <div>
            <span
              className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · crm
            </span>
            <h1
              className="mt-0.5 mb-0 text-[30px] leading-[1.1] font-bold tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Productos
              <em
                className="ml-2 text-[16px] font-normal not-italic text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                — catálogo
              </em>
            </h1>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-bold">Catalogo de Productos</h1>
          <p className="text-muted-foreground">
            Administra los productos de tu workspace
          </p>
        </div>
      )}

      <ProductsTable products={products} />
    </div>
  )
}
