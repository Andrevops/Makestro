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
## Build the .vsix package
package: compile
	npm run package

## Publish to VS Code Marketplace
publish: compile
	npm run publish

### Cleanup
## Remove compiled output
clean:
	rm -rf out/

## Remove all generated files and dependencies
nuke: clean
	rm -rf node_modules/ *.vsix

.PHONY: install compile watch lint package publish clean nuke
