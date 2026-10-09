export interface CliArgs { command:string; action:string; positionals:string[]; options:Record<string,string|boolean> }
export function parseArgs(args:string[]):CliArgs {
 const tokens=[...args],command=tokens.shift()||"",action=tokens[0]?.startsWith("-")?"list":tokens.shift()||"list",positionals:string[]=[],options:Record<string,string|boolean>={};
 for(let i=0;i<tokens.length;i++){const token=tokens[i]!;if(!token.startsWith("--")){positionals.push(token);continue;}const [raw,value]=token.slice(2).split("=",2);if(value!==undefined){options[raw!]=value;continue;}if(tokens[i+1]&&!tokens[i+1]!.startsWith("--")){options[raw!]=tokens[++i]!;}else options[raw!]=true;}
 return {command,action,positionals,options};
}
export function option(args:CliArgs,key:string,fallback=""){const v=args.options[key];return typeof v==="string"?v:fallback;}
