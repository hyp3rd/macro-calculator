include .project-settings.env

# MacroCalculator — Makefile is the quality-gate contract.
#
# AGENTS.md §4: every target listed here must be wired and
# green before declaring a task done. `make ci` runs the full
# gate sequence (fmt-check + lint + typecheck + test + sec +
# build) and is what CI invokes.

REPO_PREFIX ?= github.com/hyp3rd/macro-calculator
NODE_VERSION ?= 25
SMOKE_TESTS_PATH ?=./scripts/tests/smoke/

NPM ?= npm
NPX ?= npx

# All targets are PHONY — none of them produce a tracked
# artefact. Splitting them out at the bottom keeps the rule
# bodies readable.

# ---- Help ------------------------------------------------------------
help: ## Print available targets and their descriptions.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ---- Development -----------------------------------------------------
# `make build` requires no env stubs: src/env/server.ts skips
# strict validation during NEXT_PHASE=phase-production-build,
# which Next sets for us. Runtime (operator deploy) still
# enforces validation on each fresh server process — the build
# artifact is JS source, not a snapshot of module exports.

dev: ## Run the dev server (next dev) on :3000.
	$(NPM) run dev

build: ## Production build (next build, standalone output).
	$(NPM) run build

start: ## Run the production server (requires a prior `make build`).
	$(NPM) run start

# ---- Quality gates ---------------------------------------------------
fmt: lint ## Auto-format with Prettier.
	$(NPM) run format

fmt-check: ## Verify Prettier formatting (CI-friendly; non-zero on diff).
	$(NPX) prettier --ignore-unknown --check .

lint: ## Run ESLint flat config.
	$(NPM) run lint

lint-fix: ## ESLint with --fix.
	$(NPM) run lint:fix
	$(NPM) run format

typecheck: ## TypeScript type-check (no emit).
	$(NPX) tsc --noEmit

test: ## Vitest unit + component tests.
	$(NPX) vitest run

test-watch: ## Vitest in watch mode (interactive).
	$(NPX) vitest

e2e: ## Playwright end-to-end suite.
	$(NPX) playwright test

# `npm audit` exit codes: 1 on findings >= --audit-level threshold.
# Two transitive moderate postcss vulns ship with Next 16; the
# fix would downgrade Next to v9 (breaking). We accept moderate
# findings until Vercel patches and gate CI on `high+` only.
sec: ## npm audit for high+ severity findings.
	$(NPM) audit --audit-level=high

pre-commit:
	@if command -v pyenv >/dev/null 2>&1; then \
		eval "$$(pyenv init -)" && \
		pyenv activate pre-commit && \
		pre-commit run -a trailing-whitespace && \
		pre-commit run -a end-of-file-fixer && \
		pre-commit run -a markdownlint && \
		pre-commit run -a yamllint && \
		pre-commit run -a cspell && \
		pre-commit run -a cspell; \
	else \
		echo "pyenv command not found"; \
	fi

# ---- Composite -------------------------------------------------------
# Order matters: format-check first (instant), lint next
# (fastest of the slow checks), build last (longest). Each
# step fails fast on its own — no point running `build` if
# typecheck already errored.
ci: pre-commit fmt-check lint typecheck test sec build ## Run every quality gate.


.PHONY: help dev build start fmt fmt-check lint lint-fix typecheck \
	test test-watch e2e sec ci
