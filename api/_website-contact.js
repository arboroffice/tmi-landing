const crypto=require('crypto');
const OWNER='mia@tmitechai.com';
const clip=(v,n)=>String(v||'').trim().slice(0,n);
module.exports=function createContact({db,mail,sender,rate}){
 return async function submit(body,ip){
  if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(new Error('Invalid request.'),{status:400});
  if(body.website||body._honey||body._gotcha)return {ok:true};
  const email=clip(body.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Object.assign(new Error('Enter a valid email address.'),{status:400});
  const name=clip(body.name,150),company=clip(body.company,200),message=clip(body.desired_outcome||body.message,2000),intent=clip(body.crm_tag,60)||'website_inquiry';
  const requestId=clip(body.request_id,100)||crypto.randomUUID();
  const id=crypto.createHash('sha256').update(JSON.stringify([requestId,email,name,company,message,intent])).digest('hex');
  const previous=await db.getById('site_submissions',id);if(previous?.notification_id)return {ok:true,notified:true};
  await rate('website-contact:'+ip);
  const row={id,intent,name,email,company,message,site:'tmitechai.com',source:'website',created_at:previous?.created_at||new Date().toISOString(),notification_status:'pending',attribution:{}};
  for(const k of ['page_url','page_path','referrer','utm_source','utm_medium','utm_campaign','utm_content','utm_term','first_source','first_medium','first_campaign','first_referrer','first_landing_page','first_seen_at'])if(body[k])row.attribution[k]=clip(body[k],500);
  await db.insert('site_submissions',row);
  try{
   const text=['New TMI website contact request','Name: '+(name||'Not supplied'),'Email: '+email,'Company: '+(company||'Not supplied'),'Interest: '+intent,'','Message:',message||'Please contact this person about their inquiry.','','Page: '+(row.attribution.page_url||row.attribution.page_path||'Not supplied')].join('\n');
   const sent=await mail.emails.send({from:await sender(),to:OWNER,replyTo:email,subject:('New TMI contact request: '+(name||email)+(company?' — '+company:'')).replace(/[\r\n]/g,' ').slice(0,200),text},{idempotencyKey:'website-contact/'+id});
   if(sent.error||!sent.data?.id)throw new Error('Email notification was not accepted');
   await db.update('site_submissions',id,{notification_status:'accepted',notification_id:sent.data.id,notification_at:new Date().toISOString()});
   return {ok:true,notified:true};
  }catch(e){await db.update('site_submissions',id,{notification_status:'pending'}).catch(()=>{});throw Object.assign(new Error('Your request is saved, but the email notification could not be sent. Please try again.'),{status:503});}
 };
};
