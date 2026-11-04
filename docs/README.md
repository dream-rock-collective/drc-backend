# Documentation index

Identify the affected code first, then read only a matching reference or section.
Use known links directly; this index is optional navigation. Source and checked-in
configuration own implementation details. Historical proposals do not override
current contracts or engineering standards.

| Task | Reference |
| --- | --- |
| Setup, deployment, migrations, current API/admin overview | [Repository README](../README.md) |
| Website editor setup, publishing, preview, acceptance, and recovery | [Content editor handoff](content-editor.md) |
| TypeScript, React props, validation, module boundaries | [TypeScript](typescript.md) |
| Work in chunks, select checks, resume a multi-step task | [Development workflow](development-workflow.md) |
| Public registration and checkout API details | [Registration-site API](registration-site-api.md) |

For current route behavior not covered by these references, inspect `src/routes/`
and its shared schemas/helpers. Authentication lives in `src/auth.ts` and session
middleware; do not infer current behavior from historical plans. Coordinate
public contract changes with the separate registration-site repository.

Temporary task state belongs in `plans/active/<task>.md` only when needed; see the
workflow. Useful completed plans move to `plans/archive/` and are not routine
implementation references.

## Historical and operational notes

- [Original architecture proposal](architecture.md): original design and chunk
  sequence, containing superseded descriptions; not a current architecture reference.
- [Admin SPA migration plan](implementation-plan.md): past implementation decisions
  and verification notes; not a current task or API contract.
- [Fresh-start commands](fresh-start.md): destructive database-volume reset notes,
  not the normal setup procedure. Use the repository README for normal setup.

## Proposed features

See the [feature plan index](plans/active/README.md) for separate implementation branches, paired PRs, dependencies and acceptance criteria. These plans do not describe shipped behavior.
