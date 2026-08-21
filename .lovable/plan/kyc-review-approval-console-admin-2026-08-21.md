# KYC Review & Approval Console (Admin)

Build a compliance workflow so a Vestara admin reviews every customer's submitted identity documents before the customer gets upgraded platform access.

## How it works today

- Customers upload documents (government ID, utility bill, passport photo) during Tier 2/3 KYC. Files land in a private storage bucket; a row is recorded with status "pending".
- Nothing ever moves that row off "pending" — no one reviews it, and the tier upgrade goes straight through to the banking partner as soon as the form is submitted.
- Admins have no screen to see the documents at all.

## What gets built

### 1. Pending queue (new "KYC Review" tab in the admin console)

A list of every customer with submitted documents, showing:
- Customer name, username, email
- Submission date (oldest first, with an "aging" highlight past 24h)
- Requested tier and which document types were submitted
- Current review status: Pending / Approved / Rejected
- Filters by status and a search box by name/email; counts badge on the tab

### 2. Customer detail view

Opening a row shows, side by side:
- Submitted documents rendered inline — images preview, PDFs open in a viewer — served through short-lived secure links so files never become public
- The customer's entered KYC details for comparison: full name, BVN, NIN, date of birth, gender, phone, address, requested tier, account number and account status
- Review history: who reviewed, when, and the reason recorded

### 3. Approve / reject

- **Approve** — marks the documents and the customer's KYC record as approved, records the reviewing admin and timestamp, lifts the review hold so the customer's tier limits and full platform access apply, and notifies the customer in-app and by email.
- **Reject** — requires a written reason (chosen from common reasons like "document unreadable", "name mismatch", "expired document", plus free text). Records it, sets the customer back to "documents required" so they can re-upload, and notifies them in-app and by email with the reason.
- Every action is written to the audit log.

## Decision to confirm

Where the hold sits for Tier 2/3 upgrades:

- **Recommended — review before the limits apply.** The upgrade request is accepted and the account keeps working at its current tier, but the higher tier limits only take effect once an admin approves. This is the compliance-correct order and needs no change to the banking-partner calls.
- Alternative — review after the fact (upgrade applies immediately, admin can later reject and roll the tier back). Faster for customers, weaker for compliance.

The plan below assumes the recommended option; say the word if you'd rather have the alternative.

## Technical notes

- **Database migration**: add review fields to the KYC documents table (`reviewed_by`, `reviewed_at`, `rejection_reason`) and to the customer KYC record (`kyc_review_status`, `kyc_review_reason`, `kyc_reviewed_by`, `kyc_reviewed_at`, `kyc_requested_tier`). Admin-only read/write policies via the existing `is_any_admin` / role checks; customers keep read-only access to their own review status and reason.
- **Edge function** (`admin-kyc-review`, JWT-validated, admin-only): `list_pending`, `get_detail` (returns signed URLs valid ~5 minutes for each document), `approve`, `reject`. All privileged reads use the service role — no widening of client-side table access to documents or BVN/NIN.
- **Access control**: tab and function gated on `compliance.view` for reading and `compliance.restrict` (plus `super_admin`) for approve/reject, using the existing permissions hook and `admin_permissions` table.
- **Tier gate**: the tier-upgrade path records the requested tier and holds effective limits until `kyc_review_status = 'approved'`; existing Tier 1 flow is untouched.
- **Notifications**: reuse `insert_user_notification` plus the branded email pipeline already in place.
- **New files**: `src/components/admin/KycReviewTab.tsx`, `src/components/admin/KycReviewDetail.tsx`, `supabase/functions/admin-kyc-review/index.ts`; registration in `src/pages/Admin.tsx`.
