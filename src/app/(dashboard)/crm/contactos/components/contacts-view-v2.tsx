'use client'

/**
 * Contactos editorial view — v2 raw HTML semantic (D-RETRO-01/02).
 *
 * Fresh rewrite that matches `mocks/crm.html` líneas 108-140 pixel-perfect.
 * Uses ONLY raw HTML semantic primitives (<header>, <section>, <table>,
 * <input>, <button>, <span>, <div>) + Lucide icons. Cero imports de
 * `@/components/ui/*` (R-RETRO-01).
 *
 * Styling comes from the classes ported to `globals.css` in Task 1
 * (.topbar, .eye, .actions, .btn, .btn.pri, .page, .toolbar, .search,
 * .chip, .chip.on, table.dict, .tg.red/.gold/.indi/.ver).
 *
 * Rendered by `page.tsx` via ternary `v2 ? <ContactsViewV2/> : <Legacy/>`
 * — the legacy `<ContactsTable>` (shadcn) stays untouched.
 *
 * NOT SHIPPED as of this plan:
 * - Interactive search debounce (input is a stub that reads value only)
 * - Chip filter interactivity (chips render counts but are not wired to
 *   tag filtering yet — plan future del retrofit)
 * - Row selection / bulk actions (mock shows native <input type="checkbox">
 *   per row + header; no state yet)
 * - Row click → contact detail / edit (pending)
 * - Pagination controls (v2 shows first page only until a future plan
 *   adds pagination UI matching the mock aesthetic)
 *
 * Esto es un VISUAL retrofit piloto — D-RETRO-05 checkpoint humano. La
 * reconectividad funcional completa llega en un plan futuro si el PASS
 * visual se emite. Ver `01-PLAN.md` mock_coverage notes.
 */

import Link from 'next/link'
import { Search, Upload, Download, Plus } from 'lucide-react'
import type { ContactWithTags, Tag } from '@/lib/types/database'

export type ContactCounts = {
  all: number
  clientes: number
  prospectos: number
  mayoristas: number
}

type Props = {
  contacts: ContactWithTags[]
  counts: ContactCounts
  /**
   * ISO timestamp — the most recent `updated_at` across contacts.
   * Displayed right-aligned in the toolbar as "Actualizado 21 abr, 14:32".
   */
  lastUpdated: string | null
}

/**
 * Mapping desde el `name` del Tag a una clase del mock (.tg.red / .gold /
 * .indi / .ver). El shape `Tag` en este codebase no tiene `category`, solo
 * `name` + `color`. Matcheamos por nombre normalizado lowercase.
 *
 * Fallback: tag sin modifier (`.tg` solo — paper-3 neutro).
 */
function mapTagClass(tag: Tag): string {
  const name = (tag.name || '').toLowerCase().trim()
  if (!name) return 'tg'
  if (name === 'cliente' || name === 'clientes') return 'tg red'
  if (name === 'vip') return 'tg gold'
  if (name === 'prospecto' || name === 'prospectos' || name === 'lead' || name === 'leads') return 'tg indi'
  if (name === 'mayorista' || name === 'mayoristas' || name === 'distribuidor' || name === 'distribuidores') return 'tg ver'
  return 'tg'
}

/**
 * Formato relativo "hace N min / hace N h / ayer / 20 abr".
 * Idéntico al estilo del mock (línea 156: "hace 3 min", "ayer", "20 abr").
 */
function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'hace un momento'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((startOfToday.getTime() - date.getTime()) / 86400000)
  if (diffDays <= 0) return `hace ${diffH} h`
  if (diffDays === 1) return 'ayer'
  return date.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  })
}

/**
 * Formato del timestamp de "Actualizado ..." en la esquina derecha del
 * toolbar. Mock line 134: "Actualizado 21 abr, 14:32".
 */
function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const datePart = date.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  })
  const timePart = date.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota',
  })
  return `${datePart}, ${timePart}`
}

export function ContactsViewV2({ contacts, counts, lastUpdated }: Props) {
  const formattedUpdatedAt = formatUpdatedAt(lastUpdated)

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eye">Módulo · crm</div>
          <h1>
            Contactos <em>— libro de clientes</em>
          </h1>
        </div>
        <div className="actions">
          <button type="button" className="btn" aria-label="Importar contactos">
            <Upload width={14} height={14} aria-hidden="true" />
            Importar
          </button>
          <button type="button" className="btn" aria-label="Exportar contactos">
            <Download width={14} height={14} aria-hidden="true" />
            Exportar
          </button>
          <Link
            href="/crm/contactos?create=1"
            className="btn pri"
            aria-label="Crear contacto"
          >
            <Plus width={14} height={14} aria-hidden="true" />
            Crear contacto
          </Link>
        </div>
      </header>

      <section className="page" id="contactos">
        <div className="toolbar">
          <div className="search">
            <Search width={14} height={14} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar por nombre, teléfono o ciudad…"
              aria-label="Buscar contactos"
            />
          </div>
          <span className="chip on">Todos · {counts.all}</span>
          <span className="chip">Clientes · {counts.clientes}</span>
          <span className="chip">Prospectos · {counts.prospectos}</span>
          <span className="chip">Mayoristas · {counts.mayoristas}</span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--ink-3)',
              marginLeft: 'auto',
            }}
          >
            Actualizado {formattedUpdatedAt}
          </span>
        </div>

        <table className="dict">
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input type="checkbox" aria-label="Seleccionar todos" />
              </th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th>Etiquetas</th>
              <th>Último contacto</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--ink-3)' }}>
                  Sin contactos.
                </td>
              </tr>
            ) : (
              contacts.map(contact => (
                <tr key={contact.id}>
                  <td>
                    <input type="checkbox" aria-label={`Seleccionar ${contact.name}`} />
                  </td>
                  <td className="entry">
                    {contact.name}
                    {contact.email ? (
                      <span className="def">{contact.email}</span>
                    ) : null}
                  </td>
                  <td className="ph">{contact.phone}</td>
                  <td className="city">{contact.city || '—'}</td>
                  <td>
                    {contact.tags && contact.tags.length > 0 ? (
                      contact.tags.map(tag => (
                        <span key={tag.id} className={mapTagClass(tag)}>
                          {tag.name}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td className="date">
                    {formatRelativeTime(contact.updated_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  )
}
