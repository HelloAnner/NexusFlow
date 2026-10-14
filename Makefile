.DEFAULT_GOAL := help
.PHONY: help deploy deploy-build preflight api-check test status health logs
DEPLOY_HOST ?= nexusflow
DEPLOY_PORT ?= 8089
REMOTE_ROOT ?= /opt/nexusflow
export DEPLOY_HOST DEPLOY_PORT REMOTE_ROOT

help:
	@printf 'targets: deploy (clean pushed main only), preflight (read-only), deploy-build, api-check/test (server attachment), status health logs\n'
# All local build operations exist only inside this release entrypoint.
deploy:
	./scripts/deploy.sh
deploy-build:
	./scripts/build-linux.sh
preflight:
	./scripts/preflight.sh
# No local tests, typecheck, or service. Use the deployed immutable attachment.
api-check test:
	@test -n "$(COMMIT)" || { echo 'COMMIT=<40-char deployed SHA> required'; exit 1; }
	ssh $(DEPLOY_HOST) 'bash $(REMOTE_ROOT)/validation/$(COMMIT)/source/scripts/server-checks.sh $(REMOTE_ROOT)/validation/$(COMMIT)'
status:
	ssh $(DEPLOY_HOST) 'sudo systemctl status nexusflow --no-pager'
health:
	ssh $(DEPLOY_HOST) 'curl -fsS http://127.0.0.1:$(DEPLOY_PORT)/nexusflow/healthz'
logs:
	ssh $(DEPLOY_HOST) 'sudo journalctl -u nexusflow -n 100 --no-pager'
