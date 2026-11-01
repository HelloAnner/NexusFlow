import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import { config } from '../../config.ts';
const key=()=>createHash('sha256').update(config.jwtSecret).digest();
export function seal(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');}
export function unseal(value:string){const bytes=Buffer.from(value,'base64');if(bytes.length<29)throw Error('invalid secure result');const cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));}
