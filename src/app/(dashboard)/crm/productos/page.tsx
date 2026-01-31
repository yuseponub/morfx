import { getProducts } from '@/app/actions/products'
import { ProductsTable } from './components/products-table'

export default async function ProductsPage() {
  const products = await getProducts()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Catalogo de Productos</h1>
        <p className="text-muted-foreground">
          Administra los productos de tu workspace
        </p>
      </div>

      <ProductsTable products={products} />
    </div>
  )
}
