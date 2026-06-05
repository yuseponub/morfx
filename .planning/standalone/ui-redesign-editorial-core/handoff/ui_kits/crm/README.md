# CRM UI kit

Paper/Bible-themed recreation of the morfx CRM module.

Source: `src/app/(dashboard)/crm/` in `yuseponub/morfx`.

## Contents

- `index.html` — click-thru with two tabs:
  - **Contactos** — dictionary-style table (entry with italic definition, monospace phone, small-caps tags)
  - **Pedidos · kanban** — 4-column pipeline (Nuevo / Confirmado / Empacado / Entregado) with order cards
- Toolbar with search, quick filter chips, import/export/create actions

## Translation notes
- Contacts table is intentionally typographic: every name is styled like a dictionary entry
  with a grammatical "definition" (`s. m. cliente recurrente`). Phone numbers use mono.
- Kanban columns use the original repo's order-stage emoji (📥 🍳 📦 🚚) preserved as _data_,
  inside a rubric-red paper card.
- No colored card backgrounds. Status is carried by the column, not the card.
