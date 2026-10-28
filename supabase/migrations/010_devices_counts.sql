begin;
create or replace function public.check_individual_quantity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and old.tracking_mode='individual' and new.tracking_mode<>'individual' then raise exception 'Le suivi individuel ne peut pas être désactivé'; end if;
 if new.tracking_mode='individual' and new.quantity<>(select count(*) from public.stock_devices where asset_id=new.id and retired_at is null) then raise exception 'Le stock est calculé à partir des appareils. Ajoutez ou retirez un appareil.'; end if;
 return new;
end;
$$;
revoke all on function public.check_individual_quantity() from public,anon,authenticated;
drop trigger if exists individual_quantity on public.stock_assets;
create trigger individual_quantity before insert or update on public.stock_assets for each row execute function public.check_individual_quantity();
create or replace function public.update_device_count()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent uuid;
begin
 parent:=case when TG_OP='DELETE' then old.asset_id else new.asset_id end;
 perform id from public.stock_assets where id=parent for update;
 update public.stock_assets set quantity=(select count(*) from public.stock_devices where asset_id=parent and retired_at is null),quantity_defaulted=false where id=parent and tracking_mode='individual';
 return null;
end;
$$;
revoke all on function public.update_device_count() from public,anon,authenticated;
drop trigger if exists device_count on public.stock_devices;
create trigger device_count after insert or update or delete on public.stock_devices for each row execute function public.update_device_count();
commit;
