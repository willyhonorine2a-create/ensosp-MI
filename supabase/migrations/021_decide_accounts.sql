begin;
create or replace function public.decide_stock_account(p_user_id uuid,p_status text,p_role text,p_expected_status text,p_expected_role text,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.stock_access_requests; member_role text; payload jsonb; previous public.stock_access_events;
begin
 -- Sérialise les changements de droits et revérifie le rôle après le verrou.
 perform pg_catalog.pg_advisory_xact_lock(782643901);
 perform public.require_stock_admin();
 if p_user_id is null or p_user_id=auth.uid() or p_request_id is null or p_status is null or p_status not in ('approved','rejected') or (p_status='approved' and (p_role is null or p_role not in ('admin','reader'))) then raise exception 'Décision invalide. Vous ne pouvez pas modifier votre propre accès.'; end if;
 payload:=jsonb_build_array(p_user_id,p_status,p_role,p_expected_status,p_expected_role);
 select * into previous from public.stock_access_events where actor_id=auth.uid() and request_id=p_request_id;
 if found then
  if previous.payload<>payload then raise exception 'Identifiant de requête déjà utilisé'; end if;
  return;
 end if;
 select * into r from public.stock_access_requests where user_id=p_user_id for update;
 if not found then raise exception 'Demande introuvable'; end if;
 select role into member_role from public.stock_members where user_id=p_user_id for update;
 if row(r.status,member_role) is distinct from row(p_expected_status,p_expected_role) then raise exception 'Ce compte a changé. Actualisez la liste.'; end if;
 if p_status='approved' and not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then raise exception 'Cette personne doit confirmer son adresse e-mail avant approbation.'; end if;
 if member_role='admin' and (p_status='rejected' or p_role<>'admin') and (select count(*) from public.stock_members where role='admin')<=1 then raise exception 'Le dernier administrateur doit être conservé'; end if;
 if p_status='approved' then
  insert into public.stock_members(user_id,role) values(p_user_id,p_role) on conflict(user_id) do update set role=excluded.role;
 else delete from public.stock_members where user_id=p_user_id;
 end if;
 update public.stock_access_requests set status=p_status,decided_at=now(),decided_by=auth.uid() where user_id=p_user_id;
 insert into public.stock_access_events(actor_id,target_id,request_id,payload,before_data,after_data)
 values(auth.uid(),p_user_id,p_request_id,payload,jsonb_build_array(r.status,member_role),jsonb_build_array(p_status,case when p_status='approved' then p_role end));
end;
$$;
revoke all on function public.decide_stock_account(uuid,text,text,text,text,uuid) from public,anon;
grant execute on function public.decide_stock_account(uuid,text,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
