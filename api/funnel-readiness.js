// Fixed, non-customer delivery probe. No caller-supplied recipient or content.
const db=require('./_tmi-db');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).end();
  try{
    const {Resend}=require('resend'),mail=new Resend(process.env.RESEND_API_KEY);
    let listed=await mail.domains.list();
    const setup=await db.getById('advantage_config','email_setup');
    if(setup?.requested&&await db.claim('email-setup-check',30)){
      let domain=(listed.data?.data||[]).find(d=>d.name==='connect.tmitechai.com');
      if(!domain){const x=await fetch('https://api.resend.com/domains',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({name:'connect.tmitechai.com',region:'us-east-1',capabilities:{sending:'enabled',receiving:'enabled'}})});const b=await x.json();if(!x.ok)throw new Error('Email domain setup failed');domain=b;}
      await fetch('https://api.resend.com/domains/'+domain.id+'/verify',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY}});
      const details=await fetch('https://api.resend.com/domains/'+domain.id,{headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY}}).then(r=>r.json());
      await db.update('advantage_config','email_setup',{domain_id:domain.id,domain:details.name,status:details.status,records:details.records||[],updated_at:new Date().toISOString()});
      if(details.status==='verified')await db.update('advantage_config','email_sender',{from:'TMI <team@connect.tmitechai.com>',reply_to:'support@tmitechai.com',verified:true,domain_id:domain.id});
      listed=await mail.domains.list();
      if(!await db.getById('advantage_config','email_webhook')){
        const wr=await fetch('https://api.resend.com/webhooks',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({endpoint:'https://admin.tmitechai.com/api/funnel-email',events:['email.received','email.delivered','email.bounced','email.complained','email.failed','email.suppressed']})});
        const wb=await wr.json();if(!wr.ok||!wb.signing_secret)throw new Error('Email webhook setup failed');
        await db.update('advantage_config','email_webhook',{id:wb.id,secret:require('./_advantage').production().seal(wb.signing_secret),created_at:new Date().toISOString()});
      }
    }
    const domains=(listed.data?.data||[]).filter(d=>/(^|\.)tmitechai\.com$/.test(d.name)).map(d=>({id:d.id,name:d.name,status:d.status}));
    let delivery=await db.getById('advantage_config','email_probe');
    if((!delivery||setup?.requested)&&await db.claim('funnel-email-readiness-v1',120)){
      const from=(await db.getById('advantage_config','email_sender'))?.from||'TMI <support@tmitechai.com>';
      const result=await mail.emails.send({from,to:'delivered@resend.dev',subject:'TMI funnel delivery verification',text:'Provider delivery verification. This simulated recipient does not deliver to a customer.'},{idempotencyKey:'tmi-funnel-email-readiness-'+require('crypto').createHash('sha256').update(from).digest('hex').slice(0,12)+'-'+new Date().toISOString().slice(0,10)});
      const previousDelivery=delivery;delivery={delivered:!!result.data?.id&&previousDelivery?.provider_id===result.data.id&&previousDelivery?.delivered===true,accepted:!!result.data?.id,provider_id:result.data?.id||null,error_code:result.error?.name||null,error_message:result.error?.message||null,checked_at:new Date().toISOString()};
      await db.update('advantage_config','email_probe',delivery);
    }
    let model={configured:!!process.env.ANTHROPIC_API_KEY,available:false};
    if(model.configured){const r=await fetch('https://api.anthropic.com/v1/models',{headers:{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(10000)});const b=await r.json();model={...model,available:r.ok,model:r.ok?(b.data||[]).find(d=>/haiku/.test(d.id))?.id||b.data?.[0]?.id||null:null,status:r.status};}
    await db.update('advantage_config','provider_diagnostics',{domains,email_access_error:listed.error?.name||null,model,updated_at:new Date().toISOString()});
    return res.json({domains,email_access_error:listed.error?{code:listed.error.name,message:listed.error.message}:null,delivery,model});
  }catch(e){console.error('funnel readiness failed',e.name);return res.status(503).json({error:'Provider readiness unavailable'});}
};
