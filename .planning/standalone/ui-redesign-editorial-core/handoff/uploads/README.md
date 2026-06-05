# Paquete de contexto para Claude Design

El objetivo: que Claude Design diseñe **dentro del sistema editorial real de MorfX**, no en el vacío. Así lo que traes queda idéntico, no "parecido".

## Archivo principal

- **`morfx-editorial-context.html`** — sistema de diseño real (`.theme-editorial`) extraído verbatim de `src/app/globals.css`. Ábrelo en el navegador para verlo renderizado y pégalo en Claude Design como contexto inicial.

---

## FLUJO (las dos direcciones)

### 1. DE AQUÍ → CLAUDE DESIGN (qué le das)

1. Pega TODO `morfx-editorial-context.html`.
2. Pega esta instrucción (ajusta la pantalla):

   > Este es mi sistema de diseño. Rediseña **[Pedidos / Métricas / etc.]** usando
   > EXCLUSIVAMENTE estos tokens (`--ink-*`, `--paper-*`, `--rubric-*`, `--space-*`,
   > `--fs-*`) y estas clases (`.sb`, `.btn`, `.tg`, `table.dict`, `.mx-*`, `.chip`,
   > `.tabs`, etc.). NO inventes colores nuevos, NO uses tamaños fuera de la escala,
   > NO uses px que no estén en `--space-*`. Devuélveme **HTML semántico crudo**
   > (`<section>`, `<aside>`, `<table>`, `<input>`) con estos nombres de clase
   > IDÉNTICOS. **Modo claro únicamente.**

### 2. DE CLAUDE DESIGN → AQUÍ (qué traes)

- El **HTML crudo** que genere, con las clases idénticas.
- Si crea una clase nueva, que incluya su CSS **con valores en tokens** (no hex hardcoded).
- Guárdalo como `mock.html` en `.planning/standalone/<feature>/`.
- Yo lo porto verbatim bajo `/gsd-ui-phase` + verifico con **screenshot lado a lado** (`/gsd-ui-review`).

---

## REGLAS DE ORO (rompen la fidelidad si se ignoran)

| Regla | Por qué |
|---|---|
| **Modo claro siempre** | Dark mode está fuera de scope (UI-SPEC §12.4). |
| **`--primary` = `--ink-1`** (tinta), nunca rubric | Rubric-2 es acento reservado; ligarlo a primary inunda la UI de acento. |
| **Contrato 60/30/10** | paper domina (60), ink estructura (30), rubric acentúa (10). |
| **Titulares = EB Garamond** (`--font-display`/`--font-serif`) | Voz editorial. |
| **UI operacional = Inter** (`--font-sans`) | Legibilidad en tablas/botones/nav. |
| **Datos/teléfonos/IDs = JetBrains Mono** (`--font-mono`) | Alineación tabular. |
| **Clases verbatim** | El executor copia el markup; no lo "adapta a shadcn" (causa del 35% fidelity en `ui-redesign-dashboard`). |

## Las 3 fuentes

- **EB Garamond** — 400/500/600/700/800 + italic (display + serif + small-caps)
- **Inter** — sans (UI)
- **JetBrains Mono** — 400/500 (datos)
