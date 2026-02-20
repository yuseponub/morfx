import { getContactsPage } from '@/app/actions/contacts'
import { getTags } from '@/app/actions/tags'
import { getCustomFields } from '@/app/actions/custom-fields'
import { ContactsTable } from './components/contacts-table'
import { CreateContactButton } from './components/create-contact-button'

const PAGE_SIZE = 50

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tags?: string }>
}) {
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page, 10)) : 1
  const search = params.q || ''
  const tagIds = params.tags ? params.tags.split(',').filter(Boolean) : []

  const [contactsResult, tags, customFields] = await Promise.all([
    getContactsPage({ page, pageSize: PAGE_SIZE, search, tagIds }),
    getTags(),
    getCustomFields()
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contactos</h1>
          <p className="text-muted-foreground">
            Gestiona tus contactos, clientes y leads
          </p>
        </div>
        <CreateContactButton />
      </div>

      <ContactsTable
        contacts={contactsResult.contacts}
        tags={tags}
        customFields={customFields}
        total={contactsResult.total}
        page={contactsResult.page}
        pageSize={contactsResult.pageSize}
        currentSearch={search}
        currentTagIds={tagIds}
      />
    </div>
  )
}
