# Changelog

## [0.5.4] — 2026-04-10

### Bug Fixes
- Skip target-specific variable assignments and deduplicate targets


## [0.5.3] — 2026-04-10

### Bug Fixes
- Clear stale tree data when refreshing with no Makefile


## [0.5.2] — 2026-04-10

### Bug Fixes
- Clear targets and pinned views when repo has no Makefile


## [0.5.1] — 2026-04-10

### Bug Fixes
- Preserve editor focus when showing terminal after target run


## [0.5.0] — 2026-04-10

### Features
- Run pinned targets by slot with Alt+M 1-9,0 keybindings


## [0.4.0] — 2026-04-10

### Features
- Scope pinned targets per Makefile path


## [0.3.4] — 2026-04-09

### Other
- Docs: add name origin and meaning to README


## [0.3.3] — 2026-04-09

### Bug Fixes
- Fall back to global settings when no workspace is open


## [0.3.2] — 2026-04-09

### Bug Fixes
- Use per-repo terminals with icon instead of prefixed name


## [0.3.1] — 2026-04-09

### Bug Fixes
- Reuse single terminal for target execution


## [0.3.0] — 2026-04-09

### Features
- Add Explorer tab integration and Diffchestrator compatibility


## [0.2.1] — 2026-04-09

### Other
- Chore: align Makefile install target with other extensions


## [0.2.0] — 2026-04-09

### Features
- Add release pipeline, signing, documentation, and icon
- Initial scaffold for Makestro VS Code extension


## [0.1.0] — 2026-04-09

### Features

- Initial scaffold with Makefile parser, sidebar tree view, and target runner
- Section grouping via `###` comments and target descriptions via `##` comments
- `.PHONY` awareness with distinct icons
- Quick Run fuzzy picker, Re-run Last, Stop, Run with Arguments
- Pin/Unpin targets via context menu
- Go to Target — jump to exact Makefile line
- Multi-Makefile auto-discovery with configurable scan depth
- File watcher with auto-refresh on Makefile changes
- VS Code Task Provider integration
- GitHub Actions release workflow with Ed25519 checksum signing and build provenance
- Conventional commit release script with auto-bump detection
