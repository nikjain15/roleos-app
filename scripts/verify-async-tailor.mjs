// E2E for async tailoring: POST /api/tailor must return INSTANTLY with a 'drafting'
// placeholder, then the background draft (ctx.waitUntil) must complete — polled via
// /api/artifact/[id]/status until ready. Cleans up the test user.
import { createClient } from "@supabase/supabase-js";
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL,ANON=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE=process.env.BASE_URL||"https://ro.roleos.fyi"; const ROLE_ID=process.env.ROLE_ID;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false}}); const ref=URL.match(/https:\/\/([^.]+)/)[1];
const ok=(b,m)=>(console.log(`${b?"✓":"✗"} ${m}`),b); let uid=null,pass=true;
try {
  const email=`ro.async+${Date.now()}@roleos.dev`;
  const {data:c}=await admin.auth.admin.createUser({email,email_confirm:true}); uid=c.user.id;
  const {data:link}=await admin.auth.admin.generateLink({type:"magiclink",email});
  const anon=createClient(URL,ANON,{auth:{persistSession:false}});
  const {data:v}=await anon.auth.verifyOtp({token_hash:link.properties.hashed_token,type:"email"});
  const cookie=`sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(v.session)).toString("base64")}`;
  await admin.from("master_profile").upsert({user_id:uid,data:{raw:"**Director, Product | Fidelity (2023-Present)**\n- Lead AI/ML product strategy.\n- Designed a conversational AI chatbot; 42% resolution cut.\n**Co-Founder | CredR (2015-2021)**\n- Co-founded India's largest used two-wheeler marketplace.",profile:{version:1,experience:[]}}});
  const t0=Date.now();
  const res=await fetch(`${BASE}/api/tailor`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({roleId:ROLE_ID}),signal:AbortSignal.timeout(30000)});
  const body=await res.json(); const respMs=Date.now()-t0;
  pass=ok(res.ok && body.artifactId && respMs<15000, `POST returned INSTANTLY in ${(respMs/1000).toFixed(1)}s (status "${body.status}")`)&&pass;
  pass=ok(body.status==="drafting", "returned a 'drafting' placeholder (not a 2-min wait)")&&pass;
  // client-driven: kick off the actual draft (fire-and-forget; the poll watches it)
  fetch(`${BASE}/api/artifact/${body.artifactId}/draft`,{method:"POST",headers:{Cookie:cookie},signal:AbortSignal.timeout(300000)}).catch(()=>{});
  // poll until ready
  let final=null; const start=Date.now();
  while(Date.now()-start<300000){
    await new Promise(r=>setTimeout(r,4000));
    const s=await fetch(`${BASE}/api/artifact/${body.artifactId}/status`,{headers:{Cookie:cookie}}).then(r=>r.json()).catch(()=>({}));
    if(s.status && s.status!=="drafting"){ final=s; break; }
  }
  pass=ok(!!final, `background draft finished in ${((Date.now()-start)/1000).toFixed(0)}s → status "${final?.status}"`)&&pass;
  pass=ok(final?.hasBody===true && (final?.status==="draft"||final?.status==="needs_your_eyes"), "artifact has a real body (draft completed via waitUntil)")&&pass;
} catch(e){ pass=ok(false,`threw: ${e?.message??e}`)&&pass; }
finally{ if(uid) await admin.auth.admin.deleteUser(uid).then(()=>console.log("· cleaned up test user"),()=>{}); }
console.log(pass?"\nASYNC TAILOR E2E: PASS":"\nASYNC TAILOR E2E: FAIL"); process.exit(pass?0:1);
