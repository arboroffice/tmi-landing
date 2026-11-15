const createContact=require('./_website-contact');
const ALLOWED=new Set(['https://www.tmitechai.com','https://tmitechai.com','https://admin.tmitechai.com']);
module.exports=async(req,res)=>{
 const origin=req.headers.origin||'';if(origin&&ALLOWED.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Cache-Control','no-store');
 if(origin&&!ALLOWED.has(origin))return res.status(403).json({error:'Origin not allowed'});
 if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 try{
  const raw=req.body;if(typeof raw==='string'&&Buffer.byteLength(raw)>16000)return res.status(413).json({error:'Request too large'});
  let body;try{body=typeof raw==='string'?JSON.parse(raw):raw;}catch{return res.status(400).json({error:'Invalid request'});}
  const app=require('./_advantage').production(),{Resend}=require('resend');
  const submit=createContact({db:app.db,mail:new Resend(process.env.RESEND_API_KEY),sender:app.sales.sender,rate:app.rate});
  const result=await submit(body,(req.headers['x-forwarded-for']||'').split(',')[0]||req.socket?.remoteAddress||'unknown');return res.status(200).json(result);
 }catch(e){console.error('Website contact failed',e.status||500);return res.status(e.status||503).json({ok:false,error:e.status?e.message:'We could not send this request. Please try again.'});}
};
