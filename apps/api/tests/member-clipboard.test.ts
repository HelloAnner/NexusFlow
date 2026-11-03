import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { copyToClipboard } from "../../web/lib/clipboard";

test("HTTP invitation copy returns the real result and registration stays outside the login guard", async () => {
 const saved=Object.fromEntries(["document","navigator","window"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try {
  for(const allowed of [true,false]){
   let removed=false;
   const area={value:"",style:{},setAttribute(){},focus(){},select(){}};
   Object.defineProperty(globalThis,"navigator",{configurable:true,value:{}});
   Object.defineProperty(globalThis,"window",{configurable:true,value:{isSecureContext:false}});
   Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>area,body:{appendChild(){},removeChild(){removed=true;}},execCommand:()=>allowed}});
   expect(await copyToClipboard("http://test/nexusflow/register#token=test-only")).toBe(allowed);expect(removed).toBe(true);
  }
  const shell=readFileSync(new URL("../../web/components/shell.tsx",import.meta.url),"utf8");
  expect(shell).toContain('if (["/login", "/register"].includes(pathname))');
  const page=readFileSync(new URL("../../web/app/register/page.tsx",import.meta.url),"utf8");
  expect(page).toContain('"/auth/invitations/validate"');expect(page).toContain('minLength={12}');
 } finally {for(const [key,value] of Object.entries(saved)){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
