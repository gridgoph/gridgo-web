# Shared priorities for tracker items and issue reports

## Behavior
Super Admin can pin tracker items. Operations and Super Admin can pin issue reports. Pins are shared, persist across refresh and sign-in, and are independent of workflow status. Pinning never moves or removes the original item. No votes, personal favorites, or automatic status changes.

Tracker: add a Priorities section before the existing groups, a Priorities filter with count, and pin/unpin controls in desktop rows and mobile cards. Normal groups retain pinned items. Search/developer/status filtering applies to the top section. The tracker, including pins, status editing, decisions and private attachments, stays Super Admin only.

Issue reports: add a first Priorities tab across all statuses, plus priority tags in existing lists and a pin/unpin control in the report header. Use server filtering and keyset pagination so old pinned reports are found beyond the first page. Keep status counts independent.

## Persistence and API
- Tracker priority is the GitHub `priority` label. Mutate only that label, preserving other labels, issue state and body; audit actor and before/after. Reuse tracker lock and cache.
- Report priority is an additive PostgreSQL boolean default false, with last priority actor/time metadata. Priority-only PATCH preserves status, publication date and issue URL atomically. Only dashboard Operations/Super Admin may change it; public submissions cannot set it.
- Report pins and tracker pins apply to their own records. Linking a report does not silently pin or unpin another record.
- No Operations tracker page or endpoints: existing Super Admin authorization stays unchanged.

## Implementation sequence
1. Add failing API integration tests for pin/unpin, persistence, invalid input, authorization and preserved metadata; add UI interaction tests for duplicate views and failure states.
2. Add forward migration, report query/update support, Super Admin tracker label endpoint.
3. Extend typed client and shared pin control; add tracker section/filter and reports tab with existing GRIDGO components and tokens.
4. Run focused tests, full suites, typecheck, lint and production build. Exercise desktop/mobile UI locally, including failed saves and reloads.
5. Commit feature on dev-based branches and validate dev. Promote only feature commits to main-based release branches, rerun checks, use existing CI deployment and confirm live commit health API-first then web.

## Review focus
- Priority changes must preserve status/link/publication and unrelated GitHub labels.
- Operations must not gain any tracker access.
- Invalid boolean values, unauthenticated/client callers and untracked issue IDs must fail.
- Pinned reports beyond page one must appear with correct count and no duplicated pages.
- Failed writes must show recovery text and never display a false successful pin.
- Unpin removes the priority copy while retaining the original row; pins survive refresh.

## Release scope
Dev has unrelated unreleased commits. Do not promote all of dev. No credentials, environment backups, infrastructure, financial settings or existing work are part of this change.
