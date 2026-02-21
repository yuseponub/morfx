'use client'

import type { CarrierConfig } from '@/lib/domain/carrier-configs'
import type { PipelineWithStages } from '@/lib/orders/types'

interface LogisticsConfigFormProps {
  config: CarrierConfig | null
  pipelines: PipelineWithStages[]
}

export function LogisticsConfigForm({ config, pipelines }: LogisticsConfigFormProps) {
  return <div>Loading logistics form...</div>
}
