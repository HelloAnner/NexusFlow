import { config,validateConfig } from "./config.ts";
import { migrate,probeDependencies } from "./db.ts";
import { seedAdmin } from "./auth.ts";
import app from "./router.ts";
export { dailyLoad,validateRange } from "./load.ts";
export { default as app } from "./router.ts";
export async function withBasePath(req:Request) {
 const url=new URL(req.url);const prefix=config.basePath;
 if(prefix&&(url.pathname===prefix||url.pathname.startsWith(`${prefix}/`))){url.pathname=url.pathname.slice(prefix.length)||"/";req=new Request(url,req);}
 return app.fetch(req);
}
export async function start(){validateConfig();if(config.databaseUrl){if(!config.redisUrl)throw new Error("REDIS_URL required when DATABASE_URL is configured");await migrate();await probeDependencies();await seedAdmin();}Bun.serve({hostname:config.host,port:config.port,fetch:withBasePath});console.info(`NexusFlow listening on ${config.host}:${config.port}`);}
if(import.meta.main)start().catch(e=>{console.error(e);process.exit(1)});
