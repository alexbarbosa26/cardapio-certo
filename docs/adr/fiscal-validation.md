# Fiscal — Stage 1 local validation

## Implemented

Tenant-scoped Entrada/Saída lists, server filters/counts/totals, page navigation, selection, scoped CSV export and print report, historic detail tabs, private file lookup/signing, audit of distribution requests, and explicit explanations for unavailable operations. No provider calls or production demo documents were created.

## Evidence

- 39 targeted tests passed (24 new fiscal tests and 15 existing route-guard tests).
- ESLint passed for all new fiscal files.
- Automatic compilation reported `build OK` after the changes. No manual build/typecheck was run, per environment rules.
- Authenticated browser: Entrada/Saída navigation, name filter and unavailable XML action worked. Desktop 1280×1800 and mobile 390×844 rendered without horizontal document overflow or runtime errors.
- Real authenticated RPC for the current company returned zero documents; a foreign-company RPC failed with authorization code 42501. Signed-out fiscal navigation redirected to login.
- RLS is enabled on all fiscal tables. File policy matches the private object path to the current company's document metadata. Default platform grants were discovered and explicitly revoked in the least-privilege migration.

## Limits

The production list is genuinely empty. Populated document details/export/file downloads were tested with synthetic local fixtures, not with a real fiscal document in the hosted UI; live populated flows, real staff-session denial and private-file download remain unverified. No emission, XML ingestion, OCR, certificates/CSC, cancellations or money/stock changes are enabled.

The full existing suite had 255 passes and 5 failures in `previewAuthStorage.test.ts`, which checks previously corrected patterns in an automatically generated auth file. The fiscal task did not modify that protected generated file or suppress its tests. All targeted fiscal/guard tests passed afterward.

## Clean Code review

**Health: 4/5 for new fiscal code.** Domain types/decimal formatting, persistence, preferences, print output and details are separated. Listing presentation remains sizeable; further splitting should follow actual reuse rather than an unrelated refactor. Queries centralize filters rather than duplicating business scope. Print content uses text nodes; CSV cells defend against formula injection.

**F.I.R.S.T.:** tests are local, independent, deterministic and self-validating; cases cover tenant absence, server denial, exact decimal/identifier handling, historical detail and paged export/audit errors. No thresholds or coverage exclusions changed.

**Authorization review:** identity comes from the hosted auth session; server RPCs and RLS scope company access. Consultation/distribution is initially admin-only, with operational permissions unavailable. Distribution audit stores actor, company, safe scope and document identifiers, never secrets. Export audit records the request, not proof of local file delivery. Future ingestion must validate historical snapshot contents and same-company order/product links before creating documents.

## Pending decisions

Choose the fiscal service and certificate/CSC contract for Stage 3. Define existing or new approved purchasing, suppliers, stock and payables flows before operational Stage 2 confirmations. No remote fiscal authorization or quality gate result is claimed.
