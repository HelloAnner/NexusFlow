#!/usr/bin/env bash
set -euo pipefail

SERVER="${1:-nexusflow}"

ssh "$SERVER" 'bash -s' <<'REMOTE'
set -euo pipefail

APP_DIR=/opt/nexusflow
APP_USER=nexusflow
DB_NAME=nexusflow
DB_USER=nexusflow
DB_PASSWORD="${NEXUSFLOW_DB_PASSWORD:-nexusflow_pass_8089}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-nexusflow}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-nexusflow_minio_8089}"
IMAGE_PREFIX="${NEXUSFLOW_IMAGE_PREFIX:-docker.m.daocloud.io}"
POSTGRES_IMAGE="${NEXUSFLOW_POSTGRES_IMAGE:-$IMAGE_PREFIX/library/postgres:16-alpine}"
REDIS_IMAGE="${NEXUSFLOW_REDIS_IMAGE:-$IMAGE_PREFIX/library/redis:7-alpine}"
MINIO_IMAGE="${NEXUSFLOW_MINIO_IMAGE:-$IMAGE_PREFIX/minio/minio:latest}"
MINIO_MC_IMAGE="${NEXUSFLOW_MINIO_MC_IMAGE:-$IMAGE_PREFIX/minio/mc:latest}"

mkdir -p "$APP_DIR"/{src,logs,postgres-data,redis-data,minio-data}

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /sbin/nologin "$APP_USER"
fi

yum install -y curl ca-certificates tar gzip gcc gcc-c++ make pkgconfig openssl-devel perl git rsync yum-utils device-mapper-persistent-data lvm2 >/tmp/nexusflow-yum.log 2>&1 || {
  cat /tmp/nexusflow-yum.log
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  yum install -y docker podman-docker >/tmp/nexusflow-docker-yum.log 2>&1 || {
    cat /tmp/nexusflow-docker-yum.log
    exit 1
  }
fi

if systemctl list-unit-files docker.service --no-legend 2>/dev/null | grep -q '^docker\.service'; then
  systemctl enable --now docker
elif systemctl list-unit-files podman.socket --no-legend 2>/dev/null | grep -q '^podman\.socket'; then
  systemctl enable --now podman.socket
fi

# Host packages may have been installed by an earlier non-Docker provision.
# Stop them so Docker can bind the standard local component ports.
systemctl disable --now postgresql redis minio >/dev/null 2>&1 || true
rm -f /etc/systemd/system/minio.service
systemctl daemon-reload

docker network create nexusflow >/dev/null 2>&1 || true

docker rm -f nexusflow-postgres nexusflow-redis nexusflow-minio >/dev/null 2>&1 || true

docker run -d \
  --name nexusflow-postgres \
  --restart always \
  --network nexusflow \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -v "$APP_DIR/postgres-data:/var/lib/postgresql/data:Z" \
  "$POSTGRES_IMAGE"

docker run -d \
  --name nexusflow-redis \
  --restart always \
  --network nexusflow \
  -p 127.0.0.1:6379:6379 \
  -v "$APP_DIR/redis-data:/data:Z" \
  "$REDIS_IMAGE" redis-server --appendonly yes

docker run -d \
  --name nexusflow-minio \
  --restart always \
  --network nexusflow \
  -p 127.0.0.1:9000:9000 \
  -p 127.0.0.1:9001:9001 \
  -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  -v "$APP_DIR/minio-data:/data:Z" \
  "$MINIO_IMAGE" server /data --address :9000 --console-address :9001

echo "waiting for containers"
for i in $(seq 1 60); do
  if docker exec nexusflow-postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 \
    && docker exec nexusflow-redis redis-cli ping >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker run --rm --network nexusflow \
  -e MC_HOST_local="http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@nexusflow-minio:9000" \
  "$MINIO_MC_IMAGE" mb --ignore-existing local/nexusflow >/dev/null

cat >"$APP_DIR/.env" <<EOF
APP_ENV=production
APP_HOST=0.0.0.0
APP_PORT=8089
APP_PUBLIC_URL=http://127.0.0.1:8089

DATABASE_URL=postgres://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME
DATABASE_MAX_CONNECTIONS=20

REDIS_URL=redis://127.0.0.1:6379/0
REDIS_KEY_PREFIX=nexusflow:

S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=nexusflow
S3_ACCESS_KEY=$MINIO_ROOT_USER
S3_SECRET_KEY=$MINIO_ROOT_PASSWORD
S3_FORCE_PATH_STYLE=true

SESSION_SECRET=nexusflow-session-secret-change-me
JWT_SECRET=nexusflow-jwt-secret-change-me

UPLOAD_MAX_MB=100
EXPORT_EXPIRE_HOURS=24
SEARCH_BACKEND=postgres
EOF
chmod 600 "$APP_DIR/.env"

cat >/etc/systemd/system/nexusflow.service <<EOF
[Unit]
Description=NexusFlow single binary
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/nexusflow
Restart=always
RestartSec=3
User=root
Group=root
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/logs" || true

docker ps --filter 'name=nexusflow-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo "provisioned docker base components"
REMOTE
