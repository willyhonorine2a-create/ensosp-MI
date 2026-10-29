begin;
create or replace function public.check_individual_quantity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if old.tracking_mode='individual' and new.tracking_mode<>'individual' then raise exception 'Le suivi individuel ne peut pas être désactivé'; end if;
  if (old.quantity_mi+old.quantity_cs)>0 and ((new.tracking_mode<>old.tracking_mode) or (new.merged_into is distinct from old.merged_into)) then
   raise exception 'Avant une conversion ou un regroupement, remettez la répartition en À localiser puis affectez les appareils individuellement.';
  end if;
 end if;
 if new.tracking_mode='individual' and row(new.quantity,new.quantity_mi,new.quantity_cs) is distinct from
  (select row(count(*)::integer,count(*) filter(where physical_location='MI')::integer,count(*) filter(where physical_location='CS')::integer) from public.stock_devices where asset_id=new.id and retired_at is null) then
  raise exception 'Le stock et les emplacements sont calculés à partir des appareils.';
 end if;
 return new;
end;
$$;
create or replace function public.update_device_count()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent uuid;
begin
 parent:=case when TG_OP='DELETE' then old.asset_id else new.asset_id end;
 perform id from public.stock_assets where id=parent for update;
 update public.stock_assets set
 quantity=(select count(*) from public.stock_devices where asset_id=parent and retired_at is null),
 quantity_mi=(select count(*) from public.stock_devices where asset_id=parent and retired_at is null and physical_location='MI'),
 quantity_cs=(select count(*) from public.stock_devices where asset_id=parent and retired_at is null and physical_location='CS'),
 quantity_defaulted=false where id=parent and tracking_mode='individual';
 return null;
end;
$$;
revoke all on function public.check_individual_quantity(),public.update_device_count() from public,anon,authenticated;
commit;
