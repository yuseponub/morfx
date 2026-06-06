// src/config.ts — single source of truth for the D-06 quality gate + D-13 anti-ban knobs.
// Verbatim from RESEARCH §Code Examples — D-06/D-13 defaults. Do not "tune" here; the pilot (Plan 06) calibrates empirically.
export const config = {
  // D-06 — null-rate quality gate.
  // RECOMMENDED: 8% (mid of the 5-10% band). Rationale below.
  nullRateThreshold: 0.08,
  nullRateMinSample: 10,        // don't trip the gate on tiny samples; only enforce once >=10 chats processed
  pilotChatCount: 5,            // D-16 pilot sample

  // D-13 — anti-ban pacing (read-only is low risk; these are deliberately gentle, not paranoid)
  interChatDelayMs: [4000, 9000],   // randomized pause between chats (uniform in range)
  postOpenDelayMs: [1200, 2600],    // settle time after opening/selecting a chat before getMessages
  perSessionChatCap: 150,           // optional cap; resume next batch. null = unlimited
  perDayChatCap: 400,               // optional daily cap
  jitter: () => 0.8 + Math.random() * 0.4, // ±20% multiplier on every delay
} as const

export const randDelay = (range: readonly [number, number]) =>
  Math.floor((range[0] + Math.random() * (range[1] - range[0])) * config.jitter())
