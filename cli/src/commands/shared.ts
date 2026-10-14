import type { CliArgs } from "../args";
export interface CommandRequest { path:string; method:string; body?:unknown; upload?:string; download?:string }
export function csvOption(args:CliArgs,key:string){const value=args.options[key];if(value===undefined)return undefined;if(typeof value!=="string")throw Error(`--${key} requires a CSV value (use --${key}= to clear)`);return value===""?[]:value.split(",").map(x=>x.trim()).filter(Boolean);}
export function parseJson(value:string){try{const result=JSON.parse(value);if(!result||typeof result!=="object"||Array.isArray(result))throw Error();return result;}catch{throw Error("expected a JSON object");}}
