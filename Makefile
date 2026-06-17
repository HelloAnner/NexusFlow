SERVER ?= nexusflow
REMOTE_DIR ?= /opt/nexusflow/src

.PHONY: deploy deploy-provision deploy-build deploy-restart

deploy:
	./scripts/deploy.sh $(SERVER) $(REMOTE_DIR)

deploy-provision:
	./scripts/provision_server.sh $(SERVER)

deploy-build:
	ssh $(SERVER) 'cd $(REMOTE_DIR) && ./scripts/build_release.sh'

deploy-restart:
	ssh $(SERVER) 'systemctl restart nexusflow && systemctl status nexusflow --no-pager -l'
