import { notFound } from 'next/navigation'
import { getTemplate } from '@/app/actions/templates'
import { TemplateDetail } from './components/template-detail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TemplateDetailPage({ params }: Props) {
  const { id } = await params
  const template = await getTemplate(id)

  if (!template) {
    notFound()
  }

  return (
    <div className="container py-6 max-w-3xl">
      <TemplateDetail template={template} />
    </div>
  )
}
