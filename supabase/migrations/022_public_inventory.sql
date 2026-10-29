begin;
create table public.inventory_vehicles (
 id text primary key default gen_random_uuid()::text,
 name text not null check(length(trim(name)) between 1 and 100),
 registration text not null check(length(trim(registration)) between 1 and 40),
 center text not null check(length(trim(center)) between 1 and 80),
 sheet jsonb,
 revision integer not null default 1,
 check(sheet is null or (jsonb_typeof(sheet)='object' and jsonb_typeof(sheet->'sections')='array' and jsonb_typeof(sheet->'photos')='array'))
);
create unique index inventory_registration_unique on public.inventory_vehicles(upper(trim(registration)));
create table public.inventory_events (
 id bigint generated always as identity primary key,
 vehicle_id text not null references public.inventory_vehicles(id),
 actor_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 reason text not null,
 before_data jsonb,
 after_data jsonb not null
);
alter table public.inventory_vehicles enable row level security;
alter table public.inventory_events enable row level security;
revoke all on public.inventory_vehicles,public.inventory_events from anon,authenticated;
grant select on public.inventory_vehicles,public.inventory_events to anon,authenticated;
create policy public_inventory_read on public.inventory_vehicles for select to anon,authenticated using(true);
-- L'identité des administrateurs reste privée.
create policy inventory_audit_admin on public.inventory_events for select to authenticated using(public.stock_is_admin());
create function public.save_inventory_vehicle(p_id text,p_expected_revision integer,p_name text,p_registration text,p_center text,p_sheet jsonb,p_reason text)
returns text language plpgsql security definer set search_path='' as $$
declare previous public.inventory_vehicles; current_row public.inventory_vehicles; result_id text; compartment jsonb; item jsonb; photo jsonb;
begin
 perform public.require_stock_admin();
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Un motif de 3 à 500 caractères est requis'; end if;
 if p_sheet is not null then
  if jsonb_typeof(p_sheet)<>'object' or jsonb_typeof(p_sheet->'sections') is distinct from 'array' or jsonb_typeof(p_sheet->'photos') is distinct from 'array' then raise exception 'Fiche invalide'; end if;
  for compartment in select value from jsonb_array_elements(p_sheet->'sections') loop
   if coalesce(length(trim(compartment->>'label')),0)=0 or jsonb_typeof(compartment->'items') is distinct from 'array' then raise exception 'Compartiment invalide'; end if;
   for item in select value from jsonb_array_elements(compartment->'items') loop
    if coalesce(length(trim(item->>'designation')),0)=0 or jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity') !~ '^[0-9]+$' then raise exception 'Matériel ou quantité invalide'; end if;
   end loop;
  end loop;
  for photo in select value from jsonb_array_elements(p_sheet->'photos') loop
   if coalesce(photo->>'src','') !~ '^/inventaire/photos/[a-zA-Z0-9_.-]+$' then raise exception 'Photo invalide'; end if;
  end loop;
 end if;
 if p_id is null then
  insert into public.inventory_vehicles(name,registration,center,sheet) values(trim(p_name),trim(p_registration),trim(p_center),p_sheet) returning * into current_row;
 else
  select * into previous from public.inventory_vehicles where id=p_id for update;
  if not found then raise exception 'Engin introuvable'; end if;
  if previous.revision<>p_expected_revision or p_expected_revision is null then raise exception 'La fiche a changé. Rechargez avant de modifier.' using errcode='40001'; end if;
  update public.inventory_vehicles set name=trim(p_name),registration=trim(p_registration),center=trim(p_center),sheet=p_sheet,revision=revision+1 where id=p_id returning * into current_row;
 end if;
 insert into public.inventory_events(vehicle_id,actor_id,reason,before_data,after_data) values(current_row.id,auth.uid(),trim(p_reason),case when p_id is null then null else to_jsonb(previous) end,to_jsonb(current_row));
 return current_row.id;
end;
$$;
revoke all on function public.save_inventory_vehicle(text,integer,text,text,text,jsonb,text) from public,anon;
grant execute on function public.save_inventory_vehicle(text,integer,text,text,text,jsonb,text) to authenticated;
commit;
