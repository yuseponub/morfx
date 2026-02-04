import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { ArrowLeftIcon, MailIcon, MapPinIcon, PhoneIcon, TagIcon } from 'lucide-react'
import { getContact } from '@/app/actions/contacts'
import { getTags } from '@/app/actions/tags'
import { getCustomFields } from '@/app/actions/custom-fields'
import { getContactNotes } from '@/app/actions/notes'
import { getContactActivity } from '@/app/actions/activity'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatPhoneDisplay } from '@/lib/utils/phone'
import { getCityByValue } from '@/lib/data/colombia-cities'
import { TagInput } from '@/components/contacts/tag-input'
import { ContactDetailActions } from './contact-detail-actions'
import { CustomFieldsSection } from './components/custom-fields-section'
import { NotesSection } from './components/notes-section'
import { ActivityTimeline } from './components/activity-timeline'
import { WhatsAppSection } from './components/whatsapp-section'
import { ContactTasks } from './components/contact-tasks'

interface ContactDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function ContactDetailPage({ params }: ContactDetailPageProps) {
  const { id } = await params

  // Fetch all data in parallel
  const [contact, tags, customFields, notes, activity] = await Promise.all([
    getContact(id),
    getTags(),
    getCustomFields(),
    getContactNotes(id),
    getContactActivity(id),
  ])

  if (!contact) {
    notFound()
  }

  // Check if current user is admin/owner for showing settings link
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  let isAdminOrOwner = false
  if (user && workspaceId) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    isAdminOrOwner = member?.role === 'owner' || member?.role === 'admin'
  }

  const city = contact.city ? getCityByValue(contact.city) : null
  const currentUserId = user?.id

  return (
    <div className="flex-1 overflow-auto p-6">
    <div className="space-y-6 max-w-4xl">
      {/* Back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/crm/contactos">
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver a contactos
          </Link>
        </Button>
      </div>

      {/* Contact header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{contact.name}</h1>
          <p className="text-muted-foreground">
            Creado el{' '}
            {new Date(contact.created_at).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'America/Bogota',
            })}
          </p>
        </div>
        <ContactDetailActions contact={contact} />
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Informacion</TabsTrigger>
          <TabsTrigger value="tasks">Tareas</TabsTrigger>
          <TabsTrigger value="custom">Campos</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        {/* Info tab */}
        <TabsContent value="info" className="space-y-6">
          {/* Tags section */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TagIcon className="h-4 w-4" />
                Etiquetas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TagInput
                contactId={contact.id}
                currentTags={contact.tags}
                availableTags={tags}
              />
            </CardContent>
          </Card>

          {/* WhatsApp conversations section */}
          <WhatsAppSection contactId={contact.id} />

          {/* Contact info cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Phone */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <PhoneIcon className="h-4 w-4" />
                  Telefono
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium">
                  {formatPhoneDisplay(contact.phone)}
                </p>
              </CardContent>
            </Card>

            {/* Email */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <MailIcon className="h-4 w-4" />
                  Email
                </CardDescription>
              </CardHeader>
              <CardContent>
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-lg font-medium text-primary hover:underline"
                  >
                    {contact.email}
                  </a>
                ) : (
                  <p className="text-muted-foreground">No especificado</p>
                )}
              </CardContent>
            </Card>

            {/* City */}
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
                      {city.department}
                    </span>
                  </p>
                ) : contact.city ? (
                  <p className="text-lg font-medium">{contact.city}</p>
                ) : (
                  <p className="text-muted-foreground">No especificada</p>
                )}
              </CardContent>
            </Card>

            {/* Address */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <MapPinIcon className="h-4 w-4" />
                  Direccion
                </CardDescription>
              </CardHeader>
              <CardContent>
                {contact.address ? (
                  <p className="text-lg font-medium">{contact.address}</p>
                ) : (
                  <p className="text-muted-foreground">No especificada</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Last updated */}
          <p className="text-sm text-muted-foreground">
            Ultima actualizacion:{' '}
            {new Date(contact.updated_at).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Bogota',
            })}
          </p>
        </TabsContent>

        {/* Tasks tab */}
        <TabsContent value="tasks">
          <Card>
            <CardContent className="pt-6">
              <ContactTasks
                contactId={contact.id}
                contactName={contact.name}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Custom Fields tab */}
        <TabsContent value="custom">
          <CustomFieldsSection
            contact={contact}
            fieldDefinitions={customFields}
            isAdminOrOwner={isAdminOrOwner}
          />
        </TabsContent>

        {/* Notes tab */}
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardDescription>
                Notas internas visibles para todos los miembros del workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotesSection
                contactId={contact.id}
                initialNotes={notes}
                currentUserId={currentUserId}
                isAdminOrOwner={isAdminOrOwner}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardDescription>
                Historial de cambios realizados a este contacto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                contactId={contact.id}
                initialActivity={activity}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  )
}
