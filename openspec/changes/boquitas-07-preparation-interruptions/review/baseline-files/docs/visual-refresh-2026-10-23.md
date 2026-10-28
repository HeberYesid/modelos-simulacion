# Visual refresh verification

Date: 2026-10-23. Scope: the user-authorized Boquitas visual refresh using
frontend-design. GPT-6 Luna implemented the bounded presentation changes;
the main agent reviewed the actual diff, browser output and verification.

## Design and changes

The visual direction is an ice cream shop used as an analysis workbench.
Core colors are grape `#7041C9`, blackberry `#35234B`, raspberry `#B93867`,
pistachio `#E4F1D8`, lavender `#F6F5FA` and white. Trebuchet MS is used for
the brand and headings, and local Segoe UI for forms and scientific tables.
There are no new dependencies, remote fonts or external asset services.

Desktop navigation is a sidebar; at 900px and below it becomes a horizontal
bar. Forms, observation audits, charts, result controls and empty states
share the palette while preserving their separate information hierarchy.
The scene legend retains the existing 3D zone colors. Supporting page text
is limited to 65ch and mobile navigation labels remain at least 0.8rem.

Changed presentation files: `web/index.html`, `web/src/styles.css` and the
four files in `web/src/components/`. The only application-logic change is
main-view keyboard navigation in `web/src/main.ts`: vertical arrow support
and responsive tab orientation. Test changes add keyboard navigation and
table scrolling coverage, plus an assertion that the 3D retry control is
hidden while graphics are available.

## Observed verification

| Check | Actual result |
| --- | --- |
| `pnpm --dir web test --run` | 21 tests passed |
| `pnpm --dir web typecheck` | Passed |
| `pnpm --dir web contracts:check` | Passed |
| `pnpm --dir web build` | Passed |
| `pnpm --dir web test:e2e --workers=1` | 14 tests passed |
| `pnpm --dir web exec tsc --noEmit -p tsconfig.release.json` | Passed |
| `pnpm --dir web exec playwright test --config playwright.release.config.ts` | 6 tests passed |
| `openspec validate --changes --strict --no-interactive` | 6 changes passed |

Production request guards were active in all six acceptance tests: 49 local
HTTP requests and zero external attempts. The saved-result scientific
SHA-256 comparison also passed. Final hash comparisons found zero changes
to Python source or frontend API, services, domain and replay implementation
files. Existing spec04/spec06 evidence files were restored byte-for-byte
after test suites wrote their normal output. Python tests and Python static
checks were not rerun for this presentation-only change.

Browser inspection covered desktop, mobile and the actual 3D scene. A
separate production layout check inspected all three views at 320, 390, 768,
900, 901, 1024 and 1440px: 21 layouts, zero page-level horizontal overflows.

## Accessibility and regression evidence

ArrowDown originally left the scenario tab inactive and unfocused. The
focused regression failed before implementation and passed afterward.
The existing hidden retry button also originally computed as visible;
the added regression failed, then passed after restoring the CSS priority
of the native `hidden` attribute. Both remain covered in the passing suite.

The audit found preexisting unsupported ARIA on mode labels and result
containers. Native radios now supply the checked state; named result
containers have group roles. The order table has explicit keyboard focus
and an accessible group name. The new keyboard-scroll test already passed
in the installed Chromium before that explicit semantic correction; no
RED claim is made for that test.

Axe-core 4.12.1 with WCAG 2 A/AA and 2.1 A/AA tags detected zero violations
in the three final views. Results retained one incomplete contrast rule
covering eight SVG/canvas/symbol nodes. Their actual computed colors were
reviewed separately: chart text on white is 6.62:1, dark controls on white
14.06:1, and the scene-status overlay at least 12.31:1 even over black.
This is not a screen-reader or cross-browser certification.

## Evidence and limits

The new screenshots and audit JSON files are in this task's local artifact
folder:
`C:/Users/HeberYesid/.codex/visualizations/2026/10/23/01a16a51-3a27-71c2-807d-35e54f023980/`.
Key captures are `boquitas-desktop-after.png`, `boquitas-mobile-after.png`,
`boquitas-replay-after.png` and `boquitas-results-after.png`.

The build retains a nonfatal warning for the approximately 727kB minified
JavaScript chunk containing the application and Three.js. Bundle splitting
was outside this visual refresh. No calibration or empirical validation is
claimed, and no commit, push, synchronization, archive or deployment occurred.
