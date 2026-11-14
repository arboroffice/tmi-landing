// Fixed, non-customer delivery probe. No caller-supplied recipient or content.
const db=require('./_tmi-db');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).end();
  try{
    const {Resend}=require('resend'),mail=new Resend(process.env.RESEND_API_KEY);
    const listed=await mail.domains.list();
    const domains=(listed.data?.data||[]).filter(d=>/(^|\.)tmitechai\.com$/.test(d.name)).map(d=>({id:d.id,name:d.name,status:d.status}));
    let delivery=await db.getById('advantage_config','email_probe');
    if(!delivery&&await db.claim('funnel-email-readiness-v1',120)){
      const result=await mail.emails.send({from:'TMI <support@tmitechai.com>',to:'delivered@resend.dev',subject:'TMI funnel delivery verification',text:'Provider delivery verification. This simulated recipient does not deliver to a customer.'},{idempotencyKey:'tmi-funnel-email-readiness-v1'});
      delivery={accepted:!!result.data?.id,provider_id:result.data?.id||null,error_code:result.error?.name||null,error_message:result.error?.message||null,checked_at:new Date().toISOString()};
      await db.update('advantage_config','email_probe',delivery);
    }
    let model={configured:!!process.env.ANTHROPIC_API_KEY,available:false};
    if(model.configured){const r=await fetch('https://api.anthropic.com/v1/models',{headers:{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(10000)});const b=await r.json();model={...model,available:r.ok,model:r.ok?(b.data||[]).find(d=>/haiku/.test(d.id))?.id||b.data?.[0]?.id||null:null,status:r.status};}
    await db.update('advantage_config','provider_diagnostics',{domains,email_access_error:listed.error?.name||null,model,updated_at:new Date().toISOString()});
    return res.json({domains,email_access_error:listed.error?{code:listed.error.name,message:listed.error.message}:null,delivery,model});
  }catch(e){console.error('funnel readiness failed',e.name);return res.status(503).json({error:'Provider readiness unavailable'});}
};
