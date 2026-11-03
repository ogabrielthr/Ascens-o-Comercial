begin;

create or replace function app_private.default_opportunity_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_id is null then
    select source.id into new.source_id
    from public.lead_sources source
    where source.organization_id = new.organization_id
      and source.active
      and source.deleted_at is null
      and (source.code = 'active_prospecting' or lower(source.name) = 'prospecção ativa')
    order by (source.code = 'active_prospecting') desc, source.created_at
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_default_source on public.opportunities;
create trigger opportunities_default_source
before insert on public.opportunities
for each row execute function app_private.default_opportunity_source();

revoke execute on function app_private.default_opportunity_source() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
