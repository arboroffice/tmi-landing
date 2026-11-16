// Dedicated AI Advantage funnel. Existing audit/OS funnels remain independent.
const crypto = require('crypto');
const SITE = 'https://www.tmitechai.com/ai-advantage';
const APP = 'https://admin.tmitechai.com';
const CALL = SITE + '/executive.html#enroll';
const ROADMAP = 'https://www.tmitechai.com/ai-advantage/opportunity.html';
const INTAKE = 'https://www.tmitechai.com/ai-advantage/opportunity-intake.html';
const OFFERS = Object.freeze({
  roadmap: { name: 'AI Opportunity & Roadmap', amount: 99700, scope: 'A focused review of your recurring work, prioritized AI opportunities, recommended tools and inputs, and a written 30-day action roadmap. Implementation is separate. No fixed delivery deadline or hours-saved guarantee.' },
  executive: { name: 'TMI Admin Relief Setup', amount: 750000, scope: 'AI setup, agreed workflows, guided handoff, workflow guide, and measured time-savings guarantee under the written plan agreed before payment.' },
  workforce: { name: 'AI Workforce Advantage', amount: 1500000, scope: 'Hands-on training for up to 10 employees, role-specific AI tools, and ready-to-use workflows built around actual jobs.' },
  audit: { name: 'Intelligent Company Audit', amount: 2500000, scope: 'Review of operations, people, systems and data, with prioritized opportunities for automation, cost savings and custom technology.' },
});
const STOP = new Set(['paid','booked','won','lost','unsubscribed','refunded','replied','disputed']);
const hash = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const esc = v => String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function factory({db, stripe, queue, mail, env = process.env}) {
  const fs = () => db.db();
  const now = () => new Date().toISOString();
  const sales=require('./_funnel-sales')({db,mail,env,claim,schedule,isStopped:stopped});
  const key = () => crypto.createHash('sha256').update(env.OS_SECRETS_KEY || env.JWT_SECRET || '').digest();
  function seal(secret) { const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',key(),iv); const b=Buffer.concat([c.update(secret,'utf8'),c.final()]); return [iv,c.getAuthTag(),b].map(x=>x.toString('base64')).join('.'); }
  function unseal(value) { const [iv,tag,b]=value.split('.').map(x=>Buffer.from(x,'base64'));const d=crypto.createDecipheriv('aes-256-gcm',key(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(b),d.final()]).toString(); }
  async function claim(id, seconds=90) {
    if(db.claim)return db.claim(hash(id),seconds);
    return fs().runTransaction(async tx => { const ref=fs().collection('advantage_locks').doc(hash(id)), s=await tx.get(ref), d=s.exists?s.data():{};
      if(d.until>Date.now())return false;tx.set(ref,{until:Date.now()+seconds*1000});return true; });
  }
  async function rate(ip,seconds=10) { if(!await claim('rate:'+ip+':'+Math.floor(Date.now()/(seconds*1000)),seconds)) throw Object.assign(new Error('Please wait a moment and try again.'),{status:429}); }
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
  async function verifyRoadmapCheckout(){
    const health=await db.getById('advantage_config','health');if(health?.roadmap_checkout_verified_at)return;
    if(!await claim('roadmap-checkout-readiness',90))throw new Error('Roadmap payment verification is in progress.');
    const probe=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],line_items:[{price_data:{currency:'usd',unit_amount:OFFERS.roadmap.amount,product_data:{name:'TMI AI Opportunity & Roadmap — checkout verification'}},quantity:1}],success_url:ROADMAP,cancel_url:ROADMAP,metadata:{funnel:'ai_advantage_setup',offer:'roadmap',verification:'no-charge'}},{idempotencyKey:'tmi-roadmap-checkout-readiness-v1'});
    const current=await stripe.checkout.sessions.retrieve(probe.id);if(current.status==='open')await stripe.checkout.sessions.expire(probe.id);
    if(current.amount_total!==OFFERS.roadmap.amount||current.currency!=='usd'||current.mode!=='payment')throw new Error('Roadmap checkout verification failed.');
    await db.update('advantage_config','health',{roadmap_checkout_verified_at:now()});
  }
  async function initialize(){
    await ensureWebhook();await verifyRoadmapCheckout();
    const config=await db.getById('advantage_config','health');if(config?.initialized_at)return;
    // Exercise the real Checkout API without a customer or a charge, then close
    // the session immediately. No lead, promotional email or payment is created.
    const probe=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],line_items:[{price_data:{currency:'usd',unit_amount:OFFERS.executive.amount,product_data:{name:'TMI Admin Relief Setup'}},quantity:1}],success_url:SITE+'/',cancel_url:SITE+'/',metadata:{funnel:'ai_advantage_setup'}},{idempotencyKey:'tmi-advantage-checkout-readiness-v1'});
    const current=await stripe.checkout.sessions.retrieve(probe.id);if(current.status==='open')await stripe.checkout.sessions.expire(probe.id);
    await db.update('advantage_config','health',{checkout_verified_at:now()});
    await queue.schedules.create({destination:APP+'/api/advantage-events',scheduleId:'tmi-ai-advantage-outbox',cron:'*/15 * * * *',body:JSON.stringify({id:'__outbox__',step:'drain'}),headers:{'Content-Type':'application/json'}});
    await queue.publishJSON({url:APP+'/api/advantage-events',body:{id:'__probe__',step:'probe'},retries:2});
    await db.update('advantage_config','health',{initialized_at:now()});
  }
  async function capture(b) {
    const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim().slice(0,120),company=String(b.company||'').trim().slice(0,180);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200||!name||!company||!['executive','roadmap'].includes(b.offer))throw Object.assign(new Error('Please enter your name, company and a valid email.'),{status:400});
    const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');
    // A separate capability prevents another visitor from viewing or changing a lead.
    const lead={id,name,email,company,offer:b.offer,token_hash:hash(token),status:'captured',consent:b.consent===true,consent_text:b.consent===true?'Email me my program details and follow-ups. I can unsubscribe anytime.':null,consent_at:b.consent===true?now():null,problem:String(b.message||b.problem||'').slice(0,2000),callback_requested:b.callback===true,followups_paused:b.callback===true,source:'ai_advantage',created_at:now(),utm_source:String(b.utm_source||'').slice(0,100),utm_campaign:String(b.utm_campaign||'').slice(0,100)};
    await db.insert('advantage_leads',lead);
    await db.insert('site_submissions',{intent:'ai_advantage',name,email,company,fields:{program:OFFERS[b.offer].name,price_usd:OFFERS[b.offer].amount/100,consent:lead.consent},site:'tmitechai.com',created_at:now()});
    // Confirmation is requested by this submission; promotion requires opt-in.
    if(!lead.callback_requested)await schedule(id,'details',0);
    if(lead.consent&&lead.offer!=='roadmap'){await schedule(id,'hour1',3600);await schedule(id,'day1',86400);await schedule(id,'day3',259200);}
    await sales.captured(lead);
    let notified=false;try{await sales.notifyOwner(lead);notified=true;}catch{await schedule(id,'owner_inquiry',0);}
    return {id,token,notified};
  }
  async function authorized(id,token) {const l=await db.getById('advantage_leads',String(id||''));if(!l||!token||(l.token_hash!==hash(token)&&!sales.validTicket(token,l.id)))throw Object.assign(new Error('Please start again from the signup form.'),{status:403});return l;}
  async function checkout(b) {
    const l=await authorized(b.id,b.token);if(b.authority!=='authorized'||b.agreed!==true)throw Object.assign(new Error('An authorized company representative must approve this purchase.'),{status:400});
    const destination=l.offer==='roadmap'?INTAKE:SITE+'/';
    if(l.status==='paid')return {url:destination+'?success=1&session_id='+encodeURIComponent(l.session)};
    if(!['executive','roadmap'].includes(l.offer))throw Object.assign(new Error('This package is no longer available. Contact TMI for help.'),{status:400});
    if(l.offer==='executive'&&b.plan_agreed!==true)throw Object.assign(new Error('Please confirm your written plan and guarantee terms before checkout.'),{status:400});
    if(l.offer==='roadmap'){
      const consent=b.reminder_consent===true;
      await db.update('advantage_leads',l.id,{consent,consent_text:consent?'Email me a saved checkout link and up to three reminders if I do not finish. I can unsubscribe anytime.':null,consent_at:consent?now():null});
      if(consent){await schedule(l.id,'hour1',3600);await schedule(l.id,'day1',86400);await schedule(l.id,'day3',259200);}
    }
    await ensureWebhook();
    const o=OFFERS[l.offer];
    if(l.session){const prev=await stripe.checkout.sessions.retrieve(l.session);if(prev.payment_status==='paid'){await settle(prev);return {url:destination+'?success=1&session_id='+encodeURIComponent(prev.id)};}if(prev.status==='open'){if(prev.amount_total===o.amount)return {url:prev.url};await stripe.checkout.sessions.expire(prev.id);}}
    const s=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:l.email,client_reference_id:l.id,
      line_items:[{price_data:{currency:'usd',unit_amount:o.amount,product_data:{name:l.offer==='roadmap'?'TMI AI Opportunity & Roadmap':'TMI '+o.name,description:o.scope}},quantity:1}],
      success_url:destination+'?success=1&session_id={CHECKOUT_SESSION_ID}',cancel_url:(l.offer==='roadmap'?ROADMAP:SITE+'/')+'?checkout=cancelled#enroll',
      expires_at:Math.floor(Date.now()/1000)+3600,after_expiration:{recovery:{enabled:true}},
      metadata:{funnel:'ai_advantage',lead_id:l.id,offer:l.offer,company:l.company},
    },{idempotencyKey:'advantage:v3:'+o.amount+':'+l.id+':'+(l.session||'first')});
    await db.update('advantage_leads',l.id,{session:s.id,checkout_amount:o.amount,authority:'authorized',agreed_at:now(),status:'checkout',checkout_at:now()});return {url:s.url};
  }
  async function callback(b){
    const l=await authorized(b.id,b.token);const patch={callback_requested:true,callback_requested_at:now(),followups_paused:true};
    if(b.message)patch.problem=String(b.message).trim().slice(0,2000);await db.update('advantage_leads',l.id,patch);
    try{await sales.notifyOwner({...l,...patch});}catch{await schedule(l.id,'owner_inquiry',0);throw Object.assign(new Error('Your request is saved, but the email notification could not be sent. Please try again.'),{status:503});}
    return {ok:true,notified:true,message:'Your request is with TMI. We will contact you by email.'};
  }
  async function qualify(b){return callback(b);}
  async function settle(s) {
    if(s.metadata?.funnel!=='ai_advantage'||s.payment_status!=='paid')return false;
    const l=await db.getById('advantage_leads',s.metadata.lead_id),o=l&&OFFERS[l.offer];
    if(l&&['refunded','disputed'].includes(l.status))return false;
    const expected=o&&(l.checkout_amount||(l.offer==='executive'&&l.session===s.id&&l.checkout_at?750000:o.amount));
    if(!o||s.metadata.offer!==l.offer||s.amount_total!==expected||s.currency!=='usd'||(l.offer==='roadmap'&&((l.session!==s.id&&s.recovered_from!==l.session)||s.status!=='complete'||s.customer_email!==l.email||!s.payment_intent)))throw new Error('Payment verification mismatch');
    await db.update('advantage_leads',l.id,{status:'paid',session:s.id,payment_intent:s.payment_intent,paid_at:l.paid_at||now()});
    const legacyCall=await db.findOne('precall_bookings','email',l.email);
    if(legacyCall)await db.update('precall_bookings',legacyCall.id,{stopped:true});
    const task=await db.getById('funnel_tasks','sales_'+l.id);if(task)await db.update('funnel_tasks',task.id,{status:'done',updated_at:now()});
    // Queued transactional messages are retryable if the webhook is delivered again.
    await schedule(l.id,'paid',0);await schedule(l.id,'onboarding',86400);if(l.offer==='roadmap'){await schedule(l.id,'onboarding3',259200);await schedule(l.id,'onboarding7',604800);}try{await sales.notifyOwner({...l,status:'paid',checkout_amount:s.amount_total},'paid');}catch{await schedule(l.id,'owner_paid',0);}return true;
  }
  function opportunityLink(l){const token=require('jsonwebtoken').sign({sub:l.id,kind:'opportunity_intake'},env.JWT_SECRET||env.OS_SECRETS_KEY,{expiresIn:'30d'});return INTAKE+'#request='+encodeURIComponent(l.id+'.'+token);}
  async function opportunityIntake(b){
    const id=String(b.id||''),raw=String(b.token||'');const l=await db.getById('advantage_leads',id);let valid=!!l&&!!raw&&l.token_hash===hash(raw);
    if(!valid&&l){try{const claims=require('jsonwebtoken').verify(raw,env.JWT_SECRET||env.OS_SECRETS_KEY,{algorithms:['HS256']});valid=claims.sub===id&&claims.kind==='opportunity_intake';}catch{}}
    if(!valid)throw Object.assign(new Error('Open the private intake link in your purchase email, or email support@tmitechai.com for access.'),{status:403});
    if(l.offer!=='roadmap'||l.status!=='paid')throw Object.assign(new Error('A confirmed roadmap purchase is required. Please do not pay again if payment is still processing.'),{status:403});
    if(b.action==='opportunity_intake_save'){
      const values=b.intake;if(!values||typeof values!=='object'||Array.isArray(values))throw Object.assign(new Error('Enter your work details.'),{status:400});
      const limits={role:300,workday:2000,repeat_tasks:2000,tools:1000,desired_result:1200,constraints:1500,team:200,priority:800};const cleaned={};for(const [key,max] of Object.entries(limits)){if(values[key]!==undefined){if(typeof values[key]!=='string'||values[key].length>max)throw Object.assign(new Error('Please shorten the '+key.replaceAll('_',' ')+' field.'),{status:400});cleaned[key]=values[key].trim();}}
      const intake={...(l.opportunity_intake||{}),...cleaned};
      if(b.submit===true&&['role','workday','repeat_tasks','tools','desired_result'].some(key=>!intake[key]))throw Object.assign(new Error('Complete your role, workday, recurring tasks, tools, and desired result before submitting.'),{status:400});
      if(!l.opportunity_submitted_at){await db.update('advantage_leads',id,{opportunity_intake:intake,opportunity_step:Number.isInteger(b.step)?Math.min(3,Math.max(0,b.step)):0,intake_saved_at:now(),...(b.submit===true?{opportunity_submitted_at:now(),onboarding_at:now()}: {})});}
      if(b.submit===true){const updated=await db.getById('advantage_leads',id);try{await sales.notifyOwner(updated,'intake');}catch{await schedule(id,'owner_intake',0);}}
    }
    const updated=await db.getById('advantage_leads',id);return {ok:true,name:updated.name,company:updated.company,intake:updated.opportunity_intake||{},step:updated.opportunity_step||0,submitted:!!updated.opportunity_submitted_at,message:updated.opportunity_submitted_at?'Your work details are with TMI. We will review them and email you about your roadmap.':'Your answers are saved. You can return through your private purchase email link.'};
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
  async function unsubscribe(id,sig) {if(!sig||sig!==signature(id))throw Object.assign(new Error('Invalid unsubscribe link'),{status:400});const l=await db.getById('advantage_leads',id);if(!l)throw Object.assign(new Error('Request not found'),{status:404});await db.update('advantage_leads',id,{...(['paid','refunded','disputed'].includes(l.status)?{}:{status:'unsubscribed'}),consent:false,followups_paused:true,unsubscribed_at:now()});return true;}
  async function work(id,step) {
    if(id==='__probe__'){await db.update('advantage_config','health',{queue_verified_at:now()});return;}
    if(id==='__outbox__'){
      const jobs=await db.list('advantage_jobs',{where:[['done','==',false]],order:'due',ascending:true});
      for(const j of jobs.filter(j=>j.due<=Date.now()).slice(0,20)){await work(j.lead_id,j.step);await db.update('advantage_jobs',j.id,{done:true,completed_at:now()});}
      await sales.sweep();await db.update('advantage_config','health',{queue_verified_at:now()});return;
    }
    if(['owner_inquiry','owner_paid','owner_intake'].includes(step)){const l=await db.getById('advantage_leads',id);if(l)await sales.notifyOwner(l,step==='owner_paid'?'paid':step==='owner_intake'?'intake':'inquiry');return;}
    if(['handoff','handoff_hot','rep_due','day7'].includes(step))return sales.work(id,step);
    const l=await db.getById('advantage_leads',id);if(!l||!['details','hour1','day1','day3','paid','onboarding','onboarding3','onboarding7'].includes(step))return;
    if(['refunded','disputed'].includes(l.status))return;
    if(l.email_issue||await db.findOne('suppression','email',l.email))return;
    if(l.session){const s=await stripe.checkout.sessions.retrieve(l.session);if(s.payment_status==='paid'&&l.status!=='paid'){await settle(s);l.status='paid';}}
    const intakeReminder=['onboarding','onboarding3','onboarding7'].includes(step);
    if(l.offer==='roadmap'){
      if(intakeReminder&&(l.status!=='paid'||l.opportunity_submitted_at||l.onboarding_at||l.followups_paused||l.human_active||l.human_requested_at))return;
      const delays={hour1:3600,day1:86400,day3:259200,onboarding:86400,onboarding3:259200,onboarding7:604800};
      if(delays[step]){const start=Date.parse(intakeReminder?l.paid_at:(l.checkout_at||l.created_at));const due=start+delays[step]*1000;if(!Number.isFinite(due)||Date.now()+2000<due||Date.now()-due>86400000)return;}
    }
    const transaction=['details','paid','onboarding','onboarding3','onboarding7'].includes(step);
    if(!transaction&&await stopped(l))return;
    if(['paid','onboarding','onboarding3','onboarding7'].includes(step)&&l.status!=='paid')return;
    if(step==='onboarding'&&(l.onboarding_at||l.followups_paused))return;
    if(step==='onboarding'){const a=await db.findOne('applications','email',l.email),b=await db.findOne('precall_bookings','email',l.email);if((a&&['booked','replied'].includes(a.status))||(b&&!b.cancelled&&b.booked_at>=l.created_at))return;}
    if(step==='details'&&l.status==='paid')return;
    const delivery=transaction?id+':'+step:hash(l.email)+':'+step+':'+l.created_at.slice(0,10),existing=await db.getById('advantage_deliveries',hash(delivery));if(existing?.sent_at)return;
    if(!await claim('send:'+delivery))throw new Error('Email delivery is already processing');
    const returnUrl=l.offer==='roadmap'?ROADMAP+'#resume='+encodeURIComponent(sales.ticket(l.id)):sales.resume(l.id);
    const o=OFFERS[l.offer],unsub=APP+'/api/advantage?action=unsubscribe&id='+encodeURIComponent(id)+'&sig='+signature(id);
    let subject,body;
    const cta=(url,text)=>`<p><a style="display:inline-block;background:#E4FF97;color:#111;padding:15px 20px;text-decoration:none;font-weight:700" href="${url}">${text}</a></p>`;
    if(step==='paid'||intakeReminder){subject=step==='paid'?'Your TMI purchase is confirmed':'Let’s plan your TMI engagement';body=`<p>Your ${esc(o.name)} purchase${step==='paid'?' is confirmed.':' is ready for the next step.'}</p><p>${esc(o.scope)}</p><p>TMI will contact you to confirm priorities and arrange delivery. You can reply to this email with questions.</p>${cta(SITE+'/?onboarding=1&id='+encodeURIComponent(id)+'&token='+signature(id),'View your setup request')}<p>Reply to this email with questions. Your payment is a one-time purchase, not a subscription.</p>`;}
    else if(step==='details'){subject='Your TMI AI Advantage program';body=`<p>Here are the details you requested for ${esc(l.company)}.</p><h2>${esc(o.name)}</h2><p>${esc(o.scope)}</p><p>One-time company investment: $${(o.amount/100).toLocaleString('en-US')}.</p>${cta(returnUrl,'Review your next step')}<p>Evaluating this for your company? Share <a href="${SITE}/brief.html">this leadership brief</a>. Reply to this email if you would like TMI to contact you.</p>`;}
    else {const copy={hour1:['A useful place to start with AI','Choose one repeated task your people do every week: reporting, meeting follow-up, searching for information or drafting routine documents. That is where a practical AI conversation begins.'],day1:['What your team should leave with','The goal is a team that can use the tools in its actual work. TMI combines hands-on education, workflow setup and a way to measure the change. Bring your current work, not a list of AI buzzwords.'],day3:['Is this a priority for your company?','If improving capacity is a priority, review the setup or request a reply from TMI. If the timing is wrong, you can keep the brief and come back when it is useful.']}[step];subject=copy[0];body=`<p>${copy[1]}</p>${cta(returnUrl,'Continue with TMI')}<p><a href="${CALL}">Request contact from TMI</a>, or reply with a question.</p>`;}
    if(l.offer==='roadmap'&&(step==='paid'||intakeReminder)){subject=step==='paid'?'Your TMI AI Opportunity & Roadmap purchase is confirmed':'Your AI roadmap: tell us how your work gets done';body=`<h2>Your next step: show us how you work.</h2><p>Your one-time AI Opportunity &amp; Roadmap purchase is confirmed.</p><p>Complete the written intake so we can review your recurring work, identify useful AI opportunities, and prepare your prioritized action plan.</p>${cta(opportunityLink(l),'Complete my roadmap intake')}<p>Your private intake link is valid for 30 days. It saves your answers between steps. No preparation call is required.</p><p>TMI reviews your answers and emails your written roadmap. We will ask by email if we need clarification. There is no fixed delivery deadline or guaranteed number of hours saved. Implementation is separate.</p><p>Keep passwords, confidential customer records and payment details out of your answers. Reply here with questions.</p>`;}
    if(l.offer==='roadmap'&&step==='details'){subject='Your TMI AI Opportunity & Roadmap';body=`<h2>A clear plan before you build.</h2><p>${esc(o.scope)}</p><p>The one-time price is $997. Payment is followed by a written intake; TMI reviews your work and emails your roadmap. No preparation call is required.</p>${cta(returnUrl,'Return to my saved checkout')}`;}
    if(l.offer==='roadmap'&&['hour1','day1','day3'].includes(step)){
      const copy={hour1:['Your AI roadmap checkout is saved','You started the AI Opportunity & Roadmap checkout. If you still want a clear plan for the work that keeps repeating, your saved details are below.'],day1:['A clear next step for the work that repeats','The roadmap starts with how your work gets done: the tasks, tools and handoffs. TMI reviews your written intake and gives you prioritized AI opportunities and a practical action plan.'],day3:['Your last AI roadmap checkout reminder','This is the last reminder about your saved checkout. If the roadmap is still useful, you can continue below. If not, there is nothing you need to do.']}[step];subject=copy[0];body=`<h2>${esc(copy[0])}</h2><p>${esc(copy[1])}</p><p>The price is $997 once for the written review and roadmap. No required preparation call. Implementation is separate, and there is no fixed delivery deadline or hours-saved guarantee.</p>${cta(returnUrl,'Continue my saved checkout')}<p>If you have a question, reply to this email. These checkout reminders stop when payment is confirmed or you unsubscribe.</p>`;
    }
    if(l.offer==='roadmap'&&intakeReminder){subject=step==='onboarding'?'Your AI roadmap is waiting for your work brief':step==='onboarding3'?'Pick up your AI roadmap intake where you left off':'Your last roadmap intake reminder';body=`<h2>Show us the work you want to improve.</h2><p>Your roadmap purchase is confirmed. Your written intake is not submitted yet, so TMI does not have the full brief needed to prepare your report.</p><p>Start with your role, recurring tasks, current tools and what you want to change. Rough estimates are fine; no passwords or confidential records are needed.</p>${cta(opportunityLink(l),'Continue my saved intake')}<p>Your answers save between steps. Reply here if you need help. ${step==='onboarding7'?'This is the last automated intake reminder.':'These reminders stop when you submit your intake or unsubscribe.'}</p>`;}
    const html=`<html><body style="margin:0;background:#f5f5f7;color:#1a1a1a;font:16px/1.7 Arial,sans-serif"><div style="max-width:560px;margin:24px auto;background:white;padding:32px"><b style="font-size:24px">TMI<span style="color:#85a840">.</span></b><p>Hi ${esc(l.name.split(/\s+/)[0])},</p>${body}<p>TMI<br>Lafayette, Louisiana<br><a href="https://www.tmitechai.com">tmitechai.com</a></p>${(!transaction||intakeReminder)?`<p style="font-size:12px"><a href="${unsub}">Unsubscribe from these follow-ups</a></p>`:''}</div></body></html>`;
    const result=await mail.emails.send({from:await sales.sender(),replyTo:sales.replyAddress(l.id),to:l.email,subject,html,...((!transaction||intakeReminder)?{headers:{'List-Unsubscribe':`<${unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}:{})},{idempotencyKey:'advantage/'+hash(delivery)});
    if(result.error||!result.data?.id)throw new Error('Email delivery failed');await db.insert('advantage_deliveries',{id:hash(delivery),lead_id:id,step,sent_at:now(),provider_id:result.data?.id||null});
  }
  async function event(e) {
    const s=e.data.object;
    if(e.type.startsWith('checkout.session.')&&s.metadata?.funnel!=='ai_advantage')return;
    if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type))await settle(s);
    else if(e.type==='checkout.session.expired'){const l=await db.getById('advantage_leads',s.metadata.lead_id);if(l&&l.status!=='paid')await db.update('advantage_leads',l.id,{expired_at:now()});}
    else if(['charge.refunded','charge.dispute.created'].includes(e.type)){const pi=s.payment_intent;if(!pi)return;const l=await db.findOne('advantage_leads','payment_intent',pi);if(l)await db.update('advantage_leads',l.id,{status:e.type==='charge.refunded'?'refunded':'disputed'});}
  }
  async function health(){const c=await db.getById('advantage_config','stripe'),h=await db.getById('advantage_config','health'),b=await stripe.balance.retrieve();const domains=await mail.domains.list(),sender=await db.getById('advantage_config','email_sender'),probe=await db.getById('advantage_config','email_probe');const domain=(String(sender?.from||'').match(/@([^>]+)>/)||[])[1];const ready=!!sender?.verified&&probe?.accepted===true&&probe?.delivered===true&&(domains.data?.data||[]).some(d=>d.name===domain&&d.status==='verified');return {ok:true,live:b.livemode===true,payments:true,roadmap_checkout_verified_at:h?.roadmap_checkout_verified_at||null,checkout_verified_at:h?.checkout_verified_at||null,email:ready,email_webhook:!!(await db.getById('advantage_config','email_webhook'))?.id,queue:!!env.QSTASH_TOKEN,queue_verified_at:h?.queue_verified_at||null,webhook:!!c?.endpoint,agents:await sales.health()};}
  return {sales,verifyRoadmapCheckout,opportunityIntake,opportunityLink,authorized,seal,OFFERS,rate,capture,checkout,callback,qualify,settle,work,event,ensureWebhook,initialize,health,unseal,signature,unsubscribe,db,stripe};
}
let instance;
function production(){if(instance)return instance;const db=require('./_tmi-db'),stripe=require('stripe')(process.env.STRIPE_SECRET_KEY),{Client}=require('@upstash/qstash'),{Resend}=require('resend');instance=factory({db,stripe,queue:new Client({token:process.env.QSTASH_TOKEN}),mail:new Resend(process.env.RESEND_API_KEY)});return instance;}
module.exports={factory,production,OFFERS,SITE,APP,CALL};

