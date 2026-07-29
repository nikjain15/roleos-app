// E2E for the async coach flow (J12 latency): POST /api/coach {action:"prep"} must
// return INSTANTLY with a 'prepping' placeholder pipeline; the client-driven run
// (/api/coach/[id]/run) must complete prep — polled via /api/coach/[id]/status —
// then, with a seeded transcript, the async debrief must land. Cleans up the user.
import { createClient } from "@supabase/supabase-js";
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL,ANON=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE=process.env.BASE_URL||"https://ro.roleos.fyi"; const ROLE_ID=process.env.ROLE_ID;
if(!ROLE_ID){ console.error("ROLE_ID=<uuid> required"); process.exit(1); }
const admin=createClient(URL,SERVICE,{auth:{persistSession:false}}); const ref=URL.match(/https:\/\/([^.]+)/)[1];
const ok=(b,m)=>(console.log(`${b?"✓":"✗"} ${m}`),b); let uid=null,pass=true;
const poll=async(cookie,id,done,ms=320000)=>{const t=Date.now();while(Date.now()-t<ms){await new Promise(r=>setTimeout(r,4000));const s=await fetch(`${BASE}/api/coach/${id}/status`,{headers:{Cookie:cookie}}).then(r=>r.json()).catch(()=>({}));if(done(s))return s;}return null;};
try {
  const email=`ro.coach+${Date.now()}@roleos.dev`;
  const {data:c}=await admin.auth.admin.createUser({email,email_confirm:true}); uid=c.user.id;
  const {data:link}=await admin.auth.admin.generateLink({type:"magiclink",email});
  const anon=createClient(URL,ANON,{auth:{persistSession:false}});
  const {data:v}=await anon.auth.verifyOtp({token_hash:link.properties.hashed_token,type:"email"});
  const cookie=`sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(v.session)).toString("base64")}`;
  await admin.from("master_profile").upsert({user_id:uid,data:{raw:"**Director, Product | Fidelity (2023-Present)**\n- Lead AI/ML product strategy.\n- Designed a conversational AI chatbot; 42% resolution cut.\n**Co-Founder | CredR (2015-2021)**\n- Co-founded India's largest used two-wheeler marketplace.",profile:{version:1,experience:[]}}});
  // 1) prep: instant placeholder
  const t0=Date.now();
  const res=await fetch(`${BASE}/api/coach`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({action:"prep",roleId:ROLE_ID}),signal:AbortSignal.timeout(30000)});
  const j=await res.json(); const respMs=Date.now()-t0;
  pass=ok(res.ok && j.pipelineId && respMs<15000, `prep POST returned INSTANTLY in ${(respMs/1000).toFixed(1)}s (status "${j.status}")`)&&pass;
  pass=ok(j.status==="prepping", "returned a 'prepping' placeholder (page no longer blocks)")&&pass;
  // 2) kick the run + poll
  fetch(`${BASE}/api/coach/${j.pipelineId}/run`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({phase:"prep"}),signal:AbortSignal.timeout(300000)}).catch(()=>{});
  let t=Date.now(); const prepDone=await poll(cookie,j.pipelineId,s=>s.status&&s.status!=="prepping");
  pass=ok(prepDone?.status==="ready" && !!prepDone?.prep, `prep finished in ${((Date.now()-t)/1000).toFixed(0)}s with real content (questions/story-map)`)&&pass;
  // 3) seed a short transcript directly (skip mock-turn model spend), then async debrief
  const {data:pipe}=await admin.from("pipeline").select("messages").eq("id",j.pipelineId).single();
  await admin.from("pipeline").update({messages:{...pipe.messages,transcript:[
    {role:"interviewer",text:"Tell me about a time you shipped an AI product under ambiguity."},
    {role:"candidate",text:"At Fidelity I led the conversational AI chatbot — we shipped in two quarters and cut resolution time 42% by grounding answers in verified account data."},
  ]}}).eq("id",j.pipelineId);
  fetch(`${BASE}/api/coach/${j.pipelineId}/run`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({phase:"debrief"}),signal:AbortSignal.timeout(300000)}).catch(()=>{});
  t=Date.now(); const dbDone=await poll(cookie,j.pipelineId,s=>s.debriefStatus==="ready"||s.debriefStatus==="error");
  pass=ok(dbDone?.debriefStatus==="ready" && !!dbDone?.debrief, `debrief finished async in ${((Date.now()-t)/1000).toFixed(0)}s (readiness ${dbDone?.debrief?.readiness ?? "?"} in payload)`)&&pass;
} catch(e){ pass=ok(false,`threw: ${e?.message??e}`)&&pass; }
finally{ if(uid) await admin.auth.admin.deleteUser(uid).then(()=>console.log("· cleaned up test user"),()=>{}); }
console.log(pass?"\nCOACH ASYNC E2E: PASS":"\nCOACH ASYNC E2E: FAIL"); process.exit(pass?0:1);
