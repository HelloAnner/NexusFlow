import { expect,test } from 'bun:test';
import { newId } from '../../web/lib/utils';
test('HTTP browsers without randomUUID generate secure RFC 4122 UUID v4 IDs',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto')!,original=globalThis.crypto;
 try{
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:original.getRandomValues.bind(original)}});
  const ids=Array.from({length:100},()=>newId());
  expect(ids.every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
  expect(new Set(ids).size).toBe(100);
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});
  expect(()=>newId()).toThrow('安全随机数');
 }finally{Object.defineProperty(globalThis,'crypto',descriptor);}
});
