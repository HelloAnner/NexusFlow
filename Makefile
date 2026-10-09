.DEFAULT_GOAL := help
.PHONY: help install build api-check test deploy-build deploy status health logs
DEPLOY_HOST ?= nexusflow
DEPLOY_PORT ?= 8089
DEPLOY_BINARY ?= dist/linux-x86_64/nexusflow

help:
	@printf 'targets: install build api-check test deploy-build deploy status health logs\n'
install:
	cd apps/api && bun install
	cd cli && bun install
build: deploy-build
api-check:
	cd apps/api && bunx tsc --noEmit
	cd cli && bunx tsc --noEmit
test:
	cd apps/api && bun test
	cd cli && bun test
deploy-build:
	./scripts/build-linux.sh
deploy: deploy-build
	DEPLOY_HOST=$(DEPLOY_HOST) DEPLOY_PORT=$(DEPLOY_PORT) DEPLOY_BINARY=$(DEPLOY_BINARY) ./scripts/deploy.sh
status:
	ssh $(DEPLOY_HOST) 'sudo systemctl status nexusflow --no-pager'
health:
	curl -fsS http://101.200.138.250:$(DEPLOY_PORT)/nexusflow/healthz
	curl -fsS http://101.200.138.250:$(DEPLOY_PORT)/nexusflow/readyz
logs:
	ssh $(DEPLOY_HOST) 'sudo journalctl -u nexusflow -n 100 --no-pager'
