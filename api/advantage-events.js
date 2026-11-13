// Stripe and QStash both sign the original bytes. Never parse before verification.
const {production,APP}=require('./_advantage');
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  try{
    let raw=req.rawBody||req.body;
    if(!Buffer.isBuffer(raw)&&typeof raw!=='string'){
      const chunks=[];for await(const c of req){chunks.push(c);if(chunks.reduce((n,b)=>n+b.length,0)>1048576)return res.status(413).end();}raw=Buffer.concat(chunks);
    }
    const body=Buffer.isBuffer(raw)?raw.toString('utf8'):raw, app=production();
    if(req.headers['stripe-signature']){
      const config=await app.db.getById('advantage_config','stripe');if(!config?.secret)return res.status(400).end();
      let event;try{event=app.stripe.webhooks.constructEvent(raw,req.headers['stripe-signature'],app.unseal(config.secret));}catch{return res.status(400).send('Invalid signature');}
      await app.event(event);return res.json({received:true});
    }
    if(!req.headers['upstash-signature'])return res.status(401).end();
    const {Receiver}=require('@upstash/qstash');const receiver=new Receiver({currentSigningKey:process.env.QSTASH_CURRENT_SIGNING_KEY,nextSigningKey:process.env.QSTASH_NEXT_SIGNING_KEY});
    let valid=false;try{valid=await receiver.verify({signature:req.headers['upstash-signature'],body,url:APP+'/api/advantage-events'});}catch{}
    if(!valid)return res.status(401).end();const b=JSON.parse(body);await app.work(b.id,b.step);
    if(!String(b.id).startsWith('__')){const crypto=require('crypto');await app.db.update('advantage_jobs',crypto.createHash('sha256').update(b.id+':'+b.step).digest('hex'),{done:true,completed_at:new Date().toISOString()});}
    return res.json({ok:true});
  }catch(e){console.error('advantage-events:',e.message);return res.status(500).json({error:'Retry delivery'});}
}
module.exports=handler;
module.exports.config={api:{bodyParser:false}};
