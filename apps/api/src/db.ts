import postgres from "postgres";
import Redis from "ioredis";
import { config } from "./config.ts";
export const sql = config.databaseUrl ? postgres(config.databaseUrl, { max: 10 }) : null;
export const redis = config.redisUrl ? new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null }) : null;
export async function migrate() {
  if (!sql) return;
  await sql`CREATE SCHEMA IF NOT EXISTS nexusflow`;
  await sql`CREATE TABLE IF NOT EXISTS nexusflow.records (id text PRIMARY KEY, kind text NOT NULL, tenant_id text, created_by text, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE nexusflow.records ADD COLUMN IF NOT EXISTS tenant_id text`;
  await sql`ALTER TABLE nexusflow.records ADD COLUMN IF NOT EXISTS created_by text`;
  await sql`ALTER TABLE nexusflow.records ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`;
  await sql`ALTER TABLE nexusflow.records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`;
  await sql`CREATE INDEX IF NOT EXISTS records_kind_tenant_idx ON nexusflow.records(kind,tenant_id)`;
  await sql`CREATE TABLE IF NOT EXISTS nexusflow.users (id text PRIMARY KEY, username text NOT NULL, password_hash text NOT NULL DEFAULT '', display_name text NOT NULL DEFAULT 'User', role text NOT NULL DEFAULT 'member', tenant_id text, org_id text, status text NOT NULL DEFAULT 'active', portal_id text, portal_tenant_id text, portal_permissions text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS username text`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'User'`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS tenant_id text`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS org_id text`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS org_ids text[] NOT NULL DEFAULT '{}'`;
  await sql`UPDATE nexusflow.users SET org_ids=ARRAY[org_id] WHERE org_id IS NOT NULL AND cardinality(org_ids)=0`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS portal_id text`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS portal_tenant_id text`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS portal_permissions text[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`;
  await sql`ALTER TABLE nexusflow.users DROP CONSTRAINT IF EXISTS users_username_key`;
  await sql`ALTER TABLE nexusflow.users DROP CONSTRAINT IF EXISTS users_portal_id_key`;
  await sql`DROP INDEX IF EXISTS nexusflow.users_username_lower_idx`;
  await sql`UPDATE nexusflow.users SET tenant_id='local' WHERE tenant_id IS NULL AND portal_id IS NULL`;
  await sql`UPDATE nexusflow.users SET portal_tenant_id=tenant_id WHERE portal_id IS NOT NULL AND portal_tenant_id IS NULL`;
  await sql`UPDATE nexusflow.records r SET tenant_id=u.tenant_id FROM nexusflow.users u WHERE r.created_by=u.id AND r.tenant_id IS NULL`;
  await sql`UPDATE nexusflow.records SET tenant_id='local' WHERE tenant_id IS NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_username_lower_idx ON nexusflow.users(tenant_id,lower(username))`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_portal_identity_idx ON nexusflow.users(portal_tenant_id,portal_id) WHERE portal_id IS NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS nexusflow.portal_file_links (
    portal_tenant_id text NOT NULL, portal_user_id text NOT NULL,
    local_user_id text NOT NULL REFERENCES nexusflow.users(id), local_tenant_id text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
    reason text NOT NULL, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(portal_tenant_id,portal_user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS nexusflow.audit (id text PRIMARY KEY, actor text, tenant_id text, action text NOT NULL, object_kind text, object_id text, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`;
  // 租户注册表：NexusFlow 原来只有 tenant_id 字符串；同步需要一个可查询的租户实体。
  await sql`CREATE TABLE IF NOT EXISTS nexusflow.tenants (
    id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
    status text NOT NULL DEFAULT 'active', portal_tenant_id text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS tenants_portal_idx ON nexusflow.tenants(portal_tenant_id) WHERE portal_tenant_id IS NOT NULL`;
  // 统一 RBAC：个人级权限覆盖。角色/组织基线仍由 permissions.ts 计算。
  await sql`CREATE TABLE IF NOT EXISTS nexusflow.permission_override (
    tenant_id text NOT NULL,
    subject_type text NOT NULL DEFAULT 'user' CHECK (subject_type IN ('user')),
    subject_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL CHECK (action IN ('view','edit','manage')),
    effect text NOT NULL CHECK (effect IN ('allow','deny')),
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, subject_type, subject_id, entity_type, entity_id, action))`;
  await sql`CREATE INDEX IF NOT EXISTS permission_override_subject_idx ON nexusflow.permission_override(tenant_id,subject_id)`;
  await sql`CREATE INDEX IF NOT EXISTS permission_override_entity_idx ON nexusflow.permission_override(tenant_id,entity_type,entity_id)`;
  await sql`INSERT INTO nexusflow.tenants (id,code,name,status,portal_tenant_id)
    SELECT DISTINCT tenant_id,tenant_id,tenant_id,'active',
      CASE WHEN tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN tenant_id ELSE NULL END
    FROM nexusflow.users WHERE tenant_id IS NOT NULL ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO nexusflow.tenants (id,code,name,status,portal_tenant_id)
    SELECT DISTINCT tenant_id,tenant_id,tenant_id,'active',
      CASE WHEN tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN tenant_id ELSE NULL END
    FROM nexusflow.records WHERE tenant_id IS NOT NULL ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO nexusflow.tenants (id,code,name,status,portal_tenant_id)
    VALUES (${config.localTenantId},${config.localTenantId},'默认租户','active',NULL)
    ON CONFLICT DO NOTHING`;
  await sql`ALTER TABLE nexusflow.audit ADD COLUMN IF NOT EXISTS actor text`;
  await sql`ALTER TABLE nexusflow.audit ADD COLUMN IF NOT EXISTS tenant_id text`;
  await sql`ALTER TABLE nexusflow.audit ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'legacy'`;
  await sql`ALTER TABLE nexusflow.audit ADD COLUMN IF NOT EXISTS object_kind text`;
  await sql`ALTER TABLE nexusflow.audit ADD COLUMN IF NOT EXISTS object_id text`;
  await sql`ALTER TABLE nexusflow.audit ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE nexusflow.audit ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`;
  await sql`UPDATE nexusflow.audit a SET tenant_id=u.tenant_id FROM nexusflow.users u WHERE a.actor=u.id AND a.tenant_id IS NULL`;
  await sql`UPDATE nexusflow.audit SET tenant_id='local' WHERE tenant_id IS NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS records_file_version_idx ON nexusflow.records(tenant_id,(data->>'version_group'),(data->>'version_number')) WHERE kind='files' AND data->>'version_group' IS NOT NULL`;
}
export async function probeDependencies() {
  if (!sql || !redis) throw new Error("DATABASE_URL and REDIS_URL are required");
  await sql`SELECT 1`;
  if (redis.status === "wait") await redis.connect();
  await redis.ping();
}
