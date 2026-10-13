# Reduce intermittent 502s on bills, Split Pay and savings actions

## Problem
The main products service sometimes fails before it can answer, including on the browser's pre-flight check. That points to slow or failed start-up of one very large service file (~11k lines), not to payment logic.

## What we'll do
1. **Safe automatic retry in the app**: when the products service returns a 502/503/504 or a network failure, retry automatically up to 2 times with a short delay. Only for read-only actions and for actions that already carry an idempotency key, so money-moving requests can never run twice.
2. **Friendly message** after retries fail: "We couldn't reach Vestara just now. Please try again in a moment."
3. **Faster start-up** of the service: load heavy helpers (mandate, settlement, bill validation, SpendLock) only when an action that needs them runs, instead of at start-up.
4. **Later, optional**: split the service into smaller ones (bills, Split Pay, savings, groups). Larger change, done one area at a time.

## Technical details
- Wrap `supabase.functions.invoke("vfd-sandbox-products")` in one shared helper used by `useVfdSandboxProducts.ts` and direct callers (SandboxBillsTab, SplitPayDetail, bill receipts/beneficiaries/recurring, admin GroupManagementTab).
- Retry allow-list: `get_*`, `list_*`, `check_*_status`, and actions whose body includes an `idempotency_key`/`reference`.
- Convert top-level imports in `vfd-sandbox-products/index.ts` of `_shared/vfd-mandate.ts`, `settlement.ts`, `bill-validation.ts`, `spend-lock.ts` to cached dynamic `await import()` inside handlers.
- Watch edge logs for 502s for 48h after deploy.
