# Commands

- **Typecheck**: `pnpm tc` (`tc:node` / `tc:cli` / `tc:web`)
- **Test**: `pnpm test <path> --maxWorkers=2`; incremental `pnpm test:changed <path> --maxWorkers=2` ([details](.github/CONTRIBUTING.md#targeting-local-tests)). Rendered UI E2E needs explicit viewport/state.
- **Lint/format**: `pnpm exec oxlint <files>`; full `pnpm lint`; `pnpm exec oxfmt --check <files>` (fix with `--write`). Gates: `pnpm check:code-quality:changed <base>`, `pnpm check:flaky-test-pattern-ratchet`.

> [!IMPORTANT]
> Run `pnpm check:changed` after the last edit/rebase, right before every push. Never `--no-verify`.

Prefer scoped checks over wide fan-out and report the limits. Base defaults to `origin/main` (`ORCA_CODE_QUALITY_BASE=<ref>` for stacks); `--base=HEAD` and dirty-only checks are incremental evidence only.

# CI

Watch, don't poll: `gh run watch <run-id> --compact --exit-status` or `gh pr checks --watch`.

# Repo Rules

- Keep main releasable.
- Never leave CI broken; if it is, merge the fix.
- **Don't add tests by default.** Add one only if it fails when your change is reverted, hardcodes expected values (never derived from production code, locales, or mocks), and lives at the single layer owning the behavior. Never test copy/translations, CSS, constants, third-party libs, private state, timing, or work counts — delete such tests instead of updating them ([anti-patterns](./docs/agents-md-refs/test-antipatterns.md)).

# Design System

UI work (layout, color, typography, spacing, components, UX) follows [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens in `src/renderer/src/assets/main.css` (canonical) and the shadcn primitives in `src/renderer/src/components/ui/`. Never invent colors, font sizes, or shadow tiers a documented token already covers.

# Electron UI Validation

- Launch agent apps and tests in background with `ORCA_BACKGROUND_LAUNCH=1`.
- Never steal focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`, `app.focus()`, or OS activation. Screenshot hidden renderers over CDP.
- Pause native-focus and visible-window tests on the user's desktop; run them on an isolated display or CI.
- Rebuild modified launch-policy code before launching (stale build wrappers are unsafe).
- Use the `$electron` skill and Playwright CDP for Orca UI checks, never computer-use. Presentational components: `pnpm fixtures:shot <id>` ([fixtures](docs/agents-md-refs/component-fixtures.md)).

# Code Style

- **Reuse before reimplementing**: extend or generalize existing logic at any scale; never build a parallel version.
- **Comments**: only when code cannot say it — one line, why not how.
- **Naming**: no `helpers`, `utils`, `common`, `misc`, `shared-stuff` for files, folders, or modules. Name them after the concrete domain concept (`tab-group-state.ts`, not `tabs-helpers.ts`). If `helpers` feels right, the file has more than one responsibility: split it or find the better name.

# First Class Citizens

Every change must account for:

1. **Cross-platform** (mac/linux/windows): guard platform behavior at runtime, use platform-aware shortcuts, paths, and process wrappers. Read [`docs/agents-md-refs/cross-platform-support.md`](./docs/agents-md-refs/cross-platform-support.md) before touching processes, shells, shortcuts, paths, or native modules.
2. **Remote hosts**: features work locally and remotely.
3. **Mobile**.
4. **Folder workspaces**: don't assume every workspace is a git worktree.

# Footguns

- **Git/GitHub**: read [`docs/agents-md-refs/git-workflow.md`](./docs/agents-md-refs/git-workflow.md) before changing `git`, `gh`, source-control, or review behavior.
