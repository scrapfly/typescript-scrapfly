# Scrapfly TypeScript SDK — release/dev Makefile.
# Target names mirror sdk/python & sdk/rust Makefiles for muscle-memory parity.
# Source of truth for the version is deno.json; build.ts copies it into npm/package.json.
# Publishes to npm (via dnt output in ./npm) and JSR (via publish-jsr.sh).

VERSION ?=
NEXT_VERSION ?=

.PHONY: init install dev bump generate-docs release fmt lint test build publish-npm publish-jsr

init:
	@command -v deno >/dev/null || { echo "deno is required"; exit 2; }

install:
	deno cache src/main.ts
	cd npm && npm install

dev:
	deno task build-npm

bump:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make bump VERSION=x.y.z"; exit 2; fi
	@# deno.json is the single source of truth; build.ts reads it and stamps npm/package.json.
	sed -i "s/^\(  \"version\": \"\)[^\"]*\(\"\)/\1$(VERSION)\2/" deno.json
	git add deno.json
	git commit -m "bump version to $(VERSION)"
	git push

generate-docs:
	@# TypeScript SDK relies on README + JSR-generated docs; nothing to build locally.
	@true

build:
	deno task build-npm

test:
	deno task test

fmt:
	deno task fmt

lint:
	@# deno lint stays advisory; wired here so `make lint` is never a 404.
	deno lint src

publish-npm:
	cd npm && npm publish --access public

publish-jsr:
	./publish-jsr.sh

release:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=x.y.z [NEXT_VERSION=x.y.(z+1)]"; exit 2; fi
	git branch | grep \* | cut -d ' ' -f2 | grep main || exit 1
	git pull origin main
	@# Stamp deno.json to the release version BEFORE build so npm/package.json gets it.
	sed -i "s/^\(  \"version\": \"\)[^\"]*\(\"\)/\1$(VERSION)\2/" deno.json
	$(MAKE) test
	$(MAKE) build
	git add deno.json npm/package.json
	-git commit -m "Release $(VERSION)"
	-git push origin main
	git tag -a v$(VERSION) -m "Version $(VERSION)"
	git push --tags
	$(MAKE) publish-npm
	$(MAKE) publish-jsr
	@if [ -n "$(NEXT_VERSION)" ]; then $(MAKE) bump VERSION=$(NEXT_VERSION); fi
