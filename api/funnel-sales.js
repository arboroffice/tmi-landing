const {production}=require('./_advantage');
const ORIGINS=new Set(['https://www.tmitechai.com','https://tmitechai.com','https://admin.tmitechai.com']);
module.exports=async(req,res)=>{
 const origin=req.headers.origin;if(origin&&ORIGINS.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(origin&&!ORIGINS.has(origin))return res.status(403).end();
 try{
  const app=production(),q=req.query||{},b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(req.method==='GET'&&q.action==='health')return res.json(await app.sales.health());
  if((req.method==='GET'&&q.action==='resume')||(req.method==='POST'&&b.action==='resume')){
    let p;try{p=require('jsonwebtoken').verify(String(q.ticket||b.ticket||''),process.env.JWT_SECRET);}catch{return res.status(403).json({error:'This link has expired. Please contact TMI.'});}
    if(p.kind!=='funnel_resume')return res.status(403).end();const l=await app.authorized(p.sub,q.ticket||b.ticket);return res.json({id:l.id,token:q.ticket||b.ticket,offer:l.offer,authority:l.authority||''});
  }
  if(req.method==='POST'&&['chat','handoff','history'].includes(b.action)){
    const l=await app.authorized(b.id,b.token);
    if(b.action==='history')return res.json({messages:(await app.db.list('funnel_messages',{where:[['lead_id','==',l.id]],order:'created_at',ascending:true,limit:60})).map(m=>({role:m.role,text:m.text}))});
    if(b.action==='handoff')return res.json(await app.sales.handoff(l,'Visitor requested a person'));
    return res.json(await app.sales.chat(l,b.message));
  }
  const actor=await app.sales.actor(req);
  if(req.method==='GET')return res.json(await app.sales.list(actor));
  if(req.method==='POST')return res.json(await app.sales.action(actor,b));
  return res.status(405).end();
 }catch(e){console.error('funnel sales request failed',e.name);return res.status(e.status||503).json({error:e.status?e.message:'TMI could not complete that step. Please try again.'});}
};