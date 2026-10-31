import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRealWorkflowGraph } from '../../lib/experiment-runner/real-workflow-graph';
import { m4CanonicalJson,m4Hash } from '../../lib/experiment-runner/m4-request';
import { realReportCarrier } from '../../lib/experiment-runner/real-report-carrier';
import { createHash } from 'node:crypto';
const cases=['playful_kid','enthusiast_parent','professional_creator','judge'] as const;
const destination=process.argv[2];
if(!destination) throw Error('Usage: node --import tsx tests/helpers/export-real-report-graph-contract.ts <output-json>');
const rows=[];
for(const name of cases){
 const graph=await createRealWorkflowGraph({role:name==='judge'?'judge':'tester',taskId:null,persona:name==='judge'?null:name});
 const model=graph.nodes.find(n=>n.id==='real_report_llm')!.data.model as {name:string;completion_params:Record<string,unknown>};
 const p=model.completion_params;
 const request={model:model.name,input:[{type:'message',role:'system',content:'System'},{type:'message',role:'user',content:'Judge fixture'}],max_output_tokens:p.max_tokens,reasoning:{effort:p.reasoning_effort,mode:'standard'},service_tier:'default',text:{format:{type:'json_schema',name:'fixture',strict:true,schema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false}}},store:false,truncation:'disabled',include:['reasoning.encrypted_content']};
 const tokenPolicy={version:'m4_context_policy_v2',hash:'a'.repeat(64),maxInputTokens:128000,warningInputTokens:32000};
 const textRequestJson=m4CanonicalJson({...request,bookletPolicy:{contractVersion:'booklet_carrier_v2',requestDigest:m4Hash(m4CanonicalJson(request)),tokenPolicy}});
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452','hex'),Buffer.from('0000040000000400080200000000000000','hex')]);
 const {carrier,carrierJson}=realReportCarrier({textRequestJson,deadlineAtMs:9007199254740991,images:[{bytes:png,manifest:{assetId:'00000000-0000-4000-8000-000000000001',versionId:'00000000-0000-4000-8000-000000000002',sha256:createHash('sha256').update(png).digest('hex'),byteLength:png.length,mimeType:'image/png',width:1024,height:1024}}]});
 const code=graph.nodes.find(n=>n.id==='real_decode')!.data.code;
 const child=spawnSync('python',['-B','-c',"import json,sys; x=json.load(sys.stdin); scope={}; exec(x['source'],scope); print(json.dumps(scope['main'](**x['args'])))"],{input:JSON.stringify({source:code,args:{authorization_body:JSON.stringify({data:{started:true,mode:'real',role:name==='judge'?'judge':'tester',taskId:null,inputFingerprint:'b'.repeat(64),m4:{report:true,requestJson:carrierJson,requestDigest:carrier.finalRequestDigest,timeoutSeconds:60,deadlineAtMs:carrier.deadlineAtMs}}}),status_code:200}}),encoding:'utf8'});
 if(child.status!==0)throw Error(child.stderr);
 const decoded=JSON.parse(child.stdout);
 const parameters=Object.fromEntries(Object.entries(p).filter(([key])=>key!=='enable_stream'));
 // Resolve using the exact selector text rather than relying on string offsets.
 for(const [key,value]of Object.entries(p)){if(typeof value==='string'){const m=value.match(/^\{\{#real_decode\.([a-z_]+)#\}\}$/);if(m)parameters[key]=decoded[m[1]];}}
 rows.push({case:name,request,parameters});
}
writeFileSync(destination,JSON.stringify(rows));
console.log(JSON.stringify({cases:rows.map(r=>r.case),generated:true}));
