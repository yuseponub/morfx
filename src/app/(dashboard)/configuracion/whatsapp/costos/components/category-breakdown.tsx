'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'
import type { CostCategory } from '@/app/actions/usage'

interface CategoryBreakdownProps {
  data: Record<CostCategory, { count: number; cost: number }>
}

const CATEGORY_LABELS: Record<CostCategory, string> = {
  marketing: 'Marketing',
  utility: 'Utilidad',
  authentication: 'Autenticacion',
  service: 'Servicio',
}

const CATEGORY_COLORS: Record<CostCategory, string> = {
  marketing: '#f97316', // orange-500
  utility: '#3b82f6', // blue-500
  authentication: '#8b5cf6', // violet-500
  service: '#22c55e', // green-500
}

export function CategoryBreakdown({ data }: CategoryBreakdownProps) {
  const chartData = Object.entries(data)
    .filter(([_, v]) => v.count > 0)
    .map(([category, values]) => ({
      name: CATEGORY_LABELS[category as CostCategory] || category,
      value: values.count,
      cost: values.cost,
      color: CATEGORY_COLORS[category as CostCategory] || '#6b7280',
    }))

  const totalCost = Object.values(data).reduce((sum, v) => sum + v.cost, 0)

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por Categoria</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">Sin datos en este periodo</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Por Categoria</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload
                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-3">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.value.toLocaleString()} mensajes
                        </p>
                        <p className="text-sm text-muted-foreground">
                          ${item.cost.toFixed(4)} USD
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-sm">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 space-y-2">
          {chartData.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.name}</span>
              </div>
              <span className="text-muted-foreground">
                ${item.cost.toFixed(4)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm font-medium pt-2 border-t">
            <span>Total</span>
            <span>${totalCost.toFixed(4)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
