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
  await sql`CREATE INDEX IF NOT EXISTS records_kind_tenant_idx ON nexusflow.records(kind,tenant_id)`;
  await sql`CREATE TABLE IF NOT EXISTS nexusflow.users (id text PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL, display_name text NOT NULL, role text NOT NULL DEFAULT 'member', tenant_id text, org_id text, status text NOT NULL DEFAULT 'active', portal_id text UNIQUE, portal_tenant_id text, portal_permissions text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS tenant_id text`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS org_id text`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS portal_tenant_id text`;
  await sql`ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS portal_permissions text[] NOT NULL DEFAULT '{}'`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON nexusflow.users(lower(username))`;
  await sql`CREATE TABLE IF NOT EXISTS nexusflow.audit (id text PRIMARY KEY, actor text, tenant_id text, action text NOT NULL, object_kind text, object_id text, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE nexusflow.audit ADD COLUMN IF NOT EXISTS tenant_id text`;
}
export async function probeDependencies() {
  if (!sql || !redis) throw new Error("DATABASE_URL and REDIS_URL are required");
  await sql`SELECT 1`;
  if (redis.status === "wait") await redis.connect();
  await redis.ping();
}
