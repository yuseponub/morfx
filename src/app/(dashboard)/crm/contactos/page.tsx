import { getContactsPage } from '@/app/actions/contacts'
import { getTags } from '@/app/actions/tags'
import { getCustomFields } from '@/app/actions/custom-fields'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { ContactsTable } from './components/contacts-table'
import { CreateContactButton } from './components/create-contact-button'
import { ContactsViewV2, type ContactCounts } from './components/contacts-view-v2'
import type { ContactWithTags } from '@/lib/types/database'

const PAGE_SIZE = 50

/**
 * Compute contact counts for the v2 toolbar chips (Todos / Clientes /
 * Prospectos / Mayoristas). Based on the `tags[].name` field of each
 * contact — the tag category semantics are encoded in the tag name
 * (lowercase match). If no tag matches, only the `all` count is
 * meaningful; the other three stay at 0 (stub per 01-PLAN.md mock
 * coverage note — real semantics shipped in a future plan).
 *
 * NOTE: `counts.all` uses `totalContacts` (page result total, exact
 * count from Supabase), NOT `contacts.length` — the page shows only
 * the first 50 but the total is workspace-wide.
 */
function computeCounts(contacts: ContactWithTags[], totalContacts: number): ContactCounts {
  const clientes = contacts.filter(c =>
    c.tags?.some(t => {
      const n = (t.name || '').toLowerCase().trim()
      return n === 'cliente' || n === 'clientes'
    }),
  ).length
  const prospectos = contacts.filter(c =>
    c.tags?.some(t => {
      const n = (t.name || '').toLowerCase().trim()
      return n === 'prospecto' || n === 'prospectos' || n === 'lead' || n === 'leads'
    }),
  ).length
  const mayoristas = contacts.filter(c =>
    c.tags?.some(t => {
      const n = (t.name || '').toLowerCase().trim()
      return n === 'mayorista' || n === 'mayoristas' || n === 'distribuidor' || n === 'distribuidores'
    }),
  ).length
  return { all: totalContacts, clientes, prospectos, mayoristas }
}

/**
 * Find the most recent `updated_at` across the current page of contacts.
 * Used as the "Actualizado HH:MM" timestamp in the v2 toolbar (mock
 * crm.html line 134).
 */
function findLastUpdated(contacts: ContactWithTags[]): string | null {
  if (contacts.length === 0) return null
  let latest = contacts[0].updated_at
  for (const c of contacts) {
    if (c.updated_at && c.updated_at > latest) latest = c.updated_at
  }
  return latest
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tags?: string }>
}) {
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page, 10)) : 1
  const search = params.q || ''
  const tagIds = params.tags ? params.tags.split(',').filter(Boolean) : []

  const [contactsResult, tags, customFields, activeWorkspaceId] = await Promise.all([
    getContactsPage({ page, pageSize: PAGE_SIZE, search, tagIds }),
    getTags(),
    getCustomFields(),
    getActiveWorkspaceId(),
  ])

  // Resolve UI Dashboard v2 flag. Fails closed to false (Regla 6).
  const v2 = activeWorkspaceId
    ? await getIsDashboardV2Enabled(activeWorkspaceId)
    : false

  // =========================================================================
  // Retrofit v2 branch — raw HTML editorial view (D-RETRO-01).
  // Ternary router: the page chooses between ContactsViewV2 (new, raw HTML)
  // and the legacy ContactsTable (shadcn). Legacy path below is BYTE-IDENTICAL
  // to HEAD pre-plan.
  // =========================================================================
  if (v2) {
    const counts = computeCounts(contactsResult.contacts, contactsResult.total)
    const lastUpdated = findLastUpdated(contactsResult.contacts)
    return (
      <ContactsViewV2
        contacts={contactsResult.contacts}
        counts={counts}
        lastUpdated={lastUpdated}
      />
    )
  }

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
