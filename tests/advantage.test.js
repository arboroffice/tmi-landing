const test=require('node:test'),assert=require('node:assert/strict');
const {factory,OFFERS}=require('../api/_advantage');
function harness(){
  const rows=new Map(),jobs=[],emails=[],sessions=new Map();let seq=0;
  const k=(c,id)=>c+':'+id;
  const db={
    getById:async(c,id)=>rows.get(k(c,id))||null,
    insert:async(c,d)=>{d={...d,id:d.id||String(++seq)};rows.set(k(c,d.id),d);return d;},
    update:async(c,id,d)=>db.insert(c,{...await db.getById(c,id),...d,id}),
    list:async(c,o={})=>[...rows.entries()].filter(([key])=>key.startsWith(c+':')).map(([,v])=>v).filter(v=>(o.where||[]).every(([f,,x])=>v[f]===x)),
    findOne:async(c,f,v)=>(await db.list(c,{where:[[f,'==',v]]}))[0]||null,
  };
  db.db=()=>({collection:c=>({doc:id=>({c,id})}),runTransaction:async cb=>cb({get:async r=>({exists:rows.has(k(r.c,r.id)),data:()=>rows.get(k(r.c,r.id))}),set:(r,d)=>rows.set(k(r.c,r.id),d)})});
  const stripe={webhookEndpoints:{create:async()=>({id:'we_fake',secret:'fake_webhook_signing_value'})},checkout:{sessions:{create:async(p,options)=>{const id='cs_'+options.idempotencyKey;let s=sessions.get(id);if(!s){s={id,url:'https://checkout.stripe.com/c/pay/fake',status:'open',payment_status:'unpaid',amount_total:p.line_items[0].price_data.unit_amount,currency:'usd',metadata:p.metadata,params:p};sessions.set(id,s);}return s;},retrieve:async id=>{if(!sessions.has(id))throw new Error('Unknown session');return sessions.get(id);}}}};
  const app=factory({db,stripe,queue:{publishJSON:async j=>jobs.push(j)},mail:{emails:{send:async(m,options)=>{emails.push({m,options});return {data:{id:'mail_fake'}};}}},env:{JWT_SECRET:'fixture_only_not_a_real_key'}});
  const capture=(consent=false,offer='workforce')=>app.capture({email:'owner@example.test',name:'Test Owner',company:'Test Company',offer,consent});
  return {app,db,jobs,emails,sessions,capture};
}
test('server owns all three amounts and enforces authority and capability',async()=>{
  const h=harness(),l=await h.capture();assert.equal(h.jobs.length,1);assert.equal(h.jobs[0].body.step,'details');
  await assert.rejects(h.app.checkout({...l,authority:'sponsor',agreed:true}),/authorized/);
  await assert.rejects(h.app.checkout({...l,token:'invalid',authority:'authorized',agreed:true}),/start again/);
  await h.app.checkout({...l,authority:'authorized',agreed:true,amount:1,offer:'executive'});
  const s=[...h.sessions.values()][0];assert.equal(s.amount_total,1500000);assert.equal(s.metadata.offer,'workforce');assert.equal(s.params.after_expiration.recovery.enabled,true);
  const config=await h.db.getById('advantage_config','stripe');assert.ok(!config.secret.includes('fake_webhook'));assert.equal(h.app.unseal(config.secret),'fake_webhook_signing_value');
  await h.app.checkout({...l,authority:'authorized',agreed:true});assert.equal(h.sessions.size,1);
  assert.deepEqual(Object.values(OFFERS).map(o=>o.amount),[750000,1500000,2500000]);
});
test('only paid Stripe sessions with matching scope amount and currency settle',async()=>{
  const h=harness(),l=await h.capture(true);await h.app.checkout({...l,authority:'authorized',agreed:true});const s=[...h.sessions.values()][0];
  assert.equal(await h.app.settle(s),false);s.payment_status='paid';s.amount_total=1;await assert.rejects(h.app.settle(s),/mismatch/);s.amount_total=1500000;s.currency='eur';await assert.rejects(h.app.settle(s),/mismatch/);s.currency='usd';s.payment_intent='pi_fake';assert.equal(await h.app.settle(s),true);assert.equal((await h.db.getById('advantage_leads',l.id)).status,'paid');
  await h.app.work(l.id,'hour1');assert.equal(h.emails.length,0);await h.app.work(l.id,'paid');await h.app.work(l.id,'paid');assert.equal(h.emails.length,1);assert.match(h.emails[0].m.subject,/confirmed/);
});
test('opt-in controls follow-ups; unsubscribe, suppression, bookings and replies stop them',async()=>{
  for(const stop of ['no_consent','unsubscribe','suppression','booked','reply']){
    const h=harness(),l=await h.capture(stop!=='no_consent');
    if(stop==='unsubscribe')await h.app.unsubscribe(l.id,h.app.signature(l.id));
    if(stop==='suppression')await h.db.insert('suppression',{email:'owner@example.test'});
    if(stop==='booked')await h.db.insert('applications',{email:'owner@example.test',status:'booked'});
    if(stop==='reply')await h.db.insert('activities',{type:'email',title:'Reply: Question',body:'From owner@example.test',created_at:new Date(Date.now()+1000).toISOString()});
    await h.app.work(l.id,'day1');assert.equal(h.emails.length,0,stop);
  }
  const h=harness(),l=await h.capture(true);assert.equal(h.jobs.length,4);await h.app.work(l.id,'hour1');assert.equal(h.emails.length,1);assert.match(h.emails[0].m.html,/Unsubscribe/);assert.ok(h.emails[0].m.headers['List-Unsubscribe']);
  await assert.rejects(h.app.unsubscribe(l.id,'bad'),/Invalid/);
});
test('payment reconciliation stops a queued nudge even before webhook delivery',async()=>{
  const h=harness(),l=await h.capture(true);await h.app.checkout({...l,authority:'authorized',agreed:true});const s=[...h.sessions.values()][0];s.payment_status='paid';await h.app.work(l.id,'day1');assert.equal(h.emails.length,0);assert.equal((await h.db.getById('advantage_leads',l.id)).status,'paid');
});
test('refund/dispute events stop this funnel without affecting unrelated purchases',async()=>{
  const h=harness(),l=await h.capture(true);await h.db.update('advantage_leads',l.id,{payment_intent:'pi_1',status:'paid'});
  await h.app.event({type:'charge.refunded',data:{object:{payment_intent:'pi_1'}}});assert.equal((await h.db.getById('advantage_leads',l.id)).status,'refunded');
  await h.app.event({type:'checkout.session.completed',data:{object:{metadata:{product:'build_deposit'},payment_status:'paid'}}});
  await h.app.work(l.id,'day3');assert.equal(h.emails.length,0);
});
