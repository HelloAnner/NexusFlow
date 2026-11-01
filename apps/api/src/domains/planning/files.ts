import JSZip from 'jszip';
import type { Readable } from 'node:stream';
import { XMLParser,XMLValidator } from 'fast-xml-parser';
import { getRecord } from '../../records.ts';
import type { User } from '../../permissions.ts';
import { portalAllows } from '../../auth.ts';
import { objectRequest } from '../../storage.ts';
const MAX_TEXT=20000,MAX_BYTES=25*1024*1024;
function entryText(entry:JSZip.JSZipObject):Promise<string>{return new Promise((resolve,reject)=>{const chunks:Uint8Array[]=[];let total=0;const stream=entry.nodeStream('nodebuffer') as Readable;stream.on('data',(chunk:Buffer)=>{total+=chunk.byteLength;if(total>8*1024*1024){stream.destroy(Error('Office XML exceeds safe size'));return;}chunks.push(chunk);}).on('error',reject).on('end',()=>{const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}resolve(new TextDecoder('utf-8',{fatal:true}).decode(bytes));});stream.resume();});}
function xml(value:string){if(/<!DOCTYPE|<!ENTITY/i.test(value)||XMLValidator.validate(value)!==true)throw Error('invalid Office XML');return new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,processEntities:false}).parse(value);}
function values(value:any,key:string):any[]{if(!value||typeof value!=='object')return [];if(Array.isArray(value))return value.flatMap(v=>values(v,key));return Object.entries(value).flatMap(([k,v])=>k===key?(Array.isArray(v)?v:[v]):values(v,key));}
function text(value:any):string{if(value==null)return '';if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(text).join('');if(typeof value==='object')return Object.entries(value).filter(([k])=>!k.startsWith('@_')).map(([,v])=>text(v)).join('');return '';}
export async function extractText(name:string,bytes:Uint8Array){
 const extension=name.split('.').pop()?.toLowerCase();let output='';
 if(['txt','md','markdown','csv','json','log'].includes(extension||''))output=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 else if(['docx','xlsx','pptx'].includes(extension||'')){
  const zip=await JSZip.loadAsync(bytes);if(Object.keys(zip.files).length>5000)throw Error('Office has too many entries');
  if(extension==='xlsx'){
   const shared=zip.file('xl/sharedStrings.xml'),strings=shared?values(xml(await entryText(shared)),'si').map(text):[];
   const sheets=Object.keys(zip.files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
   if(!sheets.length)throw Error('invalid spreadsheet');
   for(const sheet of sheets.slice(0,50)){output+=`\n${sheet}\n`;const rows=values(xml(await entryText(zip.files[sheet]!)),'row');for(const row of rows.slice(0,1000)){output+=values(row,'c').slice(0,100).map(c=>c['@_t']==='s'?strings[Number(c.v)]||'':c['@_t']==='inlineStr'?text(c.is):text(c.v)).join('\t')+'\n';if(output.length>=MAX_TEXT)break;}if(output.length>=MAX_TEXT)break;}
  }else{
   const paths=Object.keys(zip.files).filter(p=>extension==='docx'?p==='word/document.xml':/^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));if(!paths.length)throw Error('invalid Office document');
   for(const path of paths.slice(0,200)){const root=xml(await entryText(zip.files[path]!));output+=values(root,'p').map(p=>values(p,'t').map(text).join('')).join('\n')+'\n';if(output.length>=MAX_TEXT)break;}
  }
 }else if(extension==='pdf'){
  // 同 DocuMind：内嵌 worker，编译单二进制不依赖外部 worker 文件。
  const [{getDocument},{WorkerMessageHandler}]=await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'),import('pdfjs-dist/legacy/build/pdf.worker.mjs')]);
  (globalThis as any).pdfjsWorker??={WorkerMessageHandler};const task=getDocument({data:bytes.slice(),useSystemFonts:false});
  try{const pdf=await task.promise;for(let page=1;page<=Math.min(pdf.numPages,200);page++){const content=await (await pdf.getPage(page)).getTextContent();output+=`\n第 ${page} 页\n`+content.items.map((item:any)=>item.str||'').join(' ')+'\n';if(output.length>=MAX_TEXT)break;}}finally{await task.destroy();}
 }else return {text:'该附件仅提供预览或下载，不支持文本分析。',truncated:false,extractable:false};
 return {text:output.slice(0,MAX_TEXT),truncated:output.length>MAX_TEXT,extractable:true};
}
export async function prepareFiles(user:User,ids:string[],includeText=true){
 if(ids.length>20)throw Error('invalid file count');const files:Record<string,any>[]=[],parts:string[]=[];
 for(const id of [...new Set(ids)]){
  if(!portalAllows(user,`/api/files/${encodeURIComponent(id)}`,'GET'))throw Error('forbidden: file permission required');
  const file=await getRecord(user,'files',id);if(!file||!['active','archived'].includes(file.status))throw Error('file not found');
  files.push({id:file.id,name:file.name,content_type:file.content_type,size_bytes:file.size_bytes});
  if(includeText){if(Number(file.size_bytes)>MAX_BYTES)throw Error('file exceeds chat processing size');const response=await objectRequest('GET',String(file.object_key)),bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>MAX_BYTES)throw Error('file exceeds chat processing size');const extracted=await extractText(String(file.name),bytes);parts.push(JSON.stringify({file_id:id,name:file.name,...extracted}));}
 }
 const context=parts.join('\n');if(context.length>60000)throw Error('附件总文本超过 60000 字，请减少文件或分批处理');return {files,context};
}
