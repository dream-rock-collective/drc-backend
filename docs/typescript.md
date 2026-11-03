# TypeScript conventions

## Contracts and narrowing

Prefer `type` aliases for new object shapes, props, and unions. Give public
functions meaningful parameter and return types where they clarify the contract;
infer obvious local values and callbacks. Keep shared contracts at their owning
module rather than duplicating shapes across callers.

Treat untrusted input as `unknown` until validated. Static types and assertions
are not runtime validation. Check structure before accessing fields, then
normalize and validate semantic constraints. Avoid `any`, unsafe casts, and
unnecessary non-null assertions; narrow or handle missing values instead.
Keep any necessary interop exception small and justified.

Use discriminated unions for alternatives with different required data, and
`switch` for finite cases when it makes handling clearer. Handle relevant cases
exhaustively rather than hiding new states behind a success default.

## Functions and modules

Give each function one understandable responsibility. Keep inputs, outputs,
dependencies, and side effects visible; use existing dependency patterns.
Separate pure transformations from I/O when useful without creating a layer or
file for every helper. Prefer functions over classes unless state, encapsulation,
or existing conventions justify a class.

Reuse existing modules and dependencies. Keep private helpers local until reuse
or responsibility warrants extraction. Use direct imports and existing module
paths; introduce a barrel only for a coherent public module, never merely to
wrap a directory or create a cycle. Avoid speculative abstractions and unrelated
cleanup.

Propagate failures to the boundary responsible for recovery or protocol
responses. Catch to recover or add useful context, not to return fake success.
Preserve validation and error handling when moving code; keep related mutations
atomic where required.

## Readability and absence

Follow surrounding formatting and existing tooling. Expand long chains,
multi-field objects, and nested callbacks into readable lines; use braces for
multiline conditional bodies. Do not add a formatter or reformat unrelated code
as part of a feature.

Prefer optional properties and `undefined` for new optional application values
when appropriate. Preserve existing `null` contracts in SQL, JSON, browser APIs,
and storage. Do not mechanically normalize or migrate existing representations:
omission, explicit clearing, and empty values can have different meanings.

## Backend and admin boundaries

Keep Zod as the runtime request-validation tool. Use parsed results downstream;
do not replace schemas with assertions or add `ts-pattern` for validation.
Hono routes retain responsibility for request validation, session authorization,
HTTP status mapping, and safe error responses. Keep meaningful route contracts
explicit using existing Hono patterns, not Fastify examples.

Use database types matching actual nullable columns and existing query clients.
Keep payment authorization on the server and preserve signed Stripe webhook
verification. Never log credentials, session tokens, or sensitive request bodies.
React props and state should describe the data each render branch actually needs.
