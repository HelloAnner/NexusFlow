export interface CliArgs { command:string; action:string; positionals:string[]; options:Record<string,string|boolean> }
export function parseArgs(args:string[]):CliArgs {
 const tokens=[...args],command=tokens.shift()||"",action=tokens[0]?.startsWith("-")?"list":tokens.shift()||"list",positionals:string[]=[],options:Record<string,string|boolean>={};
 const flags=new Set(["json","help","verbose"]);for(let i=0;i<tokens.length;i++){const token=tokens[i]!;if(!token.startsWith("--")){positionals.push(token);continue;}const rawValue=token.slice(2),equals=rawValue.indexOf("="),raw=equals<0?rawValue:rawValue.slice(0,equals);if(equals>=0){options[raw]=rawValue.slice(equals+1);continue;}if(flags.has(raw)){options[raw]=true;continue;}if(tokens[i+1]&&!tokens[i+1]!.startsWith("--")){options[raw]=tokens[++i]!;}else options[raw]=true;}
 return {command,action,positionals,options};
}
export function option(args:CliArgs,key:string,fallback=""){const v=args.options[key];return typeof v==="string"?v:fallback;}
