// Dedicated TMI Supabase gateway. The token is server-only; no browser key is
// granted data access. Supabase's service key stays inside its Edge Function.
const crypto=require('crypto');
function createStore({url=process.env.TMI_DATABASE_URL,token=process.env.TMI_DATABASE_TOKEN,fetcher=fetch}={}){
  async function call(operation,namespace,id=null,payload={},options={}){
    if(!url||!token)throw new Error('TMI database is not configured');
    const r=await fetcher(url,{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({operation,namespace,id,payload,options}),signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('TMI database request failed ('+r.status+')');
    return r.json();
  }
  return {
    getById:(c,id)=>id?call('get',c,String(id)):Promise.resolve(null),
    insert:(c,d)=>call('put',c,String(d.id||crypto.randomUUID()),d),
    update:(c,id,d)=>call('merge',c,String(id),d),
    remove:(c,id)=>call('delete',c,String(id)),
    list:(c,o={})=>call('list',c,null,{},o),
    findOne:async(c,f,v)=>(await call('list',c,null,{},{where:[[f,'==',v]],limit:1}))[0]||null,
    claim:(id,seconds)=>call('claim','advantage_locks',id,{seconds}),
  };
}
module.exports=Object.assign(createStore(),{createStore});
