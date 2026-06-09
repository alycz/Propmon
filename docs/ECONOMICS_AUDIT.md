# Propmon Economics Audit

**Auditor:** Superagent 12 — Economics Verification + Naming Audit
**Date:** 2026-06-09
**Branch:** alycz/terminal-ui-finalizer-v1

---

## 1. Economics Verification Table

| Item | Canonical | Found in Code | Location | Match? | Action |
|---|---|---|---|---|---|
| Tier count | 5 tiers | 3 tiers | `web/lib/config.ts` tierOptions | ❌ MISMATCH | Fixed (Step 2) |
| Tier Bronze | $5,000 / $50 fee | Missing | `web/lib/config.ts` | ❌ MISMATCH | Fixed (Step 2) |
| Tier Silver | $10,000 / $100 fee | $10,000 present | `web/lib/config.ts` | ✅ (partial — present after fix) | Fixed (Step 2) |
| Tier Gold | $25,000 / $250 fee | $25,000 present | `web/lib/config.ts` | ✅ (partial — present after fix) | Fixed (Step 2) |
| Tier Platinum | $50,000 / $500 fee | $50,000 present | `web/lib/config.ts` | ✅ (partial — present after fix) | Fixed (Step 2) |
| Tier Diamond | $100,000 / $1,000 fee | Missing | `web/lib/config.ts` | ❌ MISMATCH | Fixed (Step 2) |
| Exam fee rate | 1% (EXAM_FEE_BPS=100, BPS=10000) | EXAM_FEE_BPS=100, BPS=10_000 | `contracts/src/vaults/ExaminationVault.sol` L15-16 | ✅ MATCH | No action |
| Profit split (trader) | 85% (8500 bps) | 8000 bps default in deploy script | `contracts/script/Deploy.s.sol` L39 DEFAULT_TRADER_SHARE_BPS | ❌ CONTRACT MISMATCH | Needs redeploy decision |
| Profit split (trader) demo-config | 85% (8500 bps) | 8000 bps | `shared/demo-config.json` fundedDemo.profitSplitBps.trader | ❌ MISMATCH | Fixed (Step 3) |
| Profit split (protocol) demo-config | 15% (1500 bps) | 2000 bps | `shared/demo-config.json` fundedDemo.profitSplitBps.protocol | ❌ MISMATCH | Fixed (Step 3) |
| Profit target bps | +10% (1000 bps) | 1000 | `shared/demo-config.json` scriptedPass.profitTargetBps | ✅ MATCH | No action |
| Profit target bps (contract) | +10% (1000 bps) | profitTargetBps: 1_000 | `contracts/src/rules/RuleEngine.sol` L55 | ✅ MATCH | No action |
| Max total loss | 10% (1000 bps) | maxTotalDrawdownBps: 1_000 | `contracts/src/rules/RuleEngine.sol` L57 | ✅ MATCH | No action |
| Max daily loss | 5% (500 bps) | maxDailyDrawdownBps: 500 | `contracts/src/rules/RuleEngine.sol` L56 | ✅ MATCH | No action |
| Profit share during exam | None (exam is skill test only) | No profit share logic in exam path | `contracts/src/vaults/ExaminationVault.sol` | ✅ MATCH | No action |
| Metadata title | "Propmon" | "Propmon" | `web/app/layout.tsx` L6 | ✅ MATCH | No action |
| Metadata description | References Propmon | "Verifiable on-chain prop trading on Monad." | `web/app/layout.tsx` L7 | ✅ MATCH | No action |

---

## 2. Fixes Applied

### Step 2 — `web/lib/config.ts`
- Added Bronze tier: `{ label: "Bronze — $5,000", accountSize: 5_000_000_000n }`
- Added Diamond tier: `{ label: "Diamond — $100,000", accountSize: 100_000_000_000n }`
- Added tier name to all labels for clarity (Bronze/Silver/Gold/Platinum/Diamond)
- Result: five canonical tiers (5k/10k/25k/50k/100k) with 1% fees implicit via EXAM_FEE_BPS

### Step 3 — `shared/demo-config.json`
- Changed `fundedDemo.profitSplitBps.trader` from 8000 → 8500
- Changed `fundedDemo.profitSplitBps.protocol` from 2000 → 1500
- `scriptedPass.profitTargetBps` confirmed at 1000 — no change needed

---

## 3. Needs Human Decision

### CONTRACT MISMATCH — FundedVault traderShareBps

**Location:** `contracts/script/Deploy.s.sol` L39, `contracts/src/vaults/FundedVault.sol` (immutable `traderShareBps`)

**Issue:** The deploy script default is `DEFAULT_TRADER_SHARE_BPS = 8000` (80/20 split). The canonical spec requires 8500/1500 (85/15). Because `traderShareBps` is immutable in the deployed contract at `0xdbC6638A97829c49bcA31DccE697f5Ad89B52b80`, the on-chain payout split is likely 80/20 unless the deployment was overridden via env var `TRADER_SHARE_BPS=8500`.

**Recommended action:**
1. Verify the deployed value: call `traderShareBps()` on `0xdbC6638A97829c49bcA31DccE697f5Ad89B52b80` on Monad Testnet chainId 10143.
2. If it returns 8000: decide whether to redeploy FundedVault with `traderShareBps_=8500`. This requires explicit human approval.
3. If redeploy is approved: update `DEFAULT_TRADER_SHARE_BPS` in `Deploy.s.sol` to 8500 at the same time.

The demo-config has been fixed to 8500/1500 so the demo shows correct economics regardless of the on-chain value.

---

## 4. Naming Audit

### Scope searched
- `grep -rni "proprietaryx" . --exclude-dir=node_modules` — no hits in codebase files
- `grep -rni "0provision\|mattheus" . --exclude-dir=node_modules` — no hits in codebase files

### Findings

| Pattern | Hits in codebase | Action |
|---|---|---|
| ProprietaryX | 0 (only in .context attachment files) | No action needed |
| 0provision | 0 (only in .context attachment files) | No action needed |
| Mattheus | 0 (only in .context attachment files) | No action needed |

All user-facing product references consistently use "Propmon". README, layout metadata, and contract comments all use the correct name.

---

## 5. Files Edited

| File | Change |
|---|---|
| `web/lib/config.ts` | tierOptions expanded from 3 to 5 canonical tiers with tier names |
| `shared/demo-config.json` | fundedDemo.profitSplitBps corrected from 80/20 to 85/15 (8500/1500) |
| `docs/ECONOMICS_AUDIT.md` | This file (created) |

## 6. Files NOT Edited (DO-NOT-TOUCH boundary respected)

All `web/app/terminal/**`, `web/app/examination/**`, `web/app/profile/**`, `web/app/page.tsx`, `web/components/**`, `web/hooks/**` — owned by Superagent 11. No contract files were modified.
