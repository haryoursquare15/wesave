---
name: Realtime authorization model
description: How Realtime subscriptions are gated in Vestara (public channels + source-table RLS, not topic policy)
type: feature
---

Vestara Realtime model — DO NOT flag as topic-coverage gap:

- All `supabase.channel(...)` calls in src/ use the default PUBLIC mode (no `{ config: { private: true } }`).
- In public mode, the `realtime.messages` topic policy is NOT enforced. The actual gate is RLS on the source table for postgres_changes events.
- Every table in the `supabase_realtime` publication has RLS strictly scoping to `auth.uid()` (or group/split membership via SECURITY DEFINER helpers).
- Unused tables are removed from the publication to shrink broadcast surface.

If the security scanner flags "Realtime-published tables broadcast row changes…", it is a FALSE POSITIVE for this app's public-channel + RLS-at-source design. Only re-open if (a) a channel switches to `private: true`, or (b) an RLS policy on a published table is loosened.
