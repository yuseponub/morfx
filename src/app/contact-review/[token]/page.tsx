'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

type Status = 'loading' | 'success' | 'error' | 'already_resolved' | 'invalid'

function ContactReviewContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const action = searchParams.get('action') as 'merge' | 'ignore' | null

  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')
  const [templatesSent, setTemplatesSent] = useState<
    Array<{ template: string; sent: boolean }>
  >([])

  useEffect(() => {
    if (!action || !['merge', 'ignore'].includes(action)) {
      setStatus('invalid')
      setMessage('Accion invalida. Usa los enlaces enviados por WhatsApp.')
      return
    }

    fetch(`/api/contact-review/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (data.success) {
          setStatus('success')
          setTemplatesSent(data.templatesSent || [])
          setMessage(
            action === 'merge'
              ? 'Contactos unidos. El telefono del contacto existente ha sido actualizado y los templates han sido enviados.'
              : 'Contactos mantenidos separados. Los templates han sido enviados al telefono de Shopify.'
          )
        } else if (data.error === 'Already resolved') {
          setStatus('already_resolved')
          setMessage(`Esta revision ya fue procesada (${data.status}).`)
        } else if (data.error === 'Review not found') {
          setStatus('error')
          setMessage('Revision no encontrada. El enlace puede ser invalido.')
        } else {
          setStatus('error')
          setMessage(data.error || 'Error desconocido')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('Error de conexion. Intenta de nuevo.')
      })
  }, [token, action])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900 mb-6">MorfX</h1>

        {/* Status Icon */}
        {status === 'loading' && (
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="mt-4 text-gray-600">Procesando...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-green-700">
              {action === 'merge' ? 'Contactos Unidos' : 'Contactos Separados'}
            </h2>
            <p className="mt-2 text-gray-600">{message}</p>
            {templatesSent.length > 0 && (
              <div className="mt-4 text-sm text-gray-500">
                <p className="font-medium">Templates enviados:</p>
                <ul className="mt-1">
                  {templatesSent.map((t, i) => (
                    <li key={i}>
                      {t.template}: {t.sent ? 'Enviado' : 'Error'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {status === 'already_resolved' && (
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto bg-yellow-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-yellow-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-yellow-700">
              Ya Procesada
            </h2>
            <p className="mt-2 text-gray-600">{message}</p>
          </div>
        )}

        {(status === 'error' || status === 'invalid') && (
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-red-700">Error</h2>
            <p className="mt-2 text-gray-600">{message}</p>
          </div>
        )}

        {/* Footer */}
        <p className="mt-8 text-xs text-gray-400">
          Puedes cerrar esta pagina.
        </p>
      </div>
    </div>
  )
}

export default function ContactReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">MorfX</h1>
            <div className="w-16 h-16 mx-auto border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="mt-4 text-gray-600">Cargando...</p>
          </div>
        </div>
      }
    >
      <ContactReviewContent />
    </Suspense>
  )
}
