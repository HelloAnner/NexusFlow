export const env = (name: string, fallback = "") => process.env[name] || fallback;
export const config = {
  host: env("APP_HOST", "0.0.0.0"),
  port: Number(env("APP_PORT", "8089")),
  basePath: env("NEXUSFLOW_BASE_PATH", "/nexusflow").replace(/\/+$/, ""),
  loginMode: env("AUTH_LOGIN_MODE", env("PORTAL_MANAGED", "false") === "true" && env("PORTAL_AUTH_ENABLED", "false") === "true" ? "portal" : "local"),
  portalEnabled: env("PORTAL_AUTH_ENABLED", "false") === "true" || env("AUTH_LOGIN_MODE")==="portal",
  portalUrl: env("PORTAL_BASE_URL", "http://123.57.255.204:6688").replace(/\/+$/, ""),
  portalEndpoint: env("PORTAL_EXCHANGE_ENDPOINT", "/api/auth/exchange-ticket"),
  jwtSecret: env("JWT_SECRET"),
  databaseUrl: env("DATABASE_URL"),
  redisUrl: env("REDIS_URL"),
  redisPrefix: env("REDIS_KEY_PREFIX", "nexusflow:"),
  localTenantId: env("LOCAL_TENANT_ID", "local"),
  adminUsername: env("SUPER_ADMIN_USERNAME", "admin"),
  adminPassword: env("SUPER_ADMIN_PASSWORD"),
  s3Endpoint: env("S3_ENDPOINT"),
  s3Region: env("S3_REGION", "us-east-1"),
  s3Bucket: env("S3_BUCKET", "nexusflow"),
  s3AccessKey: env("S3_ACCESS_KEY_ID", env("S3_ACCESS_KEY")),
  s3SecretKey: env("S3_SECRET_ACCESS_KEY", env("S3_SECRET_KEY")),
  maxUploadBytes: Number(env("UPLOAD_MAX_BYTES", "104857600")),
  secureCookie: env("COOKIE_SECURE", "false") === "true",
};
export function validateConfig() {
  if (!['local','portal'].includes(config.loginMode)) throw new Error("AUTH_LOGIN_MODE must be local or portal");
  if ((config.databaseUrl || env("APP_ENV") === "production") && (!config.jwtSecret || config.jwtSecret.length < 32)) throw new Error("JWT_SECRET must be configured with at least 32 characters");
  if (env("APP_ENV") === "production" && (!config.databaseUrl || !config.redisUrl || !config.s3Endpoint || !config.s3AccessKey || !config.s3SecretKey || config.loginMode==="local"&&!config.adminPassword)) throw new Error("DATABASE_URL, REDIS_URL and S3 credentials are required in production");
  if (config.loginMode === "portal" && !config.portalEnabled) throw new Error("Portal login mode requires PORTAL_AUTH_ENABLED");
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("APP_PORT is invalid");
}
