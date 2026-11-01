import type { Model } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import type { StreamFn } from "@earendil-works/pi-agent-core";
const capabilities:Record<string,{name:string;thinking_mode:string;thinking_default:boolean}>={
 "deepseek-v4.1-flash":{name:"DeepSeek V4.1 Flash",thinking_mode:"switchable",thinking_default:false},
 "qwen3.8-max":{name:"Qwen 3.8 Max",thinking_mode:"switchable",thinking_default:false},
 "glm-5.3":{name:"GLM 5.3",thinking_mode:"always_on",thinking_default:true},
};
export function modelCatalog(){
 const defaultId=process.env.NEXUSFLOW_LLM_MODEL||"",configured=Boolean(defaultId&&process.env.NEXUSFLOW_LLM_API_KEY&&process.env.NEXUSFLOW_LLM_BASE_URL);
 const ids=configured?[...new Set([defaultId,...(process.env.NEXUSFLOW_CHAT_MODELS||"").split(",").map(s=>s.trim()).filter(Boolean)])]:[];
 return {configured,default_model_id:configured?defaultId:"",models:ids.map(id=>({id,...(capabilities[id]||{name:id,thinking_mode:"unsupported",thinking_default:false})}))};
}
export function resolveModel(id?:string,thinking?:boolean){
 const catalog=modelCatalog();if(!catalog.configured)throw Error("对话模型未配置，请联系管理员");
 const option=catalog.models.find(m=>m.id===(id||catalog.default_model_id));if(!option)throw Error("invalid model selection");
 if(typeof thinking!=="undefined"&&typeof thinking!=="boolean")throw Error("invalid thinking mode");
 if(option.thinking_mode==="always_on"&&thinking===false||option.thinking_mode==="unsupported"&&thinking===true)throw Error("invalid thinking mode for model");
 const enabled=thinking??option.thinking_default;
 const model:Model<"openai-completions">={id:option.id,name:option.name,api:"openai-completions",provider:"nexusflow",baseUrl:process.env.NEXUSFLOW_LLM_BASE_URL!,reasoning:enabled,compat:{supportsDeveloperRole:false},input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0} as any,contextWindow:128000,maxTokens:8192};
 const streamFn:StreamFn=(_model,context,options)=>streamSimple(model,context,{...options,apiKey:process.env.NEXUSFLOW_LLM_API_KEY!,maxTokens:8192,timeoutMs:90000,samplingParams:{...options?.samplingParams,...(option.thinking_mode==="switchable"?{enable_thinking:enabled}:option.thinking_mode==="always_on"?{enable_thinking:true}:{})}});
 return {model,streamFn,snapshot:{model_id:option.id,model_name:option.name,thinking_enabled:enabled}};
}
