---
phase: standalone/whatsapp-performance
plan: 04
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: false

must_haves:
  truths:
    - "User has a clear action list of infrastructure changes to make"
    - "Supabase and Vercel configuration recommendations are documented"
    - "Cost estimates are clear"
    - "Region strategy is explained with trade-offs"
  artifacts: []
  key_links: []
---

<objective>
Present infrastructure recommendations for Supabase and Vercel configuration to maximize WhatsApp module performance.

Purpose: These are configuration-only changes (no code) that complement the code optimizations in Plans 01-02. They can be done in parallel or before code changes. The user must make these changes manually through the respective dashboards.

Output: User has reviewed and optionally applied infrastructure recommendations.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-performance/INFRA-RESEARCH.md
</context>

<tasks>

<task type="checkpoint:human-action" gate="non-blocking">
  <action>Review and optionally apply infrastructure configuration changes</action>
  <instructions>
  These are the researched infrastructure recommendations. Apply at your discretion.

  ## Tier 1: Immediate (Configuration Only)

  ### Supabase Dashboard (supabase.com/dashboard)

  1. **Disable spend cap** (Settings → Billing → Spend Cap → OFF)
     - Unlocks: 10,000 realtime connections (up from 500), 2,500 msg/sec (up from 500)
     - Cost: Variable (overages charged at published rates)

  2. **Upgrade compute to Large** (Settings → Infrastructure → Compute Instance → Large)
     - Gets: Dedicated 2-core CPU, 8 GB RAM, 800 pooler clients, 3,600 IOPS
     - Cost: ~$110/mo (with $10 compute credit = $100 effective)
     - Why: Dedicated CPU eliminates noisy-neighbor latency spikes. 8 GB RAM means better Postgres cache hit ratio.

  ### Vercel Dashboard (vercel.com/dashboard)

  3. **Verify Fluid Compute is ON** (Project Settings → Functions → Fluid Compute)
     - Should be enabled by default since April 2025
     - Eliminates cold starts for 99%+ of requests

  4. **Enable Performance CPU** (Project Settings → Functions → CPU)
     - Higher clock speed for compute-heavy Server Component rendering
     - Slight cost increase

  5. **Set function memory to 4 GB / 2 vCPU** (vercel.json or Project Settings → Functions → Memory)
     - Faster server action execution (affects getConversations, message fetching)
     - Cost: Slight increase per invocation

  ## Tier 2: Region Migration (Bigger Effort)

  6. **Move Supabase to sa-east-1 (Sao Paulo)**
     - Saves 40-50ms per request for Colombia-based users
     - REQUIRES creating a new Supabase project and migrating data
     - This is a significant operation — plan separately

  7. **Move Vercel function region to gru1 (Sao Paulo)**
     - Co-locates with Supabase for ~2-5ms internal DB queries
     - Simple: add `"regions": ["gru1"]` to vercel.json or set in dashboard

  ## Estimated Monthly Cost (Tier 1)

  | Item | Cost |
  |------|------|
  | Supabase Pro base | $25 |
  | Supabase Large compute | ~$110 |
  | Supabase realtime overages (est.) | ~$15-25 |
  | Vercel Pro (2 devs) | $40 |
  | Vercel function overages (est.) | ~$20-50 |
  | **Total** | **~$210-250/mo** |

  ## What NOT to Do

  - Don't upgrade to Supabase Team ($599/mo) — Pro with spend cap off has same realtime limits
  - Don't add Read Replicas yet — optimize code first
  - Don't switch disk to io2 unless monitoring shows IOPS saturation
  </instructions>
  <resume-signal>Note which changes you've applied (or "skip" to defer infrastructure changes)</resume-signal>
</task>

</tasks>

<verification>
User has reviewed the infrastructure recommendations and made informed decisions about which to apply.
</verification>

<success_criteria>
- User acknowledges the recommendations
- Any applied changes are noted for documentation
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-performance/04-SUMMARY.md`
</output>
