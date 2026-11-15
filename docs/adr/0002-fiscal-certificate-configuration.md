# ADR 0002 — Separate fiscal certificate metadata from credentials

**Status:** Accepted.

## Context
The user requests Stage 3 certificate and CSC configuration. The supplied Stage 3 instructions require selection of a fiscal provider before accepting certificate formats, validating certificates or storing credentials. No provider has been defined. Existing Fiscal consultations must remain isolated from fiscal operations.

## Decision
Provide Fiscal > Configuração fiscal > Certificados e CSC now. Persist only environment and expiry-warning preferences through an authenticated, tenant-checked, audited server operation. Store safe certificate metadata separately, with no certificate blob, private key, password, secret CSC or credential-storage path in the listing table. Leave certificate/CSC upload, verification, renewal and activation unavailable until the provider contract and server secret handling are implemented.

## Consequences
Administrators can configure non-secret preferences and inspect available metadata without exposing credentials. Selecting production cannot enable emission. Provider-specific formats and CSC identifier length are not invented. The requested operational certificate registration remains blocked by provider selection; this is not a completed emitter integration.

## Compliance/Fitness Function
- 52 targeted fiscal/guard tests pass, including 13 new certificate/configuration tests.
- ESLint passes for the changed Fiscal files; automatic compilation reports build OK.
- Authenticated browser saves a changed expiry-warning value and reads it after reload, then restores the prior value.
- A foreign-company save fails with code 42501; the UI has no active file/password/CSC inputs.
- Desktop and mobile consultation show no runtime errors or horizontal overflow.
- Populated real certificate validation, incorrect password, renewal preservation and fiscal-provider return handling remain unverified and unimplemented until the provider is chosen. No credentials or real certificates were requested or stored.