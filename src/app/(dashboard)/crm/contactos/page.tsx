import { cookies } from 'next/headers'
import { getContactsPage } from '@/app/actions/contacts'
import { getTags } from '@/app/actions/tags'
import { getCustomFields } from '@/app/actions/custom-fields'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
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

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false

  const [contactsResult, tags, customFields] = await Promise.all([
    getContactsPage({ page, pageSize: PAGE_SIZE, search, tagIds }),
    getTags(),
    getCustomFields()
  ])

  return (
    <div className="space-y-6" data-theme-scope={v2 ? 'dashboard-editorial' : undefined}>
      {v2 ? (
        <div className="flex items-end justify-between pb-4 border-b border-[var(--ink-1)]">
          <div>
            <span
              className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · crm
            </span>
            <h1
              className="mt-0.5 mb-0 text-[30px] leading-[1.1] font-bold tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Contactos
              <em
                className="ml-2 text-[16px] font-normal not-italic text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                — libro de clientes
              </em>
            </h1>
          </div>
          <CreateContactButton v2 />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Contactos</h1>
            <p className="text-muted-foreground">
              Gestiona tus contactos, clientes y leads
            </p>
          </div>
          <CreateContactButton />
        </div>
      )}

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
