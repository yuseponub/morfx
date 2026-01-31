import { getContacts } from '@/app/actions/contacts'
import { getTags } from '@/app/actions/tags'
import { getCustomFields } from '@/app/actions/custom-fields'
import { ContactsTable } from './components/contacts-table'
import { CreateContactButton } from './components/create-contact-button'

export default async function ContactsPage() {
  const [contacts, tags, customFields] = await Promise.all([
    getContacts(),
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

      <ContactsTable contacts={contacts} tags={tags} customFields={customFields} />
    </div>
  )
}
