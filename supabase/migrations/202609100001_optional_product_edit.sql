begin;
-- Match the nullable product already supported by imports, preserving access
-- and optimistic concurrency. Never substitute an arbitrary product.
do $migration$
declare
  target regprocedure := 'public.update_opportunity_details_v2(uuid,integer,uuid,uuid,uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,date,text)'::regprocedure;
  definition text := pg_get_functiondef(target);
begin
  if position('if p_product_id is not null and product_name is null then' in definition) > 0
     and position('coalesce(product_name || '' - '', '''')' in definition) > 0 then return; end if;
  if position('if product_name is null then' in definition) = 0
     or position('title = product_name || '' - '' || split_part(clean_name, '' '', 1)' in definition) = 0 then
    raise exception 'Unexpected update_opportunity_details_v2 definition; no changes applied';
  end if;
  definition := replace(definition, 'if product_name is null then',
    'if p_product_id is not null and product_name is null then');
  definition := replace(definition,
    'title = product_name || '' - '' || split_part(clean_name, '' '', 1)',
    'title = coalesce(product_name || '' - '', '''') || split_part(clean_name, '' '', 1)');
  execute definition;
end;
$migration$;
notify pgrst, 'reload schema';
commit;
