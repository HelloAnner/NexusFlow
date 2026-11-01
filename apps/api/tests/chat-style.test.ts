import { expect,test } from 'bun:test';
test('compact chat composer replaces the textarea focus ring without removing keyboard feedback',async()=>{
 const css=await Bun.file(new URL('../../web/app/chat/chat.css',import.meta.url)).text();
 const field=css.match(/\.ai-composer textarea\{([^}]+)\}/)?.[1]||'';
 const focused=css.match(/\.ai-composer textarea:focus,\.ai-composer textarea:focus-visible\{([^}]+)\}/)?.[1]||'';
 expect(field).toContain('resize:none');expect(field).toContain('max-height:160px');
 expect(focused).toContain('outline:none');
 expect(css).toMatch(/\.ai-composer:focus-within\{border-color:/);
 expect(css).toMatch(/\.ai-workspace :focus-visible\{outline:2px/);
 const page=await Bun.file(new URL('../../web/app/chat/page.tsx',import.meta.url)).text();
 expect(page).toContain('rows={1}');expect(page).toContain('field.scrollHeight');
 expect(page).toContain('!e.shiftKey&&!e.nativeEvent.isComposing');
});
