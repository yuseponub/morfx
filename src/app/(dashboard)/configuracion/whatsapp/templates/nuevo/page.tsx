import { TemplateForm } from '../components/template-form'

export default function NewTemplatePage() {
  return (
    <div className="container py-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Nuevo Template</h1>
        <p className="text-muted-foreground">
          Crea una plantilla de mensaje para enviar fuera de la ventana de 24
          horas
        </p>
      </div>

      <TemplateForm />
    </div>
  )
}
