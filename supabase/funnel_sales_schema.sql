create or replace function public.tmi_store(p_operation text, p_namespace text, p_id text default null,
  p_payload jsonb default '{}'::jsonb, p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare result jsonb; claimed text; item jsonb;
begin
  if p_namespace not in ('advantage_leads','advantage_config','advantage_jobs','advantage_deliveries',
    'advantage_locks','site_submissions','suppression','precall_bookings','leads','applications','activities','site_events','funnel_messages','funnel_tasks','funnel_reps','funnel_events')
    then raise exception 'Unknown collection'; end if;
  if p_operation='get' then
    select data || jsonb_build_object('id',id) into result from public.tmi_records where namespace=p_namespace and id=p_id;
  elsif p_operation in ('put','merge') then
    if p_id is null or length(p_id)>200 or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid record'; end if;
    item=p_payload-'id';
    if p_operation='put' and not(item ? 'created_at') then item=item || jsonb_build_object('created_at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')); end if;
    insert into public.tmi_records(namespace,id,data) values(p_namespace,p_id,item)
    on conflict(namespace,id) do update set data=case when p_operation='merge' then tmi_records.data || excluded.data else excluded.data end
    returning data || jsonb_build_object('id',id) into result;
  elsif p_operation='delete' then
    delete from public.tmi_records where namespace=p_namespace and id=p_id; result='true'::jsonb;
  elsif p_operation='claim' and p_namespace='advantage_locks' then
    insert into public.tmi_records(namespace,id,data) values(p_namespace,p_id,
      jsonb_build_object('until',extract(epoch from clock_timestamp())*1000+least(greatest((p_payload->>'seconds')::int,1),86400)*1000))
    on conflict(namespace,id) do update set data=excluded.data
      where (tmi_records.data->>'until')::numeric <= extract(epoch from clock_timestamp())*1000
    returning id into claimed;
    result=to_jsonb(claimed is not null);
  elsif p_operation='list' then
    select coalesce(jsonb_agg(row_data),'[]'::jsonb) into result from (
      select r.data || jsonb_build_object('id',r.id) as row_data from public.tmi_records r
      where r.namespace=p_namespace and not exists (
        select 1 from jsonb_array_elements(coalesce(p_options->'where','[]'::jsonb)) w
        where not coalesce(case w->>1
          when '==' then r.data->(w->>0)=w->2
          when '!=' then r.data->(w->>0)<>w->2
          when '>=' then r.data->(w->>0)>=w->2
          when '<=' then r.data->(w->>0)<=w->2
          when '>' then r.data->(w->>0)>w->2
          when '<' then r.data->(w->>0)<w->2
          else false end,false))
      order by case when coalesce(p_options->>'ascending','true')<>'false' then r.data->(p_options->>'order') end asc nulls last,
        case when p_options->>'ascending'='false' then r.data->(p_options->>'order') end desc nulls last,r.created_at asc,r.id asc
      limit least(greatest(coalesce((p_options->>'limit')::int,1000),1),50000)
    ) selected;
  else raise exception 'Unknown operation'; end if;
  return result;
end $$;
revoke all on function public.tmi_store(text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.tmi_store(text,text,text,jsonb,jsonb) to service_role;

