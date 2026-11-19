const test=require('node:test'),assert=require('node:assert/strict');
const {factory,OFFERS}=require('../api/_advantage');
function harness(calendar){
  const rows=new Map(),jobs=[],emails=[],ownerEmails=[],sessions=new Map();let seq=0,mailFailure=false;
  const k=(c,id)=>c+':'+id;
  const db={
    getById:async(c,id)=>rows.get(k(c,id))||null,
    insert:async(c,d)=>{d={...d,id:d.id||String(++seq)};rows.set(k(c,d.id),d);return d;},
    update:async(c,id,d)=>db.insert(c,{...await db.getById(c,id),...d,id}),
    list:async(c,o={})=>[...rows.entries()].filter(([key])=>key.startsWith(c+':')).map(([,v])=>v).filter(v=>(o.where||[]).every(([f,,x])=>v[f]===x)),
    findOne:async(c,f,v)=>(await db.list(c,{where:[[f,'==',v]]}))[0]||null,
  };
  db.db=()=>({collection:c=>({doc:id=>({c,id})}),runTransaction:async cb=>cb({get:async r=>({exists:rows.has(k(r.c,r.id)),data:()=>rows.get(k(r.c,r.id))}),set:(r,d)=>rows.set(k(r.c,r.id),d)})});
  const stripe={webhookEndpoints:{create:async()=>({id:'we_fake',secret:'fake_webhook_signing_value'})},checkout:{sessions:{create:async(p,options)=>{const id='cs_'+options.idempotencyKey;let s=sessions.get(id);if(!s){s={id,url:'https://checkout.stripe.com/c/pay/fake',status:'open',mode:p.mode,payment_status:'unpaid',amount_total:p.line_items[0].price_data.unit_amount,currency:'usd',metadata:p.metadata,params:p};sessions.set(id,s);}return s;},expire:async id=>{sessions.get(id).status='expired';return sessions.get(id);},retrieve:async id=>{if(!sessions.has(id))throw new Error('Unknown session');return sessions.get(id);}}}};
  const queue={publishJSON:async j=>jobs.push(j)};
  const app=factory({db,stripe,queue,calendar,mail:{emails:{send:async(m,options)=>{if(mailFailure)return {error:{message:'fixture email outage'}};(m.to==='mia@tmitechai.com'?ownerEmails:emails).push({m,options});return {data:{id:'mail_fake'}};}}},env:{JWT_SECRET:'fixture_only_not_a_real_key'}});
  const capture=(consent=false,offer='executive')=>app.capture({email:'owner@example.test',name:'Test Owner',company:'Test Company',offer,consent});
  return {app,db,jobs,emails,ownerEmails,sessions,capture,queue,failMail:value=>{mailFailure=value;},clearLocks:()=>{for(const key of rows.keys())if(key.startsWith('advantage_locks:'))rows.delete(key);}};
}
test('server owns the active price and historical amounts and enforces authority and capability',async()=>{
  const h=harness(),l=await h.capture();assert.equal(h.jobs.filter(j=>j.body.step==='details').length,1);assert.equal(h.jobs[0].body.step,'details');
  await assert.rejects(h.app.checkout({...l,authority:'sponsor',agreed:true,plan_agreed:true}),/authorized/);
  await assert.rejects(h.app.checkout({...l,token:'invalid',authority:'authorized',agreed:true,plan_agreed:true}),/start again/);
  await h.app.checkout({...l,authority:'authorized',agreed:true,plan_agreed:true,amount:1,offer:'workforce'});
  const s=[...h.sessions.values()][0];assert.equal(s.amount_total,750000);assert.equal(s.metadata.offer,'executive');assert.equal(s.params.after_expiration.recovery.enabled,true);
  const config=await h.db.getById('advantage_config','stripe');assert.ok(!config.secret.includes('fake_webhook'));assert.equal(h.app.unseal(config.secret),'fake_webhook_signing_value');
  await h.app.checkout({...l,authority:'authorized',agreed:true,plan_agreed:true});assert.equal(h.sessions.size,1);
  assert.deepEqual(Object.values(OFFERS).map(o=>o.amount),[99700,750000,1500000,2500000]);
});
test('only paid Stripe sessions with matching scope amount and currency settle',async()=>{
  const h=harness(),l=await h.capture(true);await h.app.checkout({...l,authority:'authorized',agreed:true,plan_agreed:true});const s=[...h.sessions.values()][0];
  assert.equal(await h.app.settle(s),false);s.payment_status='paid';s.amount_total=1;await assert.rejects(h.app.settle(s),/mismatch/);s.amount_total=750000;s.currency='eur';await assert.rejects(h.app.settle(s),/mismatch/);s.currency='usd';s.payment_intent='pi_fake';assert.equal(await h.app.settle(s),true);assert.equal((await h.db.getById('advantage_leads',l.id)).status,'paid');
  await h.app.work(l.id,'hour1');assert.equal(h.emails.length,0);await h.app.work(l.id,'paid');await h.app.work(l.id,'paid');assert.equal(h.emails.length,1);assert.match(h.emails[0].m.subject,/confirmed/);
});
test('opt-in controls follow-ups; unsubscribe, suppression, bookings and replies stop them',async()=>{
  for(const stop of ['no_consent','unsubscribe','suppression','booked','calendar','reply']){
    const h=harness(),l=await h.capture(stop!=='no_consent');
    if(stop==='unsubscribe')await h.app.unsubscribe(l.id,h.app.signature(l.id));
    if(stop==='suppression')await h.db.insert('suppression',{email:'owner@example.test'});
    if(stop==='booked')await h.db.insert('applications',{email:'owner@example.test',status:'booked'});
    if(stop==='calendar')await h.db.insert('precall_bookings',{email:'owner@example.test',cancelled:false,booked_at:new Date(Date.now()+1000).toISOString()});
    if(stop==='reply')await h.db.insert('activities',{type:'email',title:'Reply: Question',body:'From owner@example.test',created_at:new Date(Date.now()+1000).toISOString()});
    await h.app.work(l.id,'day1');assert.equal(h.emails.length,0,stop);
  }
  const h=harness(),l=await h.capture(true);assert.equal(h.jobs.filter(j=>['details','hour1','day1','day3'].includes(j.body.step)).length,4);await h.app.work(l.id,'hour1');assert.equal(h.emails.length,1);assert.match(h.emails[0].m.html,/Unsubscribe/);assert.ok(h.emails[0].m.headers['List-Unsubscribe']);
  await assert.rejects(h.app.unsubscribe(l.id,'bad'),/Invalid/);
});
test('payment reconciliation stops a queued nudge even before webhook delivery',async()=>{
  const h=harness(),l=await h.capture(true);await h.app.checkout({...l,authority:'authorized',agreed:true,plan_agreed:true});const s=[...h.sessions.values()][0];s.payment_status='paid';await h.app.work(l.id,'day1');assert.equal(h.emails.length,0);assert.equal((await h.db.getById('advantage_leads',l.id)).status,'paid');
});
test('refund/dispute events stop this funnel without affecting unrelated purchases',async()=>{
  const h=harness(),l=await h.capture(true);await h.db.update('advantage_leads',l.id,{payment_intent:'pi_1',status:'paid'});
  await h.app.event({type:'charge.refunded',data:{object:{payment_intent:'pi_1'}}});assert.equal((await h.db.getById('advantage_leads',l.id)).status,'refunded');
  await h.app.event({type:'checkout.session.completed',data:{object:{metadata:{product:'build_deposit'},payment_status:'paid'}}});
  await h.app.work(l.id,'day3');assert.equal(h.emails.length,0);
});

test('queue outage preserves capture and the outbox can deliver it later',async()=>{
  const h=harness();h.queue.publishJSON=async()=>{throw new Error('fixture outage');};
  const l=await h.capture();assert.ok(l.token);assert.equal((await h.db.list('advantage_jobs')).filter(j=>j.step==='details').length,1);
  await h.app.work('__outbox__','drain');assert.equal(h.emails.filter(e=>e.m.to==='owner@example.test').length,1);assert.equal((await h.db.list('advantage_jobs')).find(j=>j.step==='details').done,true);
});
test('a purchase under the same email prevents duplicate abandoned follow-ups',async()=>{
  const h=harness(),first=await h.capture(true),second=await h.capture(true);await h.db.update('advantage_leads',second.id,{status:'paid'});await h.app.work(first.id,'day1');assert.equal(h.emails.length,0);
});

test('executive checkout charges 7500 and replaces an unpaid old-price session',async()=>{
 const h=harness(),l=await h.capture(true,'executive');
 const old={id:'cs_legacy',status:'open',mode:'payment',payment_status:'unpaid',amount_total:500000,currency:'usd',url:'https://checkout.stripe.com/c/pay/old',metadata:{funnel:'ai_advantage',lead_id:l.id,offer:'executive'}};
 h.sessions.set(old.id,old);await h.db.update('advantage_leads',l.id,{session:old.id,checkout_at:'2026-11-14T22:00:00Z'});
 await h.app.checkout({...l,authority:'authorized',agreed:true,plan_agreed:true});
 assert.equal(old.status,'expired');const current=[...h.sessions.values()].find(s=>s.id!==old.id);
 assert.equal(current.amount_total,750000);assert.equal((await h.db.getById('advantage_leads',l.id)).checkout_amount,750000);
 current.payment_status='paid';assert.equal(await h.app.settle(current),true);
});
test('completed historical executive payments reconcile at their recorded price',async()=>{
 const h=harness(),l=await h.capture(true,'executive');
 const paid={id:'cs_historical',payment_status:'paid',amount_total:750000,currency:'usd',metadata:{funnel:'ai_advantage',lead_id:l.id,offer:'executive'}};
 await h.db.update('advantage_leads',l.id,{session:paid.id,checkout_at:'2026-11-14T22:00:00Z'});
 assert.equal(await h.app.settle(paid),true);
});


test('new requests notify Mia via Resend and callback retry is idempotent',async()=>{const h=harness();const l=await h.app.capture({name:'Owner',company:'Company',email:'owner@example.test',offer:'executive',callback:true,message:'Help with reporting'});assert.equal(l.notified,true);assert.equal(h.ownerEmails.length,1);assert.equal(h.ownerEmails[0].m.to,'mia@tmitechai.com');assert.equal(h.ownerEmails[0].m.replyTo,'owner@example.test');assert.match(h.ownerEmails[0].m.text,/reporting/);assert.equal(h.jobs.filter(j=>j.body.step==='details').length,0);await h.app.callback(l);await h.app.callback(l);assert.equal(h.ownerEmails.length,1);assert.equal((await h.db.getById('advantage_leads',l.id)).followups_paused,true);});
test('retired packages cannot create new leads and payment needs written agreement',async()=>{const h=harness();await assert.rejects(h.capture(false,'workforce'),e=>e.status===400);const l=await h.capture();await assert.rejects(h.app.checkout({...l,authority:'authorized',agreed:true}),/written plan/);assert.equal(h.sessions.size,0);});
test('recorded historical 5000 payments still reconcile without repricing',async()=>{const h=harness(),l=await h.capture();const paid={id:'cs_old_5000',payment_status:'paid',amount_total:500000,currency:'usd',metadata:{funnel:'ai_advantage',lead_id:l.id,offer:'executive'}};await h.db.update('advantage_leads',l.id,{checkout_amount:500000,session:paid.id});assert.equal(await h.app.settle(paid),true);});


test('roadmap checkout charges 997 and does not require an implementation agreement',async()=>{
 const h=harness(),l=await h.capture(false,'roadmap');await h.app.checkout({...l,authority:'authorized',agreed:true,amount:1,offer:'executive'});const s=[...h.sessions.values()][0];assert.equal(s.amount_total,99700);assert.equal(s.metadata.offer,'roadmap');assert.match(s.params.success_url,/opportunity-intake.html/);assert.match(s.params.cancel_url,/opportunity.html/);assert.equal(s.params.mode,'payment');await h.app.checkout({...l,authority:'authorized',agreed:true});assert.equal(h.sessions.size,1);await assert.rejects(h.app.opportunityIntake({...l,action:'opportunity_intake_get'}),e=>e.status===403);
});
async function roadmapPaid(h){const l=await h.capture(false,'roadmap');await h.app.checkout({...l,authority:'authorized',agreed:true});const s=[...h.sessions.values()][0];Object.assign(s,{status:'complete',payment_status:'paid',customer_email:'owner@example.test',payment_intent:'pi_roadmap'});await h.app.settle(s);return {l,s};}
test('roadmap purchase requires the recorded complete session, buyer, amount and currency',async()=>{
 const h=harness(),l=await h.capture(false,'roadmap');await h.app.checkout({...l,authority:'authorized',agreed:true});const s=[...h.sessions.values()][0];Object.assign(s,{status:'complete',payment_status:'paid',customer_email:'owner@example.test',payment_intent:'pi_roadmap'});for(const override of [{id:'cs_other'},{status:'open'},{customer_email:'another@example.test'},{amount_total:750000},{currency:'eur'},{payment_intent:null}])await assert.rejects(h.app.settle({...s,...override}),/mismatch/);assert.equal((await h.db.getById('advantage_leads',l.id)).status,'checkout');
});
test('paid roadmap intake saves drafts, submits once and notifies Mia with the answers',async()=>{
 const h=harness(),{l}=await roadmapPaid(h);await h.app.work(l.id,'paid');const receipt=h.emails.at(-1).m;assert.match(receipt.html,/Open booking & optional preparation/);assert.match(receipt.html,/Book my 60-minute roadmap call/);assert.doesNotMatch(receipt.html,/guaranteed 5|3 business days/);
 await assert.rejects(h.app.opportunityIntake({...l,token:'wrong',action:'opportunity_intake_get'}),e=>e.status===403);
 await h.app.opportunityIntake({...l,action:'opportunity_intake_save',step:1,intake:{role:'Operations manager'}});assert.equal((await h.app.opportunityIntake({...l,action:'opportunity_intake_get'})).step,1);
 await assert.rejects(h.app.opportunityIntake({...l,action:'opportunity_intake_save',submit:true,intake:{}}),e=>e.status===400);
 const intake={role:'Operations manager',workday:'Coordinate the office and chase project updates.',repeat_tasks:'Status updates, meeting notes, client replies.',tools:'Approved email and project tracker.',desired_result:'Less time chasing updates.',private_secret:'must not persist'};
 const completed=await h.app.opportunityIntake({...l,action:'opportunity_intake_save',submit:true,intake});assert.equal(completed.submitted,true);assert.equal(completed.intake.private_secret,undefined);assert.equal(h.ownerEmails.filter(e=>e.m.subject==='TMI roadmap intake submitted').length,1);assert.match(h.ownerEmails.at(-1).m.text,/Less time chasing updates/);
 await h.app.opportunityIntake({...l,action:'opportunity_intake_save',submit:true,intake:{role:'Changed after submission'}});assert.equal(h.ownerEmails.filter(e=>e.m.subject==='TMI roadmap intake submitted').length,1);assert.equal((await h.app.opportunityIntake({...l,action:'opportunity_intake_get'})).intake.role,'Operations manager');
 const link=h.app.opportunityLink(await h.db.getById('advantage_leads',l.id)),credential=decodeURIComponent(new URL(link).hash.slice('#request='.length)),emailToken=credential.slice(credential.indexOf('.')+1);assert.equal((await h.app.opportunityIntake({id:l.id,token:emailToken,action:'opportunity_intake_get'})).submitted,true);const other=await h.capture(false,'roadmap');await assert.rejects(h.app.opportunityIntake({id:other.id,token:emailToken,action:'opportunity_intake_get'}),e=>e.status===403);
 await h.db.update('advantage_leads',l.id,{status:'refunded'});await assert.rejects(h.app.opportunityIntake({...l,action:'opportunity_intake_get'}),e=>e.status===403);
});

test('a Stripe-recovered roadmap session reconciles through its original checkout',async()=>{const h=harness(),l=await h.capture(false,'roadmap');await h.app.checkout({...l,authority:'authorized',agreed:true});const original=[...h.sessions.values()][0];const recovered={...original,id:'cs_recovered',recovered_from:original.id,status:'complete',payment_status:'paid',customer_email:'owner@example.test',payment_intent:'pi_recovered'};assert.equal(await h.app.settle(recovered),true);assert.equal((await h.db.getById('advantage_leads',l.id)).session,'cs_recovered');});

test('roadmap email access rejects expired and wrong-purpose signed tokens',async()=>{const h=harness(),{l}=await roadmapPaid(h),jwt=require('jsonwebtoken');for(const payload of [{sub:l.id,kind:'funnel_resume'},{sub:l.id,kind:'opportunity_intake',exp:1}]){const token=jwt.sign(payload,'fixture_only_not_a_real_key');await assert.rejects(h.app.opportunityIntake({id:l.id,token,action:'opportunity_intake_get'}),e=>e.status===403);}});

test('private intake rate limit supports normal step-to-step progress and still throttles duplicates',async()=>{const h=harness();await h.app.rate('intake-fixture',1);await assert.rejects(h.app.rate('intake-fixture',1),e=>e.status===429);await h.app.rate('checkout-fixture');await assert.rejects(h.app.rate('checkout-fixture'),e=>e.status===429);});


test('roadmap checkout reminder consent is optional and can be withdrawn on retry',async()=>{
 const h=harness(),l=await h.capture(false,'roadmap');await h.app.checkout({...l,authority:'authorized',agreed:true,reminder_consent:false});assert.equal(h.jobs.filter(j=>['hour1','day1','day3','day7'].includes(j.body.step)).length,0);
 await h.app.checkout({...l,authority:'authorized',agreed:true,reminder_consent:true});assert.deepEqual(h.jobs.filter(j=>['hour1','day1','day3','day7'].includes(j.body.step)).map(j=>j.body.step),['hour1','day1','day3']);
 await h.app.checkout({...l,authority:'authorized',agreed:true,reminder_consent:false});await h.db.update('advantage_leads',l.id,{checkout_at:new Date(Date.now()-3600000).toISOString()});await h.app.work(l.id,'hour1');assert.equal(h.emails.length,0);
});
test('roadmap reminders have signed saved-checkout links, truthful copy and duplicate protection',async()=>{
 const h=harness(),l=await h.capture(true,'roadmap');await h.app.checkout({...l,authority:'authorized',agreed:true,reminder_consent:true});for(const [step,delay] of [['hour1',3600],['day1',86400],['day3',259200]]){await h.db.update('advantage_leads',l.id,{checkout_at:new Date(Date.now()-delay*1000).toISOString()});await h.app.work(l.id,step);await h.app.work(l.id,step);}assert.equal(h.emails.length,3);for(const {m} of h.emails){assert.match(m.html,/opportunity.html#resume=/);assert.match(m.html,/997/);assert.doesNotMatch(m.html,/3 business days|5 hours|free fit/i);assert.ok(m.headers['List-Unsubscribe']);const url=m.html.match(/href="([^"]*#resume=[^"]+)"/)[1];const token=decodeURIComponent(new URL(url).hash.slice('#resume='.length));assert.equal(h.app.sales.validTicket(token,l.id),true);}assert.match(h.emails[2].m.subject,/last/i);
});
test('roadmap reminders stop after verified payment including a delayed webhook',async()=>{
 const h=harness(),l=await h.capture(true,'roadmap');await h.app.checkout({...l,authority:'authorized',agreed:true,reminder_consent:true});await h.db.update('advantage_leads',l.id,{checkout_at:new Date(Date.now()-86400000).toISOString()});const s=[...h.sessions.values()][0];Object.assign(s,{status:'complete',payment_status:'paid',customer_email:'owner@example.test',payment_intent:'pi_paid'});await h.app.work(l.id,'day1');assert.equal(h.emails.length,0);assert.equal((await h.db.getById('advantage_leads',l.id)).status,'paid');
});
test('paid intake reminders stop for submitted, paused, replied and suppressed buyers',async()=>{
 for(const reason of ['paused','human','suppression']){const h=harness(),{l}=await roadmapPaid(h);await h.db.update('advantage_leads',l.id,{paid_at:new Date(Date.now()-86400000).toISOString(),...(reason==='submitted'?{opportunity_submitted_at:new Date().toISOString()}:reason==='paused'?{followups_paused:true}:reason==='human'?{human_active:true}:{})});if(reason==='suppression')await h.db.insert('suppression',{email:'owner@example.test'});await h.app.work(l.id,'onboarding');assert.equal(h.emails.length,0,reason);}
});
test('paid intake reminders are limited, link to the saved intake and can be unsubscribed without losing access',async()=>{
 const h=harness(),{l}=await roadmapPaid(h);assert.deepEqual(h.jobs.filter(j=>j.body.step.startsWith('onboarding')).map(j=>j.body.step),['onboarding','onboarding3','onboarding7']);for(const [step,delay] of [['onboarding',86400],['onboarding3',259200],['onboarding7',604800]]){await h.db.update('advantage_leads',l.id,{paid_at:new Date(Date.now()-delay*1000).toISOString()});await h.app.work(l.id,step);}assert.equal(h.emails.length,3);assert.match(h.emails[2].m.subject,/last/i);for(const {m} of h.emails){assert.match(m.html,/cal.com\/miaeliana\/ai-opportunity-roadmap/);assert.ok(m.headers['List-Unsubscribe']);}await h.app.unsubscribe(l.id,h.app.signature(l.id));assert.equal((await h.db.getById('advantage_leads',l.id)).status,'paid');assert.equal((await h.app.opportunityIntake({...l,action:'opportunity_intake_get'})).ok,true);
});
test('late outbox catchup does not send stale reminders in a burst',async()=>{const h=harness(),{l}=await roadmapPaid(h);await h.db.update('advantage_leads',l.id,{paid_at:new Date(Date.now()-10*86400000).toISOString()});for(const step of ['onboarding','onboarding3','onboarding7'])await h.app.work(l.id,step);assert.equal(h.emails.length,0);});
test('refunds cannot be resurrected by replayed purchase or queued follow-up',async()=>{const h=harness(),{l,s}=await roadmapPaid(h);await h.app.event({type:'charge.refunded',data:{object:{payment_intent:'pi_roadmap'}}});assert.equal(await h.app.settle(s),false);await h.app.work(l.id,'paid');assert.equal((await h.db.getById('advantage_leads',l.id)).status,'refunded');assert.equal(h.emails.length,0);});
test('a failed intake reminder remains retryable and is recorded only once after provider acceptance',async()=>{const h=harness(),{l}=await roadmapPaid(h);await h.db.update('advantage_leads',l.id,{paid_at:new Date(Date.now()-86400000).toISOString()});h.failMail(true);await assert.rejects(h.app.work(l.id,'onboarding'),/delivery failed/);h.failMail(false);h.clearLocks();await h.app.work(l.id,'onboarding');await h.app.work(l.id,'onboarding');assert.equal(h.emails.length,1);});
test('roadmap live-readiness probe checks 997 USD and closes its uncharged session without messaging anyone',async()=>{const h=harness();await h.app.verifyRoadmapCheckout();const s=[...h.sessions.values()][0];assert.equal(s.amount_total,99700);assert.equal(s.mode,'payment');assert.equal(s.status,'expired');assert.equal(s.metadata.funnel,'ai_advantage_setup');assert.equal(h.emails.length+h.ownerEmails.length,0);assert.ok((await h.db.getById('advantage_config','health')).roadmap_checkout_verified_at);await h.app.verifyRoadmapCheckout();assert.equal(h.sessions.size,1);});

test('booking link is paid-only and booking never completes the intake',async()=>{
 const h=harness({lookup:async()=>({available:true,booking:{status:'accepted',start:'2026-12-01T12:00:00Z'}})}),l=await h.capture(false,'roadmap');
 await assert.rejects(h.app.opportunityIntake({...l,action:'opportunity_intake_get'}),e=>e.status===403);
 const paid=await roadmapPaid(h),d=await h.app.opportunityIntake({...paid.l,action:'opportunity_intake_get'});
 assert.equal(d.booking_url,'https://cal.com/miaeliana/ai-opportunity-roadmap');assert.equal(d.booking.status,'accepted');assert.equal(d.submitted,false);
 assert.equal((await h.db.getById('advantage_leads',paid.l.id)).onboarding_at,undefined);
});
test('paid reminders distinguish booked, brief submitted, both done, and calendar outage',async()=>{
 for(const [booked,submitted,available] of [[true,false,true],[false,true,true],[true,true,true],[false,true,false]]){
 const h=harness({lookup:async()=>({available,booking:booked?{status:'accepted'}:null})}),{l}=await roadmapPaid(h);
 await h.db.update('advantage_leads',l.id,{paid_at:new Date(Date.now()-86400000).toISOString(),...(submitted?{opportunity_submitted_at:new Date().toISOString(),onboarding_at:new Date().toISOString()}:{})});
 await h.app.work(l.id,'onboarding');if(booked){assert.equal(h.emails.length,0);continue;}
 const html=h.emails.at(-1).m.html;assert.equal(html.includes('Book my 60-minute roadmap call'),!booked);assert.equal(html.includes('Continue my saved intake'),false);if(!available)assert.match(html,/no need to book again/);
 }
});


test('CoS purchase hands off to private intake, gated review,30-day owner reminder and refund revocation',async()=>{const h=harness(),lead=await h.capture();await h.app.checkout({...lead,authority:'authorized',agreed:true,plan_agreed:true});const s=[...h.sessions.values()][0];assert.match(s.params.success_url,/ai-chief-of-staff\/install.html/);Object.assign(s,{status:'complete',payment_status:'paid',payment_intent:'pi_cos_fixture',customer_email:'owner@example.test'});await h.app.settle(s);const service=require('../api/_cos-install').create({app:h.app,env:{JWT_SECRET:'fixture_only_not_a_real_key'},adminCheck:r=>r.admin===true});const access=await service.exchange({session_id:s.id});const answers={name:'Test Owner',company:'Test Company',plan:'Team',testSetOk:'Yes',quietHours:'21:00 to06:00',weekends:'No',jobs:[{task:'Reply to email',freq:'Daily',mins:'15 min'}],emailApps:['Gmail'],accounts:'owner@example.test, work'};await service.client({action:'save',token:access.token,revision:0,answers,submit:true});await assert.rejects(service.operator({admin:true},{action:'review',id:lead.id,revision:0,review:{status:'Live'}}),e=>e.status===409);const model=require('../api/_cos-plan'),plan=model.buildPlan(answers),checks=Object.fromEntries(plan.flags.filter(f=>f.hi).map(f=>['flag:'+f.t,true]));const review={status:'Live',checks,gate:{urgent:100,falseUrgent:0,unapproved:0,duplicates:0,onTimeDays:5,conflicts:10,promises:5,voice:5},verification:Object.fromEntries(model.VERIFY.map(([k])=>[k,true])),evidence:'Fixture: dated source checks and five live test days were recorded.'};await service.operator({admin:true},{action:'review',id:lead.id,revision:0,review});assert.equal(h.jobs.filter(j=>j.body.step==='cos_checkin').length,1);const row=await h.db.getById('advantage_leads',lead.id);await h.db.update('advantage_leads',lead.id,{cos_review:{...row.cos_review,goLiveAt:Date.now()-31*86400000}});await h.app.work(lead.id,'cos_checkin');h.clearLocks();await h.app.work(lead.id,'cos_checkin');assert.equal(h.ownerEmails.filter(e=>e.m.subject==='AI Chief of Staff:30-day check-in due').length,1);await h.app.event({type:'charge.refunded',data:{object:{payment_intent:'pi_cos_fixture'}}});await assert.rejects(service.client({action:'get',token:access.token}),e=>e.status===403);});
