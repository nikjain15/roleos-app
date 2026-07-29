// E2E for the async cover-letter flow (J10): POST /api/cover must return INSTANTLY
// with a 'drafting' placeholder; the client-driven draft (/api/artifact/[id]/draft)
// must complete — polled via /api/artifact/[id]/status — and land a real, truth-gated
// letter; the studio page must serve it. Cleans up the test user.
import { createClient } from "@supabase/supabase-js";
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL,ANON=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE=process.env.BASE_URL||"https://ro.roleos.fyi"; const ROLE_ID=process.env.ROLE_ID;
if(!ROLE_ID){ console.error("ROLE_ID=<uuid> required"); process.exit(1); }
const admin=createClient(URL,SERVICE,{auth:{persistSession:false}}); const ref=URL.match(/https:\/\/([^.]+)/)[1];
const ok=(b,m)=>(console.log(`${b?"✓":"✗"} ${m}`),b); let uid=null,pass=true;
try {
  const email=`ro.cover+${Date.now()}@roleos.dev`;
  const {data:c}=await admin.auth.admin.createUser({email,email_confirm:true}); uid=c.user.id;
  const {data:link}=await admin.auth.admin.generateLink({type:"magiclink",email});
  const anon=createClient(URL,ANON,{auth:{persistSession:false}});
  const {data:v}=await anon.auth.verifyOtp({token_hash:link.properties.hashed_token,type:"email"});
  const cookie=`sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(v.session)).toString("base64")}`;
  await admin.from("master_profile").upsert({user_id:uid,data:{raw:"**Director, Product | Fidelity (2023-Present)**\n- Lead AI/ML product strategy.\n- Designed a conversational AI chatbot; 42% resolution cut.\n**Co-Founder | CredR (2015-2021)**\n- Co-founded India's largest used two-wheeler marketplace.",profile:{version:1,experience:[]}}});
  const t0=Date.now();
  const res=await fetch(`${BASE}/api/cover`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({roleId:ROLE_ID}),signal:AbortSignal.timeout(30000)});
  const body=await res.json(); const respMs=Date.now()-t0;
  pass=ok(res.ok && body.artifactId && respMs<15000, `POST /api/cover returned INSTANTLY in ${(respMs/1000).toFixed(1)}s (status "${body.status}")`)&&pass;
  pass=ok(body.status==="drafting", "returned a 'drafting' placeholder (no frozen button)")&&pass;
  // client-driven: kick off the actual draft (fire-and-forget; the poll watches it)
  fetch(`${BASE}/api/artifact/${body.artifactId}/draft`,{method:"POST",headers:{Cookie:cookie},signal:AbortSignal.timeout(300000)}).catch(()=>{});
  let final=null; const start=Date.now();
  while(Date.now()-start<300000){
    await new Promise(r=>setTimeout(r,4000));
    const s=await fetch(`${BASE}/api/artifact/${body.artifactId}/status`,{headers:{Cookie:cookie}}).then(r=>r.json()).catch(()=>({}));
    if(s.status && s.status!=="drafting"){ final=s; break; }
  }
  pass=ok(!!final, `draft finished in ${((Date.now()-start)/1000).toFixed(0)}s → status "${final?.status}"`)&&pass;
  pass=ok(final?.hasBody===true && (final?.status==="draft"||final?.status==="needs_your_eyes"), "letter has a real body (truth-gated draft or flagged)")&&pass;
  const {data:art}=await admin.from("artifacts").select("content,provenance").eq("id",body.artifactId).single();
  const letter=art?.content?.body??"";
  pass=ok(letter.length>80 && typeof art?.content?.subject==="string", `content shape ok (subject + ${letter.length}-char body)`)&&pass;
  pass=ok(!!art?.provenance?.truth, "provenance carries the truth verdict")&&pass;
  // J10.2: the draft is SECTIONED (opening/why_them/why_you/closing)
  const secs=art?.content?.sections??[];
  pass=ok(Array.isArray(secs)&&secs.length>=3, `letter is SECTIONED — ${secs.length} sections: ${JSON.stringify(secs.map(s=>s.id))}`)&&pass;
  // per-section tune (truth-gated, scope-enforced): tune the opening, others untouched
  const before=secs.map(s=>s.text);
  const tuneRes=await fetch(`${BASE}/api/artifact/${body.artifactId}/cover-tune`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookie},body:JSON.stringify({sectionId:secs[0]?.id??"opening",instruction:"More direct"}),signal:AbortSignal.timeout(300000)});
  const tune=await tuneRes.json();
  pass=ok(tuneRes.ok&&tune.ok, `section tune ran (note: "${tune.note??""}")`)&&pass;
  const after=(tune.content?.sections??[]).map(s=>s.text);
  pass=ok(after[0]!==before[0], "target section text changed")&&pass;
  pass=ok(before.slice(1).every((t,i)=>after[i+1]===t), "other sections untouched (scope enforced)")&&pass;
  pass=ok(typeof tune.content?.body==="string"&&tune.content.body.includes(after[0]), "flat body recompiled from sections (apply-bundle compatible)")&&pass;
  const page=await fetch(`${BASE}/studio/cover/${body.artifactId}`,{headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)});
  pass=ok(page.ok, `studio page /studio/cover/[id] serves (${page.status})`)&&pass;
} catch(e){ pass=ok(false,`threw: ${e?.message??e}`)&&pass; }
finally{ if(uid) await admin.auth.admin.deleteUser(uid).then(()=>console.log("· cleaned up test user"),()=>{}); }
console.log(pass?"\nCOVER FLOW E2E: PASS":"\nCOVER FLOW E2E: FAIL"); process.exit(pass?0:1);
