# Architecture rules

- Keep Fiscal domain formatting/types independent of UI and persistence; a dedicated repository coordinates tenant-scoped reads so consultations cannot mutate orders or money.
- Use separate fiscal authorization and transmission states, historic document snapshots, and private file metadata; a transport result alone never proves fiscal authorization.
- Fiscal consultation/distribution is initially admin-only within the current company, enforced by server permission checks and RLS; future operational permissions require explicit server implementations, not frontend flags.
- Use one server filter function for fiscal listings, counts and paged exports, retaining decimal text and textual identifiers at client boundaries to avoid rounding and identity loss.
- Keep certificate metadata and non-secret fiscal preferences separate from credential storage; provider-dependent upload, validation and CSC writes remain unavailable until the integration contract and server secret handling exist.
