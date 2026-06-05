# WhatsApp UI kit

Paper/Bible-themed recreation of the morfx WhatsApp inbox module.

Source: `src/app/(dashboard)/whatsapp/` in `yuseponub/morfx`.

## Contents

- `index.html` — click-thru of the full inbox (sidebar + list + thread + contact panel)
- Screens covered:
  - Inbox list with tags, unread counts, order-stage emoji badges
  - Active conversation with sent/received bubbles, bot-replied indicator
  - Contact panel with ficha, open order, timeline
  - Working composer (type + Enter or click Send adds an outbound bubble)

## Visual translation

| Original (shadcn slate)        | morfx paper edition                     |
| ------------------------------ | --------------------------------------- |
| `bg-card` white / slate border | `--paper-0` cream, `--ink-1` hairline   |
| Rounded primary green bubbles  | Ink-black bubbles, 6px radius, 1px edge |
| WhatsApp green accents         | Rubric red (`--rubric-2`) accents       |
| Sans-serif throughout          | EB Garamond serif + Inter for buttons   |
| Colored left-border active nav | Sidebar pill with rubric tick mark      |
| Avatar circles with colored bg | Paper circle with serif initials        |
