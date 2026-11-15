# Fiscal configuration flow review

## Rule
Certificate/CSC configuration must be accessible through Fiscal navigation, stay within the active company and never accept credentials or claim activation before a fiscal provider is integrated.

## Reviewed paths
| Path | Result |
|---|---|
| Desktop/mobile sidebar in AppLayout | Fiscal links to the operational module; existing admin visibility unchanged. |
| App routes and RequireCompanyAccess / RequireAdmin | Entrada, Saída and Configuração share authenticated company/admin guards. Global superadmin access remains separate. |
| Entrada/Saída navigation and action menus | Configuration links target `/fiscal/configuracao`, not an obsolete unavailable-action dialog. Browser verified both navigation paths. |
| FiscalConfiguration environment/save flow | Found a pending-edit state that could survive a profile/company change. Keyed the workspace by company to discard the old draft. Disabled fields during save so later input cannot be lost to an in-flight save. |
| Certificate registration, renewal and CSC dialogs | Provider-dependent operations remain unavailable; no file/password/CSC inputs or upload calls. |
| Metadata loader and expiry calculation in certificates.ts | Explicit safe metadata columns and company predicate; expiry/verification cannot activate emission. No changes required. |
| Fiscal document detail, exports and private-file repository | Consultation remains separate from credential configuration and cannot upload certificates. No changes required. |
| Migration 0004: configuration/metadata tables, policies, save_fiscal_configuration | Admin and current-company checks; only non-secret preferences are written; audit excludes credentials. No changes required. |
| General settings, global pages, table/tab checkout, order sheets and print-order | Search found no certificate/CSC configuration or credential operations. These existing flows remain unchanged. |
| Server functions/background processing | No certificate/CSC/fiscal jobs or handlers found in server-function source. Billing cancellation scheduling is unrelated and unchanged. |

## Verification
53 targeted fiscal/guard tests pass; lint passes for changed files. New regression test changes the active company with unsaved preferences and verifies the new company's values are loaded without saving the old draft. Authenticated browser confirms Entrada/Saída links and no mobile horizontal overflow; automatic compilation reports build OK.

No stored preferences, permissions, example data, paid/closed/sent documents or other settled records were changed during this sweep. Operational upload/validation/CSC remains blocked by the undefined fiscal provider contract, as previously recorded.