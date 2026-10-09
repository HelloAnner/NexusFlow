import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../src/db.ts",import.meta.url),"utf8");
test("upgrade migrations add legacy columns and keep schema statements rerunnable",()=>{
 expect(source).toContain("ALTER TABLE nexusflow.users ADD COLUMN IF NOT EXISTS updated_at");
 expect(source).toContain("ALTER TABLE nexusflow.records ADD COLUMN IF NOT EXISTS updated_at");
 expect(source).toContain("CREATE UNIQUE INDEX IF NOT EXISTS users_portal_identity_idx");
 expect(source).toContain("CREATE UNIQUE INDEX IF NOT EXISTS records_file_version_idx");
 expect(source).not.toMatch(/ALTER TABLE[^`]* ADD COLUMN (?!IF NOT EXISTS)/);
 expect(source).not.toMatch(/CREATE (?:UNIQUE )?INDEX (?!IF NOT EXISTS)/);
});
