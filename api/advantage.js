const {production,OFFERS,CALL} = require('./_advantage');
const ALLOWED = new Set(['https://www.tmitechai.com','https://tmitechai.com','https://admin.tmitechai.com']);
module.exports=async function(req,res){
  const origin=req.headers.origin;if(ALLOWED.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(origin&&!ALLOWED.has(origin))return res.status(403).json({error:'Origin not allowed'});
  const q=req.query||{};
  try {
    const app=production();
    if(q.action==='report'){
      if(!require('./_auth').verifyToken(req))return res.status(401).json({error:'Unauthorized'});
      if(req.method!=='GET')return res.status(405).end();
      const rows=await app.db.list('advantage_leads',{order:'created_at',ascending:false,limit:250});
      return res.json(rows.map(({id,name,email,company,offer,status,authority,consent,created_at,paid_at,checkout_at,expired_at,followups_paused,onboarding_at})=>({id,name,email,company,offer,status,authority,consent,created_at,paid_at,checkout_at,expired_at,followups_paused,onboarding_at})));
    }
    if(q.action==='unsubscribe'&&['GET','POST'].includes(req.method)){await app.unsubscribe(String(q.id||''),q.sig);return res.status(200).send('You are unsubscribed from TMI AI Advantage follow-ups.');}
    if(req.method==='GET'){
      // Idempotent install creates only this funnel's signed webhook, not a charge.
      if(q.action==='initialize'){await app.initialize();return res.json({ok:true,webhook:true});}
      if(q.action==='status'){
        const s=await app.stripe.checkout.sessions.retrieve(String(q.session_id||''));
        if(s.metadata?.funnel!=='ai_advantage')return res.status(404).json({error:'Purchase not found'});
        const paid=await app.settle(s);return res.json({paid,program:OFFERS[s.metadata.offer]?.name||null});
      }
      if(q.action==='onboarding'){
        const id=String(q.id||'');if(q.token!==app.signature(id))return res.status(403).json({error:'Invalid link'});
        const l=await app.db.getById('advantage_leads',id);if(l?.status!=='paid')return res.status(403).json({error:'Purchase not confirmed'});
        await app.db.update('advantage_leads',id,{onboarding_at:new Date().toISOString()});return res.json({url:CALL});
      }
      // Read-only readiness check: no payment sessions or test leads are created.
      return res.json(await app.health());
    }
    if(req.method!=='POST')return res.status(405).end();
    let b=req.body||{};if(typeof b==='string')b=JSON.parse(b);
    if(b.action==='pause'){
      if(!require('./_auth').verifyToken(req))return res.status(401).json({error:'Unauthorized'});
      await app.db.update('advantage_leads',String(b.id),{followups_paused:true});return res.json({ok:true});
    }
    if(b.website)return res.json({ok:true});
    if(b.action!=='qualify')await app.rate((req.headers['x-forwarded-for']?.split(',')[0]||req.socket?.remoteAddress||'unknown')+':'+String(b.action));
    if(b.action==='capture')return res.status(201).json(await app.capture(b));
    if(b.action==='checkout')return res.json(await app.checkout(b));
    if(b.action==='qualify')return res.json(await app.qualify(b));
    return res.status(400).json({error:'Unknown action'});
  }catch(e){console.error('AI Advantage:',e.message);return res.status(e.status||503).json({error:e.status?e.message:'We could not complete that step. Please try again or email support@tmitechai.com.'});}
};
