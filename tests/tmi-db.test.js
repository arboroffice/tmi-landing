const assert=require('node:assert/strict');
const {createStore}=require('../api/_tmi-db');
(async()=>{
  const requests=[];
  const db=createStore({url:'https://example.invalid/store',token:'fixture-token',fetcher:async(url,options)=>{const b=JSON.parse(options.body);requests.push({url,...options,body:b});return {ok:true,json:async()=>b.operation==='list'?[{id:'one',email:'owner@example.test'}]:b.operation==='claim'?true:{id:b.id,...b.payload}};}});
  await db.insert('advantage_leads',{email:'owner@example.test'});assert.ok(requests[0].body.id);assert.equal(requests[0].headers.Authorization,'Bearer fixture-token');
  await db.update('advantage_leads','one',{status:'paid'});assert.equal(requests[1].body.operation,'merge');
  const found=await db.findOne('advantage_leads','email','owner@example.test');assert.equal(found.id,'one');assert.deepEqual(requests[2].body.options.where,[['email','==','owner@example.test']]);
  assert.equal(await db.claim('lock',90),true);assert.equal(requests[3].body.namespace,'advantage_locks');
  const failing=createStore({url:'https://example.invalid',token:'fixture-token',fetcher:async()=>({ok:false,status:503})});await assert.rejects(failing.getById('advantage_config','stripe'),/503/);
  await assert.rejects(createStore({url:'',token:''}).insert('advantage_leads',{}),/not configured/);
  console.log('TMI Supabase adapter: authenticated transport, generated IDs, merge, filters, claims and failure handling passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
