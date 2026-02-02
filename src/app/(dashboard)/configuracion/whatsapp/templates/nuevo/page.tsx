import { TemplateForm } from '../components/template-form'

export default function NewTemplatePage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 max-w-3xl mx-auto px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Nuevo Template</h1>
          <p className="text-muted-foreground">
            Crea una plantilla de mensaje para enviar fuera de la ventana de 24
            horas
          </p>
        </div>

        <TemplateForm />
      </div>
    </div>
  )
}
