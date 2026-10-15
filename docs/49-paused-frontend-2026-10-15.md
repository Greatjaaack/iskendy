# Historical pause snapshot · 15 October 2026

> Superseded: the owner explicitly requested “Продолжай разработку фронтэнда”. Work resumed; the state and limits below describe the earlier pause, not the current verification. See docs/48 and the final implementation report.

Working directory: `/Users/maxgainullin/Desktop/дюрюмная/frontend-mobile`.
Branch: `feat/responsive-liquid-glass-20261015`. Changes saved as uncommitted working files. No deployment or push.

The owner approved implementing today's mobile/tablet/desktop Figma designs, then explicitly requested a pause to close the laptop. Do not resume development until asked. Local servers on 5173, 5175 and 4185 were stopped.

## Implemented, still under verification

- `GuestExperience` replaces the old guest presentation while App retains polling, collection/storage, telemetry and platform signal ownership.
- Review UI: order cards/art, responsive layouts, carousel indicators, nested details, top notification button, light pink glass dock with held pointer lens, board outline legend, help/FAQ/manager/message screens, notification events/settings, skeleton/error/offline/toast states.
- Glass Button/Input/Sheet; VisualViewport keyboard placement. Rating starts at neutral 3 with stable layout, reasons, Other explanation, comment and attachments. Both branches now visit the comment step.
- Original Figma assets downloaded to `src/assets/review/` with SOURCE.json. No dependencies added.
- Owner confirmed no API exists for messages/uploads. Backend requirements recorded in `docs/48-responsive-liquid-glass-2026-10-15.md`. No false send success; local file drafts/removal work. Image preview uses FileReader data URLs to match current CSP.

## Evidence and current limits

- Typecheck, lint and token checks passed before the final test run.
- Latest production build + size check passed: first JS 111.20 KiB gzip, lazy JS 53.96 KiB, CSS 12.60 KiB.
- Initial browser capture of mobile/tablet/desktop, one/two/three orders: no runtime errors, page overflow or broken images. Screenshots in `.impeccable/review/`; `first-inspection.json` contains details. Later changes need final recapture.
- Full unit suite is **not green**. Latest log `/private/tmp/iskendi-unit-20261015-2.log`; initial log `/private/tmp/iskendi-unit-20261015.log`. Many assertions still describe old entry/return-bar/rating behavior; review failures carefully rather than weakening meaningful API/security checks.
- Native Vite dev inspection displayed bootstrap fallback; built preview worked. Investigate the dev-only issue before handoff.

## Resume work

1. Review latest test failures and complete meaningful tests for new routes, claims/permissions, anonymous forms/files and neutral/Other rating flow. Existing flow/UI tests must be updated to approved semantics.
2. Fix detail carousel scroll: current selection updates on every scroll and its effect recenters; use settled scrolling so native swipe is not interrupted. Ensure focus/history preserve the entry context.
3. Check all source states and responsive compositions against cached high-fidelity contexts in `/private/tmp/figma-context-*.txt`, `/private/tmp/figma-more-*.txt`; root Figma pages: mobile `789:2`, tablet `882:9764`, desktop `881:4164`. Main targets: `791:22`, `884:7620`, `881:4166`.
4. Finish legacy component consolidation/cleanup without removing backend logic, and ensure empty initial Entry follows the intended design. Current Entry is reused embedded with new glass fields/actions.
5. Review all user-visible copy against Figma. Some initial help/system copy is in `src/content/review.ts`; verify exact FAQ answers and move remaining literals there.
6. Complete frontend corner scenarios and meaningful browser/device-width tests, including keyboard, drag cancellation, reduced motion, offline/server failures, ready signals and upload-unavailable recovery. Current message API remains intentionally unavailable pending backend work.
7. Run formatting, re-annotate exact Figma px values if formatter moves comments, then verify token guard, typecheck, lint, full unit/build/size/e2e. Do not change budgets to hide a regression.
8. Run Impeccable detector once when finished; final independent finish review/documentation remain pending. Update DESIGN.md and design sidecar to approved milk/pink Glass system (older docs still describe black dock). No production-ready claim yet.

Do not edit the unrelated main checkout `/Users/maxgainullin/Projects/iskendy-frontend` or its staged changes. Git metadata for this worktree lives there; creating the new worktree branch was explicitly escalated and succeeded.
