# Registration CSV export options

Status: Proposed; documentation only.

Future branch: `feature/export-options` from main after prerequisites merge. Open one feature PR in this repository; link the paired PR when applicable.

Prerequisite: None; independent of the site editor.

## Goal

Replace immediate CSV download with an accessible modal. Keep the full JSON backup unchanged. This feature is backend-repository admin UI only; no API or database changes.

## Behavior and implementation

- Payment filter: All (default), Paid (`payment_status === "paid"`), Unpaid (pending or failed). Plan checkboxes: Monthly, Yearly, One time, No payment (`plan === null`), initially all selected. Filters are independent and combine with AND; always exclude deleted registrations.
- Column checkboxes in stable order: Name, Email, Address, Birthday. Default Name/Address/Birthday selected. Never include internal IDs, Stripe data, notes or allocations in this CSV.
- One action downloads one CSV containing matching registrations and only selected columns. Require at least one plan and column; disable download with a clear no-results message when no records match. Preserve raw birthday/address values and blank null fields.
- Reuse current fetched registrations and CSV quoting; extract only the small pure filtering/formatting helper needed for tests. Escape quotes, commas and line breaks and neutralize spreadsheet formula-leading cells. Preserve JSON behavior exactly.
- Persist only filters/columns under versioned `dreamrock:export-options:v1` localStorage key after export. Validate stored enums/arrays, fall back to defaults on malformed data, and allow exporting if storage is unavailable. Do not store exported personal data.
- Modal has labeled controls, initial focus, trapped focus, Escape/Cancel, focus return and disabled pending state. Do not add dependencies.

## Acceptance and tests

Test each status/plan combination, null plans vs unpaid paid-plan rows, deleted exclusion, default/selected columns and order, empty results, CSV escaping/formula cells, invalid settings and storage failure. Verify keyboard operation and last-used options after reload, with JSON unchanged. Run focused tests, typecheck and admin build.

## Completion

Update authoritative API/content documentation for changed behavior. Attach focused test results and desktop/mobile evidence where UI changes. Merge only this feature; no unrelated cleanup.
