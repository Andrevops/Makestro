<p align="center">
  <img src="images/makestro-icon-animated.gif" alt="Makestro" width="128" />
</p>

# Makestro 🎶

> **Make** + **Maestro** — *the conductor of your Makefiles.*
> From Italian/Spanish *maestro* (master, conductor). Like a maestro orchestrates a symphony, Makestro orchestrates your build targets.

A language-agnostic VS Code extension that discovers and runs Makefile targets from a clean sidebar UI. Parses target descriptions, groups by sections, supports pinning favorites, quick-pick fuzzy search, and integrates with VS Code's built-in task runner.

Built for engineers who live in Makefiles but don't want to keep switching to the terminal.

## Features

- **Sidebar tree view** with activity bar icon — browse all targets at a glance
- **Explorer integration** — Make Targets panel in the VS Code Explorer tab
- **Section grouping** via `### Section Name` comments in your Makefile
- **Target descriptions** via `## Description` comments above targets
- **`.PHONY` awareness** — icons differentiate phony vs file-based targets
- **Quick Run** (`Alt+M R`) — fuzzy-search picker across all targets
- **Re-run Last** (`Alt+M L`) — instantly repeat the last executed target
- **Run with Arguments** — prompt for variable overrides like `VERBOSE=1`
- **Pin / Unpin** targets via right-click context menu
- **Go to Target** — jump to the exact line in the Makefile
- **Multi-Makefile support** — auto-discovers Makefiles, or select one manually
- **File watcher** — auto-refreshes when your Makefile changes
- **VS Code Task Provider** — targets appear in `Tasks: Run Task`
- **[Diffchestrator](https://marketplace.visualstudio.com/items?itemName=andrevops-com.diffchestrator) integration** — auto-discovers Makefiles from the selected repo

## Makefile Conventions

Makestro reads structured comments to build a navigable sidebar:

```makefile
### Build                        # Section header (groups targets below it)
## Compile the project           # Target description (shown in sidebar)
build:
    go build ./...

## Run unit tests
test: build
    go test ./...

### Docker
## Build the container image
docker-build:
    docker build -t myapp .

.PHONY: build test docker-build
```

| Prefix | Purpose |
|--------|---------|
| `###`  | Section header — groups subsequent targets |
| `##`   | Target description — displayed next to the target name |
| `.PHONY` | Marks targets as phony (different icon in sidebar) |

Both prefixes are configurable via settings.

## Keybindings

| Shortcut | Command |
|----------|---------|
| `Alt+M R` | Quick Run (fuzzy picker) |
| `Alt+M L` | Re-run Last Target |
| `Alt+M S` | Stop Running Target |
| `Alt+M 1`..`9`, `0` | Run pinned target by slot (1st through 10th) |

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `Makestro: Quick Run...` | Fuzzy-search and run a target |
| `Makestro: Re-run Last Target` | Repeat the last executed target |
| `Makestro: Stop Running Target` | Kill the active terminal |
| `Makestro: Refresh Targets` | Re-parse the Makefile |
| `Makestro: Open Makefile` | Open the active Makefile in the editor |
| `Makestro: Select Makefile...` | Choose which Makefile to use |
| `Makestro: Run Target with Arguments...` | Run with extra args/variables |

## Diffchestrator Integration

When [Diffchestrator](https://marketplace.visualstudio.com/items?itemName=andrevops-com.diffchestrator) is installed, Makestro automatically discovers Makefiles from the currently selected repo — even if that repo is outside your workspace.

- Select a repo in Diffchestrator and Makestro shows its targets
- Switch repos and Makestro auto-refreshes
- Works in both the Makestro sidebar and the Explorer panel
- No configuration needed — the integration is automatic and optional

Makefile resolution priority:

1. `makestro.defaultMakefile` setting (explicit path always wins)
2. Diffchestrator's selected repo
3. Workspace folder auto-discovery

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `makestro.makeCommand` | `make` | Path to the make binary |
| `makestro.scanDepth` | `3` | Max directory depth to scan for Makefiles |
| `makestro.excludePatterns` | `[node_modules, .git, ...]` | Glob patterns to skip when scanning |
| `makestro.descriptionCommentPrefix` | `##` | Prefix for target descriptions |
| `makestro.sectionCommentPrefix` | `###` | Prefix for section headers |
| `makestro.autoRefresh` | `true` | Auto-refresh on Makefile changes |
| `makestro.pinnedTargets` | `[]` | Pinned target names (managed via UI) |
| `makestro.showPhonyOnly` | `false` | Only show `.PHONY` targets |
| `makestro.runInIntegratedTerminal` | `true` | Run in terminal (false = output channel) |
| `makestro.defaultMakefile` | `""` | Explicit Makefile path (empty = auto-detect) |

## Development

```bash
# Install dependencies
npm install

# Watch mode (recompile on changes)
make watch

# Lint
make lint

# Package .vsix
make package

# Release (auto-bump from conventional commits)
make release
```

Press `F5` in VS Code to launch the Extension Development Host.

## Release

Releases are automated via GitHub Actions. The workflow triggers on `v*` tags and:

1. Compiles and packages two `.vsix` files (VS Code Marketplace + Open VSX)
2. Generates SHA256 checksums and signs them with Ed25519
3. Creates a GitHub Release with build provenance attestation
4. Publishes to Open VSX (Marketplace publishing available when configured)

```bash
# Auto-detect bump, build, tag
make release

# Push code + tag to trigger CI
git push && git push origin v<version>
```

## Verify Release Integrity

```bash
# Verify build provenance
gh attestation verify makestro-*.vsix --repo Andrevops/Makestro

# Verify checksum signature
sha256sum -c checksums.txt
openssl pkeyutl -verify -pubin -inkey public_key.pem -rawin \
  -in checksums.txt -sigfile <(xxd -r -p checksums.txt.sig)
```

## License

MIT
