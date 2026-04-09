### Development
## Install all dependencies
install:
	npm install

## Compile TypeScript to JavaScript
compile:
	npm run compile

## Watch for changes and recompile
watch:
	npm run watch

## Run ESLint on source files
lint:
	npm run lint

### Packaging
## Build and package .vsix
package: compile
	npx @vscode/vsce package --no-dependencies

### Release
## Auto-detect bump from conventional commits, build, and package
release:
	node scripts/release.mjs

## Force bump types
release-patch:
	node scripts/release.mjs patch

release-minor:
	node scripts/release.mjs minor

release-major:
	node scripts/release.mjs major

### Publishing
## Install the latest Marketplace .vsix locally (excludes openvsx builds)
install-local:
	@vsix=$$(ls -t makestro-*.vsix 2>/dev/null | grep -v openvsx | head -1); \
	if [ -z "$$vsix" ]; then echo "No .vsix found. Run 'make package' first."; exit 1; fi; \
	echo "Installing $$vsix"; \
	code --install-extension "$$vsix" --force

## Publish to VS Code Marketplace
publish-marketplace:
	@vsix=$$(ls -t makestro-*[0-9].vsix 2>/dev/null | grep -v openvsx | head -1); \
	if [ -z "$$vsix" ]; then echo "No marketplace .vsix found. Run 'make release' first."; exit 1; fi; \
	echo "Publishing $$vsix to VS Code Marketplace"; \
	npx @vscode/vsce publish --packagePath "$$vsix"

## Publish to Open VSX
publish-openvsx:
	@vsix=$$(ls -t makestro-*-openvsx.vsix 2>/dev/null | head -1); \
	if [ -z "$$vsix" ]; then echo "No Open VSX .vsix found. Run 'make release' first."; exit 1; fi; \
	echo "Publishing $$vsix to Open VSX"; \
	npx ovsx publish "$$vsix"

## Publish to both registries
publish: publish-marketplace publish-openvsx

### Cleanup
## Remove compiled output
clean:
	rm -rf out/

## Remove all generated files and dependencies
nuke: clean
	rm -rf node_modules/ *.vsix

.PHONY: install compile watch lint package release release-patch release-minor release-major install-local publish-marketplace publish-openvsx publish clean nuke
