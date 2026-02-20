# Infrastructure Research: Supabase + Vercel for WhatsApp Performance

> **Date:** 2026-02-16
> **Context:** MorfX CRM + WhatsApp SaaS platform
> **Goal:** Maximize WhatsApp module performance (conversation load, message rendering, realtime)
> **Constraint:** Cost is NOT a constraint -- optimize for speed

---

## Table of Contents

1. [Supabase Plans Comparison](#1-supabase-plans-comparison)
2. [Supabase Compute Instances](#2-supabase-compute-instances)
3. [Supabase Realtime Limits](#3-supabase-realtime-limits)
4. [Supabase Add-ons](#4-supabase-add-ons)
5. [Vercel Plans Comparison](#5-vercel-plans-comparison)
6. [Vercel Function Limits](#6-vercel-function-limits)
7. [Region Strategy](#7-region-strategy)
8. [Configuration Recommendations](#8-configuration-recommendations)
9. [Final Recommendation](#9-final-recommendation)
10. [Estimated Monthly Cost](#10-estimated-monthly-cost)

---

## 1. Supabase Plans Comparison

| Feature | Free | Pro | Team | Enterprise |
|---|---|---|---|---|
| **Price** | $0/mo | $25/mo | $599/mo | Custom |
| **Database** | 500 MB | 8 GB included | 8 GB included | Custom |
| **MAU** | 50,000 | 100,000 | 100,000 | Custom |
| **File Storage** | 1 GB | 100 GB | 100 GB | Custom |
| **Bandwidth** | 2 GB | 250 GB | 250 GB | Custom |
| **Edge Fn Invocations** | 500K | 2M | 2M | Custom |
| **Realtime Connections** | 200 | 500 (10K no spend cap) | 10,000 | 10,000+ |
| **Realtime Messages** | 2M | 5M | 5M | Custom |
| **Compute Credit** | - | $10/mo included | $10/mo included | Custom |
| **SOC 2** | No | No | Yes | Yes |
| **SSO** | No | No | Yes | Yes |
| **SLA** | No | No | Yes | Yes |
| **Support** | Community | Email | Priority | 24/7 + Slack |
| **Log Retention** | 1 day | 7 days | 28 days | 90+ days |
| **Backup Retention** | None | 7 days | 14 days | Custom |
| **Read Replicas** | No | Yes (add-on) | Yes (add-on) | Yes |

### Key Insight for MorfX

The **Pro plan with spend cap disabled** is the minimum viable option. It unlocks 10,000 concurrent realtime connections (vs 500 with spend cap) and 2,500 messages/second (vs 500). The Team plan at $599/mo adds SOC 2, SSO, and priority support but the realtime limits are the same as Pro without spend cap.

---

## 2. Supabase Compute Instances

All paid projects run on dedicated Postgres instances. The compute size directly impacts:
- **Connection limits** (DB + pooler)
- **Disk IOPS** (query speed)
- **RAM** (cache hit ratio)
- **CPU** (complex queries, realtime fanout)

| Size | Monthly | CPU | RAM | DB Connections | Pooler Clients | Disk Baseline IOPS | Disk Throughput |
|---|---|---|---|---|---|---|---|
| **Nano** | $0 | Shared | 0.5 GB | 60 | 200 | 250 | 5 MB/s |
| **Micro** | ~$10 | 2-core shared | 1 GB | 60 | 200 | 500 | 11 MB/s |
| **Small** | ~$15 | 2-core shared | 2 GB | 90 | 400 | 1,000 | 21 MB/s |
| **Medium** | ~$60 | 2-core shared | 4 GB | 120 | 600 | 2,000 | 43 MB/s |
| **Large** | ~$110 | 2-core dedicated | 8 GB | 160 | 800 | 3,600 | 79 MB/s |
| **XL** | ~$210 | 4-core dedicated | 16 GB | 240 | 1,000 | 6,000 | 149 MB/s |
| **2XL** | ~$410 | 8-core dedicated | 32 GB | 380 | 1,500 | 12,000 | 297 MB/s |
| **4XL** | ~$960 | 16-core dedicated | 64 GB | 480 | 3,000 | 20,000 | 594 MB/s |

### Why Compute Size Matters for WhatsApp

1. **Realtime channels** = DB connections for change data capture (CDC). Each Postgres Change listener uses WAL replication.
2. **Pooler clients** limit how many concurrent serverless connections (server actions, API routes, Inngest workers) can hit the DB simultaneously.
3. **IOPS** determine how fast message queries return (especially with indexes).
4. **RAM** determines Postgres shared_buffers and cache hit ratio. More RAM = fewer disk reads = faster queries.

### Recommendation for ~100-1000 Concurrent Realtime Connections

| Concurrent Users | Recommended Compute | Why |
|---|---|---|
| < 100 | **Small** ($15/mo) | 400 pooler clients, 2 GB RAM sufficient |
| 100-500 | **Large** ($110/mo) | Dedicated CPU, 800 pooler clients, 8 GB RAM |
| 500-1000 | **XL** ($210/mo) | 1,000 pooler clients, 16 GB RAM, 6K IOPS |
| 1000+ | **2XL** ($410/mo) | 1,500 pooler clients, 32 GB RAM, 12K IOPS |

**For MorfX today (early stage, optimizing for speed):** Start with **Large ($110/mo)** -- dedicated CPU cores eliminate noisy-neighbor issues, 8 GB RAM gives excellent cache ratios, and 800 pooler clients is plenty for initial scale. Upgrade to XL when approaching 500 concurrent users.

---

## 3. Supabase Realtime Limits

| Limit | Free | Pro | Pro (no cap) | Team | Enterprise |
|---|---|---|---|---|---|
| **Concurrent Connections** | 200 | 500 | 10,000 | 10,000 | 10,000+ |
| **Messages/sec** | 100 | 500 | 2,500 | 2,500 | 2,500+ |
| **Channel Joins/sec** | 100 | 500 | 2,500 | 2,500 | 2,500+ |
| **Channels per Connection** | 100 | 100 | 100 | 100 | 100+ |
| **Presence Messages/sec** | 20 | 50 | 1,000 | 1,000 | 1,000+ |
| **Broadcast Payload** | 256 KB | 3 MB | 3 MB | 3 MB | 3 MB+ |
| **PG Change Payload** | 1 MB | 1 MB | 1 MB | 1 MB | 1 MB+ |

### Realtime Pricing (Overages)

| Resource | Included (Pro) | Overage Rate |
|---|---|---|
| Peak Connections | 500 | $10 per 1,000 connections |
| Messages | 5 million/mo | $2.50 per 1 million messages |

### Impact on WhatsApp Module

- **8 channels per conversation** (current) is high but within the 100 channels/connection limit
- Channel consolidation (planned optimization) will dramatically reduce this
- With Pro (no spend cap): 2,500 msg/sec is more than enough for most SaaS scales
- The $10/1K connections overage is very affordable -- don't let connection limits drive plan choice

---

## 4. Supabase Add-ons

### Read Replicas
- **Price:** Same compute cost as primary + $4/mo base fee
- **Benefit:** Offload read queries, reduce primary load, geo-routing for lower latency
- **Available on:** Pro and above
- **Recommendation:** NOT needed initially. Useful when read queries start bottlenecking the primary. Consider when reaching 500+ concurrent users.

### Disk Upgrades (io2)
- **gp3 (default):** 3,000 baseline IOPS, $0.125/GB, $0.024/IOPS
- **io2 (high perf):** Up to 80,000 IOPS, $0.195/GB, $0.119/IOPS
- **Recommendation:** gp3 is fine for now. If query latency is disk-bound (check with `pg_stat_io`), upgrade to io2.

### Point-in-Time Recovery (PITR)
- **Available on:** Pro ($100/mo for Small compute add-on)
- **Benefit:** Restore to any second in time
- **Recommendation:** Nice for production safety but does NOT affect performance.

### IPv4 Add-on
- **Price:** $4/mo per project
- **Note:** Required for direct connections from some providers. Supavisor pooling works without it.

---

## 5. Vercel Plans Comparison

| Feature | Hobby (Free) | Pro ($20/user/mo) | Enterprise (Custom) |
|---|---|---|---|
| **Base Price** | $0 | $20/user/month | Custom |
| **Included CPU** | 4 hrs/mo | $20 credit | Custom |
| **Included Memory** | 360 GB-hrs/mo | $20 credit | Custom |
| **Function Invocations** | 1M/mo | Starts at $0.60/1M | Custom |
| **Edge Requests** | 1M/mo | 10M/mo | Custom |
| **Bandwidth** | 100 GB/mo | 1 TB/mo | Custom |
| **Max Function Memory** | 2 GB / 1 vCPU | 4 GB / 2 vCPU | 4 GB / 2 vCPU |
| **Max Function Duration** | 300s | 800s | 800s |
| **Max Concurrency** | 30,000 | 30,000 | 100,000+ |
| **Function Regions** | 1 | Up to 3 | All (~18) |
| **Fluid Compute** | Yes | Yes (+ Performance CPU) | Yes (+ Performance CPU) |
| **Multi-region Failover** | No | Yes | Yes |
| **SLA** | No | No | 99.99% |
| **Spend Cap** | N/A | $200 default | Custom |

### Cold Start Mitigation by Plan

| Feature | Hobby | Pro | Enterprise |
|---|---|---|---|
| Fluid Compute | Yes | Yes | Yes |
| Bytecode Caching | Prod only | Prod only | Prod only |
| Function Pre-warming | No | Yes | Yes |
| Performance CPU | No | Yes | Yes |
| Multi-region Failover | No | Yes | Yes |

**Key Insight:** Vercel Pro delivers zero cold starts for **99.37% of all requests**. The combination of Fluid Compute (enabled by default since April 2025), bytecode caching, and function pre-warming on production deployments makes cold starts a non-issue for most workloads.

---

## 6. Vercel Function Limits (Detailed)

| Limit | Hobby | Pro | Enterprise |
|---|---|---|---|
| Max Memory | 2 GB / 1 vCPU | 4 GB / 2 vCPU | 4 GB / 2 vCPU |
| Max Duration | 300s | 800s | 800s |
| Bundle Size | 250 MB | 250 MB | 250 MB |
| Request Body | 4.5 MB | 4.5 MB | 4.5 MB |
| Concurrency | 30,000 | 30,000 | 100,000+ |
| File Descriptors | 1,024 shared | 1,024 shared | 1,024 shared |
| Burst Rate | 1,000/10s/region | 1,000/10s/region | Higher |
| CPU Type | Standard | Standard + Performance | Standard + Performance |

### Vercel Pricing Model (Pro)

| Resource | Rate |
|---|---|
| Active CPU | $0.128/hr |
| Provisioned Memory | $0.0106/GB-hr |
| Invocations | $0.60/1M |
| Bandwidth | 1 TB included, then usage-based |
| Edge Requests | 10M included |

**Key Insight for Server Actions:** Server actions are serverless functions. With Fluid Compute, multiple invocations share instances, so the "conversation load" pattern (user opens chat -> 3-5 server actions fire) benefits enormously from shared instances. The 4 GB / 2 vCPU option on Pro means faster JSON parsing, faster React Server Component rendering, and faster Supabase client operations.

---

## 7. Region Strategy

### Current Likely Setup
- Supabase: Unknown region (possibly US East)
- Vercel: Default `iad1` (Washington D.C.)

### Optimal for Colombia-based Users

| Service | Recommended Region | Latency from Colombia |
|---|---|---|
| **Supabase** | `sa-east-1` (Sao Paulo, Brazil) | ~60-80ms |
| **Vercel Functions** | `gru1` (Sao Paulo, Brazil) | ~60-80ms |
| **Alternative** | `iad1` (Washington D.C.) | ~100-130ms |

### Why Region Co-location Matters

The biggest performance win (outside of code) is **co-locating Vercel functions with Supabase**:

1. Server action fires on Vercel (`gru1`)
2. Vercel function queries Supabase (`sa-east-1` Sao Paulo)
3. **Latency: ~2-5ms** (same AWS region, internal network)
4. Response returns to user in Colombia: ~60-80ms

vs. current likely setup:
1. Server action fires on Vercel (`iad1` Washington)
2. Vercel function queries Supabase (US East?)
3. Latency: ~2-5ms (same region)
4. Response returns to Colombia: ~100-130ms

**Net savings: 40-50ms per round trip** by moving both to Sao Paulo.

### CRITICAL: Supabase Region Migration

Supabase does NOT support changing project region. To move to `sa-east-1`:
1. Create new project in Sao Paulo region
2. Migrate database schema + data
3. Update all connection strings
4. This is a significant operation -- schedule carefully

**Recommendation:** If currently on US East, this migration alone could cut 40-50ms from every server action. Worth doing but plan it as a separate phase.

---

## 8. Configuration Recommendations

### Supabase Configuration (No Code Changes)

| Setting | Current (Likely) | Recommended | Impact |
|---|---|---|---|
| **Plan** | Pro | Pro (spend cap OFF) | Unlocks 10K realtime connections, 2.5K msg/s |
| **Compute** | Micro ($10) | Large ($110) | Dedicated CPU, 8 GB RAM, 800 pooler clients |
| **Region** | US East? | sa-east-1 (Sao Paulo) | -40-50ms per request for Colombia users |
| **Disk** | gp3 default | gp3 (keep default) | 3,000 IOPS baseline is sufficient |
| **Pooler Mode** | Transaction | Transaction (keep) | Best for serverless |
| **Pool Size** | Default | 40% of max connections | Leave room for PostgREST + Auth |
| **Read Replicas** | None | None (defer) | Add when read bottleneck appears |

### Vercel Configuration (No Code Changes)

| Setting | Current (Likely) | Recommended | Impact |
|---|---|---|---|
| **Plan** | Pro | Pro ($20/user/mo) | Best value -- Enterprise not needed yet |
| **Function Region** | iad1 (default) | gru1 (Sao Paulo) | Co-locate with Supabase for ~2-5ms DB queries |
| **Fluid Compute** | Maybe off | ON (verify in dashboard) | Zero cold starts for 99%+ of requests |
| **Function Memory** | 2 GB default | 4 GB / 2 vCPU | Faster processing, better for concurrent requests |
| **Max Duration** | 300s default | 300s (keep default) | Server actions should be fast, not long |
| **Performance CPU** | Off? | ON | Faster clock speed for compute-heavy RSC rendering |
| **Spend Cap** | $200 default | $500 (raise) | Avoid unexpected pauses during traffic spikes |

### Connection Pooling Best Practices

1. **Always use Supavisor Transaction Mode** (port 6543) for server actions and API routes
2. **Set `connection_limit=1`** in serverless connection strings -- Supavisor manages the pool
3. **Keep pool size at ~40% of max connections** to leave room for PostgREST, Auth, and Realtime
4. **Configure `idle_in_transaction_session_timeout`** to prevent connection leaks
5. **Monitor `pg_stat_activity`** for connection usage patterns

---

## 9. Final Recommendation

### Tier 1: Immediate (This Week) -- Configuration Only

| Action | Cost Impact | Performance Impact |
|---|---|---|
| Disable Supabase spend cap | Variable | Unlocks 10K RT connections, 2.5K msg/s |
| Upgrade Supabase compute to Large | +$100/mo | Dedicated CPU, 8 GB RAM, 3.6K IOPS |
| Enable Vercel Fluid Compute | $0 | Eliminates most cold starts |
| Set Vercel function memory to 4 GB | Slight increase | Faster server action execution |
| Enable Vercel Performance CPU | Slight increase | Higher clock speed |

### Tier 2: Short Term (Next Sprint) -- Region Migration

| Action | Cost Impact | Performance Impact |
|---|---|---|
| Create new Supabase project in sa-east-1 | Migration effort | -40-50ms per DB query from user |
| Move Vercel function region to gru1 | $0 | Co-located with DB, ~2-5ms internal |

### Tier 3: Scale Phase (When Needed)

| Action | Trigger | Cost |
|---|---|---|
| Upgrade to Supabase XL compute | 500+ concurrent users | $210/mo |
| Add Supabase Read Replica | Read queries bottleneck | Same compute cost |
| Upgrade to Supabase 2XL | 1000+ concurrent users | $410/mo |
| Switch disk to io2 | Disk IOPS saturation | Variable |
| Vercel Enterprise | Need 99.99% SLA or >3 regions | Custom |

### What NOT to Do

- **Don't upgrade to Supabase Team ($599/mo)** unless you need SOC 2/SSO. The realtime and compute limits are the same as Pro with spend cap off.
- **Don't upgrade to Vercel Enterprise** unless you need 99.99% SLA or >3 function regions. Pro with Fluid Compute covers all performance needs.
- **Don't add Read Replicas** yet. Optimize queries and indexes first.
- **Don't switch to io2 disk** unless you confirm disk IOPS are the bottleneck via monitoring.

---

## 10. Estimated Monthly Cost

### Recommended Setup (Tier 1)

| Service | Item | Monthly Cost |
|---|---|---|
| **Supabase** | Pro plan base | $25 |
| **Supabase** | Large compute upgrade | $110 |
| **Supabase** | Realtime overages (est. 2K peak connections) | ~$15 |
| **Supabase** | Message overages (est. 10M messages) | ~$12.50 |
| **Supabase** | Bandwidth overages | ~$10 |
| **Vercel** | Pro plan (2 developers) | $40 |
| **Vercel** | Function compute overages (est.) | ~$20-50 |
| **Vercel** | Bandwidth (within 1 TB) | $0 |
| | | |
| **TOTAL (Tier 1)** | | **~$235-265/mo** |

### With Region Migration (Tier 2)

Same cost as Tier 1 (region change is free, just operational effort to migrate Supabase project).

### At Scale (Tier 3) -- 1000+ Users

| Service | Item | Monthly Cost |
|---|---|---|
| **Supabase** | Pro plan + 2XL compute | $435 |
| **Supabase** | Realtime + Messages overages | ~$50-100 |
| **Vercel** | Pro plan (3 developers) | $60 |
| **Vercel** | Higher function usage | ~$50-100 |
| | | |
| **TOTAL (Tier 3)** | | **~$600-700/mo** |

---

## Sources

- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Compute and Disk Docs](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Supabase Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing)
- [Supabase Connection Management](https://supabase.com/docs/guides/database/connection-management)
- [Supabase Available Regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase Read Replicas](https://supabase.com/docs/guides/platform/read-replicas)
- [Vercel Pricing](https://vercel.com/pricing)
- [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute)
- [Vercel Function Limits](https://vercel.com/docs/functions/limitations)
- [Vercel Concurrency Scaling](https://vercel.com/docs/functions/concurrency-scaling)
- [Vercel Function Memory Config](https://vercel.com/docs/functions/configuring-functions/memory)
- [Vercel Regions](https://vercel.com/docs/regions)
- [Vercel Cold Start Guide](https://vercel.com/kb/guide/how-can-i-improve-serverless-function-lambda-cold-start-performance-on-vercel)
- [Supabase Pricing Breakdown (Metacto)](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)
- [Supabase Pricing Explained (DesignRevision)](https://designrevision.com/blog/supabase-pricing)
- [Vercel Pricing Breakdown (Flexprice)](https://flexprice.io/blog/vercel-pricing-breakdown)
