// TOKEN_HASH is installed with a SHA-256 digest, never the bearer secret.
const TOKEN_HASH = 'e9c065e7763d81615653c9c29049f2e92d740f09707ca5b95c4a84f519f15cd4';
Deno.serve(async (req: Request) => {
  if(req.method !== 'POST') return new Response(null,{status:405});
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(!token||digest!==TOKEN_HASH)return new Response(null,{status:401});
  try {
    const raw=await req.text();if(raw.length>262144)return new Response(null,{status:413});
    const b=JSON.parse(raw),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/tmi_store',{
      method:'POST',headers:{'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({p_operation:b.operation,p_namespace:b.namespace,p_id:b.id||null,p_payload:b.payload||{},p_options:b.options||{}})
    });
    if(!r.ok){console.error('TMI store RPC failed',r.status);return new Response(JSON.stringify({error:'Database operation failed'}),{status:503,headers:{'Content-Type':'application/json'}});}
    return new Response(await r.text(),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return new Response(null,{status:400});}
});
