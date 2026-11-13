// Dedicated AI Advantage funnel. Existing audit/OS funnels remain independent.
const crypto = require('crypto');
const SITE = 'https://www.tmitechai.com/ai-advantage';
const APP = 'https://admin.tmitechai.com';
const CALL = 'https://cal.com/miaeliana/tmi-fit-call';
const OFFERS = Object.freeze({
  executive: { name: 'Executive AI Advantage', amount: 750000, scope: 'Private hands-on AI training for one executive, personal AI assistant setup, and workflows built around daily work.' },
  workforce: { name: 'AI Workforce Advantage', amount: 1500000, scope: 'Hands-on training for up to 10 employees, role-specific AI tools, and ready-to-use workflows built around actual jobs.' },
  audit: { name: 'Intelligent Company Audit', amount: 2500000, scope: 'Review of operations, people, systems and data, with prioritized opportunities for automation, cost savings and custom technology.' },
});
const STOP = new Set(['paid','booked','won','lost','unsubscribed','refunded','replied','disputed']);
const hash = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const esc = v => String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function factory({db, stripe, queue, mail, env = process.env}) {
  const fs = () => db.db();
  const now = () => new Date().toISOString();
  const key = () => crypto.createHash('sha256').update(env.OS_SECRETS_KEY || env.JWT_SECRET || '').digest();
  function seal(secret) { const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',key(),iv); const b=Buffer.concat([c.update(secret,'utf8'),c.final()]); return [iv,c.getAuthTag(),b].map(x=>x.toString('base64')).join('.'); }
  function unseal(value) { const [iv,tag,b]=value.split('.').map(x=>Buffer.from(x,'base64'));const d=crypto.createDecipheriv('aes-256-gcm',key(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(b),d.final()]).toString(); }
  async function claim(id, seconds=90) {
    return fs().runTransaction(async tx => { const ref=fs().collection('advantage_locks').doc(hash(id)), s=await tx.get(ref), d=s.exists?s.data():{};
      if(d.until>Date.now())return false;tx.set(ref,{until:Date.now()+seconds*1000});return true; });
  }
  async function rate(ip) { if(!await claim('rate:'+ip+':'+Math.floor(Date.now()/10000),10)) throw Object.assign(new Error('Please wait a moment and try again.'),{status:429}); }
  async function ensureWebhook() {
    if(!env.OS_SECRETS_KEY && !env.JWT_SECRET) throw new Error('Payment setup is incomplete');
    let c=await db.getById('advantage_config','stripe');if(c?.secret)return c;
    if(!await claim('webhook-setup'))throw new Error('Payment setup is in progress. Please try again.');
    const w=await stripe.webhookEndpoints.create({url:APP+'/api/advantage-events',enabled_events:['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','charge.refunded','charge.dispute.created'],description:'TMI AI Advantage purchases and recovery'}, {idempotencyKey:'tmi-ai-advantage-webhook-v1'});
    if(!w.secret)throw new Error('Payment verification could not be configured');
    c={id:'stripe',endpoint:w.id,secret:seal(w.secret),created_at:now()};await db.insert('advantage_config',c);return c;
  }
  async function schedule(id, step, delay) {
    const jobId=hash(id+':'+step),existing=await db.getById('advantage_jobs',jobId);if(existing)return;
    await db.insert('advantage_jobs',{id:jobId,lead_id:id,step,due:Date.now()+delay*1000,done:false});
    try{await queue.publishJSON({url:APP+'/api/advantage-events',body:{id,step},delay,retries:5,deduplicationId:jobId});}
    catch(e){console.error('advantage queue pending:',e.message);}
  }
  async function initialize(){
    await ensureWebhook();
    const config=await db.getById('advantage_config','health');if(config?.initialized_at)return;
    // Exercise the real Checkout API without a customer or a charge, then close
    // the session immediately. No lead, promotional email or payment is created.
    const probe=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],line_items:[{price_data:{currency:'usd',unit_amount:OFFERS.workforce.amount,product_data:{name:'TMI AI Workforce Advantage'}},quantity:1}],success_url:SITE+'/',cancel_url:SITE+'/',metadata:{funnel:'ai_advantage_setup'}},{idempotencyKey:'tmi-advantage-checkout-readiness-v1'});
    const current=await stripe.checkout.sessions.retrieve(probe.id);if(current.status==='open')await stripe.checkout.sessions.expire(probe.id);
    await db.update('advantage_config','health',{checkout_verified_at:now()});
    await queue.schedules.create({destination:APP+'/api/advantage-events',scheduleId:'tmi-ai-advantage-outbox',cron:'*/15 * * * *',body:JSON.stringify({id:'__outbox__',step:'drain'}),headers:{'Content-Type':'application/json'}});
    await queue.publishJSON({url:APP+'/api/advantage-events',body:{id:'__probe__',step:'probe'},retries:2});
    await db.update('advantage_config','health',{initialized_at:now()});
  }
  async function capture(b) {
    const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim().slice(0,120),company=String(b.company||'').trim().slice(0,180);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200||!name||!company||!OFFERS[b.offer])throw Object.assign(new Error('Please enter your name, company and a valid email.'),{status:400});
    const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');
    // A separate capability prevents another visitor from viewing or changing a lead.
    const lead={id,name,email,company,offer:b.offer,token_hash:hash(token),status:'captured',consent:b.consent===true,consent_text:b.consent===true?'Email me my program details and follow-ups. I can unsubscribe anytime.':null,consent_at:b.consent===true?now():null,source:'ai_advantage',created_at:now(),utm_source:String(b.utm_source||'').slice(0,100),utm_campaign:String(b.utm_campaign||'').slice(0,100)};
    await db.insert('advantage_leads',lead);
    await db.insert('site_submissions',{intent:'ai_advantage',name,email,company,fields:{program:OFFERS[b.offer].name,price_usd:OFFERS[b.offer].amount/100,consent:lead.consent},site:'tmitechai.com',created_at:now()});
    // Confirmation is requested by this submission; promotion requires opt-in.
    await schedule(id,'details',0);
    if(lead.consent){await schedule(id,'hour1',3600);await schedule(id,'day1',86400);await schedule(id,'day3',259200);}
    return {id,token};
  }
  async function authorized(id,token) {const l=await db.getById('advantage_leads',String(id||''));if(!l||!token||l.token_hash!==hash(token))throw Object.assign(new Error('Please start again from the signup form.'),{status:403});return l;}
  async function checkout(b) {
    const l=await authorized(b.id,b.token);if(b.authority!=='authorized'||b.agreed!==true)throw Object.assign(new Error('An authorized company representative must approve this purchase.'),{status:400});
    if(l.status==='paid')return {url:SITE+'/?success=1&session_id='+encodeURIComponent(l.session)};
    await ensureWebhook();
    if(l.session){const prev=await stripe.checkout.sessions.retrieve(l.session);if(prev.status==='open')return {url:prev.url};if(prev.payment_status==='paid'){await settle(prev);return {url:SITE+'/?success=1&session_id='+encodeURIComponent(prev.id)};}}
    const o=OFFERS[l.offer];
    const s=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:l.email,client_reference_id:l.id,
      line_items:[{price_data:{currency:'usd',unit_amount:o.amount,product_data:{name:'TMI '+o.name,description:o.scope}},quantity:1}],
      success_url:SITE+'/?success=1&session_id={CHECKOUT_SESSION_ID}',cancel_url:SITE+'/?checkout=cancelled#enroll',
      expires_at:Math.floor(Date.now()/1000)+3600,after_expiration:{recovery:{enabled:true}},
      consent_collection:{promotions:'auto'},metadata:{funnel:'ai_advantage',lead_id:l.id,offer:l.offer,company:l.company},
    },{idempotencyKey:'advantage:'+l.id+':'+(l.session||'first')});
    await db.update('advantage_leads',l.id,{session:s.id,authority:'authorized',agreed_at:now(),status:'checkout',checkout_at:now()});return {url:s.url};
  }
  async function qualify(b) {const l=await authorized(b.id,b.token);const authority=['authorized','sponsor','exploring'].includes(b.authority)?b.authority:'exploring';await db.update('advantage_leads',l.id,{authority});return {call:CALL,brief:SITE+'/brief.html'};}
  async function settle(s) {
    if(s.metadata?.funnel!=='ai_advantage'||s.payment_status!=='paid')return false;
    const l=await db.getById('advantage_leads',s.metadata.lead_id),o=l&&OFFERS[l.offer];
    if(!o||s.metadata.offer!==l.offer||s.amount_total!==o.amount||s.currency!=='usd')throw new Error('Payment verification mismatch');
    await db.update('advantage_leads',l.id,{status:'paid',session:s.id,payment_intent:s.payment_intent,paid_at:l.paid_at||now()});
    const legacyCall=await db.findOne('precall_bookings','email',l.email);
    if(legacyCall)await db.update('precall_bookings',legacyCall.id,{stopped:true});
    // Queued transactional messages are retryable if the webhook is delivered again.
    await schedule(l.id,'paid',0);await schedule(l.id,'onboarding',86400);return true;
  }
  async function stopped(l) {
    if(STOP.has(l.status)||l.followups_paused||!l.consent)return true;
    if(await db.findOne('suppression','email',l.email))return true;
    const booking=await db.findOne('precall_bookings','email',l.email);
    if(booking&&!booking.cancelled&&booking.booked_at>=l.created_at)return true;
    const purchases=await db.list('advantage_leads',{where:[['email','==',l.email]]});
    if(purchases.some(p=>STOP.has(p.status)))return true;
    for(const coll of ['leads','applications']){const a=await db.findOne(coll,'email',l.email);if(a&&(STOP.has(a.status)||a.unsubscribed))return true;}
    const reply=await db.list('activities',{where:[['type','==','email']],order:'created_at',ascending:false,limit:1000});
    return reply.some(r=>String(r.title||'').startsWith('Reply:')&&String(r.body||'').startsWith('From '+l.email)&&r.created_at>=l.created_at);
  }
  function signature(id) {return crypto.createHmac('sha256',key()).update('unsub:'+id).digest('hex');}
  async function unsubscribe(id,sig) {if(!sig||sig!==signature(id))throw Object.assign(new Error('Invalid unsubscribe link'),{status:400});await db.update('advantage_leads',id,{status:'unsubscribed',consent:false,unsubscribed_at:now()});return true;}
  async function work(id,step) {
    if(id==='__probe__'){await db.update('advantage_config','health',{queue_verified_at:now()});return;}
    if(id==='__outbox__'){
      const jobs=await db.list('advantage_jobs',{where:[['done','==',false]],order:'due',ascending:true});
      for(const j of jobs.filter(j=>j.due<=Date.now()).slice(0,20)){await work(j.lead_id,j.step);await db.update('advantage_jobs',j.id,{done:true,completed_at:now()});}
      await db.update('advantage_config','health',{queue_verified_at:now()});return;
    }
    const l=await db.getById('advantage_leads',id);if(!l||!['details','hour1','day1','day3','paid','onboarding'].includes(step))return;
    if(l.session){const s=await stripe.checkout.sessions.retrieve(l.session);if(s.payment_status==='paid'&&l.status!=='paid'){await settle(s);l.status='paid';}}
    const transaction=['details','paid','onboarding'].includes(step);
    if(!transaction&&await stopped(l))return;
    if(['paid','onboarding'].includes(step)&&l.status!=='paid')return;
    if(step==='onboarding'&&(l.onboarding_at||l.followups_paused))return;
    if(step==='onboarding'){const a=await db.findOne('applications','email',l.email),b=await db.findOne('precall_bookings','email',l.email);if((a&&['booked','replied'].includes(a.status))||(b&&!b.cancelled&&b.booked_at>=l.created_at))return;}
    if(step==='details'&&l.status==='paid')return;
    const delivery=transaction?id+':'+step:hash(l.email)+':'+step+':'+l.created_at.slice(0,10),existing=await db.getById('advantage_deliveries',hash(delivery));if(existing?.sent_at)return;
    if(!await claim('send:'+delivery))throw new Error('Email delivery is already processing');
    const o=OFFERS[l.offer],unsub=APP+'/api/advantage?action=unsubscribe&id='+encodeURIComponent(id)+'&sig='+signature(id);
    let subject,body;
    const cta=(url,text)=>`<p><a style="display:inline-block;background:#E4FF97;color:#111;padding:15px 20px;text-decoration:none;font-weight:700" href="${url}">${text}</a></p>`;
    if(step==='paid'||step==='onboarding'){subject=step==='paid'?'Your TMI purchase is confirmed':'Let’s plan your TMI engagement';body=`<p>Your ${esc(o.name)} purchase${step==='paid'?' is confirmed.':' is ready for the next step.'}</p><p>${esc(o.scope)}</p><p>Book a kickoff conversation with TMI to confirm priorities and arrange delivery. Please include the company leader responsible for this engagement.</p>${cta(SITE+'/?onboarding=1&id='+encodeURIComponent(id)+'&token='+signature(id),'Arrange your kickoff')}<p>Reply to this email with questions. Your payment is a one-time purchase, not a subscription.</p>`;}
    else if(step==='details'){subject='Your TMI AI Advantage program';body=`<p>Here are the details you requested for ${esc(l.company)}.</p><h2>${esc(o.name)}</h2><p>${esc(o.scope)}</p><p>One-time company investment: $${(o.amount/100).toLocaleString('en-US')}.</p>${cta(SITE+'/#programs','Review the program')}<p>Evaluating this for your company? Share <a href="${SITE}/brief.html">this leadership brief</a>. For a fit call, include the person who approves the investment.</p>`;}
    else {const copy={hour1:['A useful place to start with AI','Choose one repeated task your people do every week: reporting, meeting follow-up, searching for information or drafting routine documents. That is where a practical AI conversation begins.'],day1:['What your team should leave with','The goal is a team that can use the tools in its actual work. TMI combines hands-on education, workflow setup and a way to measure the change. Bring your current work, not a list of AI buzzwords.'],day3:['Is this a priority for your company?','If improving capacity is a priority, review the program or book a fit call with the leader who can approve it. If the timing is wrong, you can keep the brief and come back when it is useful.']}[step];subject=copy[0];body=`<p>${copy[1]}</p>${cta(SITE+'/#enroll','Continue with TMI')}<p><a href="${CALL}">Book a fit call</a> with your decision maker, or reply with a question.</p>`;}
    const html=`<html><body style="margin:0;background:#f5f5f7;color:#1a1a1a;font:16px/1.7 Arial,sans-serif"><div style="max-width:560px;margin:24px auto;background:white;padding:32px"><b style="font-size:24px">TMI<span style="color:#85a840">.</span></b><p>Hi ${esc(l.name.split(/\s+/)[0])},</p>${body}<p>TMI<br>Lafayette, Louisiana<br><a href="https://www.tmitechai.com">tmitechai.com</a></p>${!transaction?`<p style="font-size:12px"><a href="${unsub}">Unsubscribe from these follow-ups</a></p>`:''}</div></body></html>`;
    const result=await mail.emails.send({from:'TMI <support@tmitechai.com>',replyTo:'support@tmitechai.com',to:l.email,subject,html,...(!transaction?{headers:{'List-Unsubscribe':`<${unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}:{})},{idempotencyKey:'advantage/'+hash(delivery)});
    if(result.error)throw new Error('Email delivery failed');await db.insert('advantage_deliveries',{id:hash(delivery),lead_id:id,step,sent_at:now(),provider_id:result.data?.id||null});
  }
  async function event(e) {
    const s=e.data.object;
    if(e.type.startsWith('checkout.session.')&&s.metadata?.funnel!=='ai_advantage')return;
    if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type))await settle(s);
    else if(e.type==='checkout.session.expired'){const l=await db.getById('advantage_leads',s.metadata.lead_id);if(l&&l.status!=='paid')await db.update('advantage_leads',l.id,{expired_at:now()});}
    else if(['charge.refunded','charge.dispute.created'].includes(e.type)){const pi=s.payment_intent;if(!pi)return;const l=await db.findOne('advantage_leads','payment_intent',pi);if(l)await db.update('advantage_leads',l.id,{status:e.type==='charge.refunded'?'refunded':'disputed'});}
  }
  async function health(){const c=await db.getById('advantage_config','stripe'),h=await db.getById('advantage_config','health'),b=await stripe.balance.retrieve();const domains=await mail.domains.list();const sender=domains.data?.data?.some(d=>d.name==='tmitechai.com'&&d.status==='verified')||false;return {ok:true,live:b.livemode===true,payments:true,checkout_verified_at:h?.checkout_verified_at||null,email:sender,queue:!!env.QSTASH_TOKEN,queue_verified_at:h?.queue_verified_at||null,webhook:!!c?.endpoint};}
  return {OFFERS,rate,capture,checkout,qualify,settle,work,event,ensureWebhook,initialize,health,unseal,signature,unsubscribe,db,stripe};
}
let instance;
function production(){if(instance)return instance;const db=require('./_db'),stripe=require('stripe')(process.env.STRIPE_SECRET_KEY),{Client}=require('@upstash/qstash'),{Resend}=require('resend');instance=factory({db,stripe,queue:new Client({token:process.env.QSTASH_TOKEN}),mail:new Resend(process.env.RESEND_API_KEY)});return instance;}
module.exports={factory,production,OFFERS,SITE,APP,CALL};
