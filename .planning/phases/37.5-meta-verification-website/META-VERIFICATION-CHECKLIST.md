# Meta Business Verification — Manual Checklist

**Executor:** Jose (user) — Claude cannot log into Meta Business Manager or Porkbun
**Prepared:** 2026-04-14
**Phase:** 37.5 Block A (website) complete; this checklist closes the Meta loop
**Production URL:** https://morfx.app

---

## Prerequisites (done by Claude in Plans 01-04)

- [x] `morfx.app` serves bilingual public landing (ES at `/`, EN at `/en`)
- [x] `morfx.app/privacy` returns 200 with ARCO rights + Ley 1581 de 2012 citations
- [x] `morfx.app/terms` returns 200 with 14 sections (1-6, 9-16)
- [x] Footer shows `MORFX S.A.S.` + NIT `902.052.328-5` + Carrera 38 #42-17 Apto 1601B + `+57 313 754 9286` + `morfx.colombia@gmail.com`
- [x] Zero references to 360dialog (Meta Direct Integration stack only)
- [x] Zero references to incorrect NIT (`902.058.328-5`)
- [x] Bilingual ES/EN toggle in header
- [x] Pushed to main (origin), Vercel auto-deploys to https://morfx.app

---

## Pre-Submission Sanity Check

Before touching Meta Business Manager, verify in a browser (not curl — Meta reviewers see a real rendered page):

- [ ] https://morfx.app/ — ES landing, renders hero + about + product + CTA sections
- [ ] https://morfx.app/en — EN landing, same layout, English copy
- [ ] https://morfx.app/privacy — Privacy policy with substantive content (not placeholder)
- [ ] https://morfx.app/en/privacy — EN privacy
- [ ] https://morfx.app/terms — T&C with 14 sections
- [ ] https://morfx.app/en/terms — EN T&C
- [ ] Footer visible on every marketing page showing `MORFX S.A.S.` + NIT + address + phone + email
- [ ] `/login` still functional (Supabase auth unbroken)
- [ ] No visible console errors, no 404s for assets
- [ ] OG preview: paste `https://morfx.app` into Facebook Sharing Debugger (https://developers.facebook.com/tools/debug/) — confirm 1200×630 `og-image.png` renders

If any of the above fails, STOP. Report issue and Claude will iterate before Meta resubmission.

---

## Part A — Domain Verification via DNS TXT

Meta requires proof that you own `morfx.app` before it will trust the landing page as business evidence.

### A.1 — Get TXT value from Meta

1. Open https://business.facebook.com/settings/
2. In left sidebar: **Brand Safety and Suitability** → **Domains**
3. Click **Add** → enter `morfx.app` (no `https://`, no `www.`)
4. Meta offers 3 verification methods; choose **DNS TXT record**
5. Meta displays a string: `facebook-domain-verification=XXXXXXXXXXXXXXXX`
6. **Copy this exact value** (it's unique per business portfolio)

### A.2 — Add TXT record on Porkbun

1. Open https://porkbun.com/account/domainsSpeedy
2. Find `morfx.app` → click **Details** → **DNS Records**
3. Click **Add** a new record:
   - **Type:** `TXT`
   - **Host:** leave blank (or `@`) — this attaches to root domain
   - **Answer:** paste the FULL string `facebook-domain-verification=XXXXXXXXXXXXXXXX`
   - **TTL:** `600` (10 minutes — fine for verification)
4. Save

### A.3 — Wait for DNS propagation

Propagation is usually 5-15 minutes but can take up to 1 hour. Confirm from terminal:

```bash
dig TXT morfx.app +short
```

Expected output includes a line like:
```
"facebook-domain-verification=XXXXXXXXXXXXXXXX"
```

If the value is NOT in the output after 30 min, double-check:
- Host field is `@` or blank (NOT `morfx.app.morfx.app`)
- Answer is wrapped correctly (Porkbun should auto-quote it)
- No typos in the value

### A.4 — Click Verify in Meta

1. Back in Meta Business Manager → **Domains** → `morfx.app`
2. Click **Verify**
3. Wait 5-10 seconds — status should flip to **Verified** (green check)
4. If it stays "Unverified": wait 10 more minutes and retry (DNS can lag)

**Do not delete the TXT record later** — Meta re-checks periodically.

---

## Part B — Corporate Email (`info@morfx.app` or `contacto@morfx.app`)

**Handled by separate Claude instance.** Block B is not executed in this plan. Once the separate instance configures Porkbun email forwarding:

- Footer `morfx.colombia@gmail.com` will be replaced with the corporate address
- Privacy policy contact section will be updated
- Meta Business Manager "business email" field will be updated

**Do not start Part B yourself** — coordinate with the Block B work.

---

## Part C — Facebook Page Connection

**Handled by separate Claude instance.** Block C is not executed in this plan. Creating a Facebook Page for MORFX S.A.S. and connecting it to the Business Portfolio is required for full Business Manager verification but is handled in a separate workstream.

**Do not create a Facebook Page yourself** during Phase 37.5 execution.

---

## Part D — Resubmit Business Verification

**Only do this AFTER Parts A, B, C are complete.** Resubmitting with incomplete evidence risks another rejection.

### D.1 — Open Business Verification

1. Open https://business.facebook.com/settings/security
2. **Business Verification** (or **Security Center** → **Business Verification**)
3. Click **Start again** / **Resubmit**

### D.2 — Confirm business details match legal docs exactly

| Field | Value (must match Cámara de Comercio + RUT) |
|-------|---------------------------------------------|
| Legal business name | `MORFX S.A.S.` (exactly this casing) |
| Legal address | `Carrera 38 # 42-17 Apartamento 1601B, Bucaramanga, Santander, Colombia` |
| Phone | `+57 313 754 9286` |
| Website | `https://morfx.app` |
| Business email | `morfx.colombia@gmail.com` (until Block B replaces it) |

**Any mismatch causes rejection.** Copy-paste from the PDFs if unsure.

### D.3 — Upload documents

Meta requires re-upload on each resubmission even if previously accepted:

- **Certificado de Existencia y Representación Legal** — file `cert-12614394-1-0.pdf`
- **Certificado de Matrícula Mercantil** — file `cert-12614393-0-0.pdf`
- **RUT DIAN** — file `RUT MORFX SAS - MARZO 2026 (4).pdf`

All 3 should be the fresh (≤30-day-old) versions already uploaded previously.

### D.4 — Verification method

Choose **Email OTP** → sent to `morfx.colombia@gmail.com`. Fastest path.

### D.5 — Submit and track

- [ ] Click Submit
- [ ] Screenshot the "In review" confirmation
- [ ] Expected SLA: 2-5 business days (Meta has been slow in 2026 — 2 weeks to 7 months reported in community forums)
- [ ] Monitor daily at https://business.facebook.com/settings/security

---

## If Meta Rejects Again

Capture the exact rejection text (Meta has a tendency to reject silently — the "couldn't be verified" banner appears briefly and then disappears).

Common failure modes investigated during Phase 37.5 research (see `37.5-RESEARCH.md`):

1. **Domain not verified in Business Manager** → fixed by Part A above
2. **Login-only domain with no public landing** → fixed by Plans 01-04
3. **Legal name not visible on website** → fixed by Plan 02 footer
4. **Personal-domain email (Gmail) as business contact** → mitigated by Block B (separate instance)
5. **Address on website does NOT match Cámara de Comercio** → verified match in Plan 02
6. **Privacy policy missing Ley 1581 / ARCO rights** → included in Plan 04
7. **Terms missing jurisdiction clause (Colombia)** → included in Plan 04
8. **Website shows "under construction" / Lorem Ipsum** → real content in Plan 03

If the rejection cites something else, screenshot the message and open a new debug entry in `.planning/debug/`.

---

## Post-Approval

Once Meta returns **Verified**:

- [ ] Update `/home/jose147/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/meta_integration_setup.md` with verification date
- [ ] Update `docs/analysis/04-estado-actual-plataforma.md` — mark Phase 37.5 + Meta BV as complete
- [ ] Unblock Phase 38 (Embedded Signup)
- [ ] Resume Tech Provider onboarding flow
- [ ] Document final timeline in `37.5-LEARNINGS.md`

---

## Resume Signal

Reply to Claude with:

- `"deploy verified"` — morfx.app visually confirmed + ready to proceed with Part A
- `"domain verified + BV resubmitted"` — happy path through Parts A and D
- `"domain verified, BV failed — reason: <message>"` — iterate on landing/legal
- `"blocked on <step>"` — help troubleshoot

---

**Expected timeline end-to-end:** 1 day to execute Parts A + D, 2-5 business days for Meta decision.
