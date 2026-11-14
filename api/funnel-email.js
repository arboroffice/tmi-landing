const crypto=require('crypto');
const {production}=require('./_advantage');
function verify(raw,headers,secret){
 const id=headers['svix-id'],ts=headers['svix-timestamp'],signature=headers['svix-signature'];if(!id||!ts||!signature||!secret||!Number.isFinite(Number(ts))||Math.abs(Date.now()/1000-Number(ts))>300)return false;
 const key=Buffer.from(secret.replace(/^whsec_/,''),'base64'),expected=crypto.createHmac('sha256',key).update(id+'.'+ts+'.'+raw).digest();
 return signature.split(' ').some(s=>{const v=s.split(',');if(v[0]!=='v1')return false;try{const got=Buffer.from(v[1],'base64');return got.length===expected.length&&crypto.timingSafeEqual(got,expected);}catch{return false;}});
}
async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 try{
  let raw=req.rawBody||req.body;if(!Buffer.isBuffer(raw)&&typeof raw!=='string'){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>1048576)return res.status(413).end();chunks.push(c);}raw=Buffer.concat(chunks);}
  const body=Buffer.isBuffer(raw)?raw.toString('utf8'):raw,app=production(),config=await app.db.getById('advantage_config','email_webhook');
  if(!config?.secret||!verify(body,req.headers,app.unseal(config.secret)))return res.status(401).end();
  const event=JSON.parse(body);event.id=req.headers['svix-id'];await app.sales.emailEvent(event);return res.json({ok:true});
 }catch(e){console.error('funnel email delivery failed',e.name);return res.status(500).json({error:'Retry delivery'});}
}
module.exports=handler;module.exports.config={api:{bodyParser:false}};module.exports.verify=verify;