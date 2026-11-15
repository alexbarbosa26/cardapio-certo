# ADR 0001 — Isolate fiscal consultations from operational effects

**Status:** Accepted.

## Context

The supplied instructions require navigation and read-only fiscal consultations first. Existing companies, products, orders and payments must be preserved. No fiscal provider is selected, and suppliers, purchasing, stock and payable integrations were not found in the supplied schema. The functional mapping is available, but external command behavior remains unverified.

## Decision

Create an additive Fiscal supporting context in the existing app. Use historic snapshots under the fiscal document aggregate and explicit links to existing orders, without duplicating sales. Separate fiscal authorization from transmission, physical receipt and financial status. Domain formatting and types remain independent of persistence and UI. Restrict consultation and distribution to company administrators using server checks and RLS; reserve operational capabilities without enabling them.

## Consequences

Reads cannot trigger stock, payment or fiscal operations. Decimal values and identifiers remain exact. Private documents have temporary, tenant-authorized access. Future integration requires mapping provider results into these explicit states; snapshots require validation by the future ingestion boundary. Paged exports can fail safely if selections disappear during retrieval; they do not provide a transaction snapshot of concurrent provider updates.

## Compliance/Fitness Function

Tests validate tenant predicates, missing-company denial, unchanged query filters across export pages, exact money and identifiers, and side-effect-free document reads. Database checks reject cross-company requests and staff reads. Browser checks exercise authenticated consultation on desktop/mobile. No production demo documents are seeded. Write grants and operational fiscal APIs remain absent until their own approved workflows exist.

## Trade-offs

| Criterion   | Incremental consultation      | Complete fiscal integration now     | Observation                          |
| ----------- | ----------------------------- | ----------------------------------- | ------------------------------------ |
| Performance | Indexed, server-paged lists   | More coordination and retries       | Exports paginate all results         |
| Maintenance | Few isolated responsibilities | Larger coupled workflows            | Avoid parallel operational entities  |
| Cost        | No provider required          | Provider and certificate operations | No real emission during construction |
| Risk        | Later mapping adaptation      | Presumed rules and duplicated money | Preserve existing behavior           |

**Verdict:** incremental consultation is safer now.
**Change the decision when:** provider and operational integration contracts are defined.
**Next safe step:** validate consultations, then design XML previews without financial effects.

## Domain map and review

- Core context: restaurant sales and fulfillment, unchanged.
- Supporting context: Fiscal document lifecycle, linked by order identity and historical snapshots.
- Generic context: existing identity/authorization and private file storage.
- Integration strategy: an anti-corruption boundary must translate provider states; do not share one generic status with sales or physical receipt.
- Fiscal document is the aggregate root; identifier, money and historical participant fields are value concepts. No heavy entity framework is introduced for read-only queries.
- Existing UI commonly mixes reads and presentation; isolate new repository calls rather than refactoring unrelated screens. This limits regression risk while enabling behavioral tests.
