begin;
create table public.inventory_reports (
 id uuid primary key default gen_random_uuid(),
 reference bigint generated always as identity unique,
 request_id uuid not null unique,
 submission_hash text not null,
 vehicle_id text not null references public.inventory_vehicles(id),
 vehicle_name text not null, registration text not null, center text not null,
 vehicle_revision integer not null,
 reporter_name text not null default '', reporter_contact text not null default '',
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 20),
 photos jsonb not null default '[]' check(jsonb_typeof(photos)='array' and jsonb_array_length(photos)<=3),
 status text not null default 'new' check(status in ('new','in_progress','resolved')),
 revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index inventory_reports_recent on public.inventory_reports(created_at desc);
create table public.inventory_report_events (
 id bigint generated always as identity primary key,
 report_id uuid not null references public.inventory_reports(id),
 actor_id uuid references auth.users(id),
 old_status text not null,new_status text not null,comment text not null,
 created_at timestamptz not null default now()
);
create table public.inventory_report_mail (
 report_id uuid primary key references public.inventory_reports(id),
 state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 lease_id uuid, sent_at timestamptz, last_error text
);
create table public.inventory_report_limits (
 bucket text primary key, count integer not null, expires_at timestamptz not null
);
alter table public.inventory_reports enable row level security;
alter table public.inventory_report_events enable row level security;
alter table public.inventory_report_mail enable row level security;
alter table public.inventory_report_limits enable row level security;
revoke all on public.inventory_reports,public.inventory_report_events,public.inventory_report_mail,public.inventory_report_limits from public,anon,authenticated;
grant select on public.inventory_reports,public.inventory_report_events,public.inventory_report_mail to authenticated;
create policy report_admin_read on public.inventory_reports for select to authenticated using(public.stock_is_admin());
create policy report_events_admin_read on public.inventory_report_events for select to authenticated using(public.stock_is_admin());
create policy report_mail_admin_read on public.inventory_report_mail for select to authenticated using(public.stock_is_admin());
grant all on public.inventory_reports,public.inventory_report_events,public.inventory_report_mail,public.inventory_report_limits to service_role;
grant usage,select on sequence public.inventory_reports_reference_seq,public.inventory_report_events_id_seq to service_role;

-- Aucune écriture publique directe : seul le serveur vérifie le CAPTCHA et appelle ces RPC.
create function public.take_inventory_report_quota(p_key text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; stamp text:=to_char(now() at time zone 'UTC','YYYY-MM-DD-HH');
begin
 if p_key !~ '^[a-f0-9]{64}$' then raise exception 'Clé invalide'; end if;
 delete from public.inventory_report_limits where expires_at<now();
 insert into public.inventory_report_limits(bucket,count,expires_at) values('ip:'||p_key||':'||stamp,1,now()+interval '2 hours')
 on conflict(bucket) do update set count=public.inventory_report_limits.count+1 returning count into n;
 if n>10 then return false; end if;
 insert into public.inventory_report_limits(bucket,count,expires_at) values('global:'||stamp,1,now()+interval '2 hours')
 on conflict(bucket) do update set count=public.inventory_report_limits.count+1 returning count into n;
 return n<=100;
end; $$;

create function public.submit_inventory_report(p_request_id uuid,p_hash text,p_vehicle_id text,p_revision integer,p_name text,p_contact text,p_items jsonb,p_photos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.inventory_vehicles; r public.inventory_reports; line jsonb; section jsonb; equipment jsonb; photo jsonb;
begin
 -- Même requête réémise après une coupure : même numéro, sans doublon ni second mail.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into r from public.inventory_reports where request_id=p_request_id;
 if found then
  if r.submission_hash<>p_hash then raise exception 'Requête différente' using errcode='22023'; end if;
  return jsonb_build_object('reference',r.reference,'existing',true);
 end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_name is null or length(p_name)>80 or p_contact is null or length(p_contact)>160 then raise exception 'Coordonnées invalides'; end if;
 select * into v from public.inventory_vehicles where id=p_vehicle_id for share;
 if not found then raise exception 'Engin introuvable'; end if;
 if v.revision is distinct from p_revision then raise exception 'La fiche ou l’affectation a changé. Rechargez la page.' using errcode='40001'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'Matériels invalides'; end if;
 for line in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(line) is distinct from 'object' or coalesce(line->>'kind','') not in ('missing','broken','faulty','other')
   or jsonb_typeof(line->'quantity') is distinct from 'number' or (line->>'quantity') !~ '^[1-9][0-9]{0,3}$'
   or coalesce(length(trim(line->>'designation')),0) not between 1 and 200
   or coalesce(length(trim(line->>'section')),0) not between 1 and 120
   or coalesce(length(trim(line->>'description')),0) not between 3 and 1500 then raise exception 'Ligne invalide'; end if;
  if line->>'sectionId' is not null then
   select value into section from jsonb_array_elements(v.sheet->'sections') where value->>'id'=line->>'sectionId';
   if section is null then raise exception 'Compartiment absent de la fiche'; end if;
   if not exists(select 1 from jsonb_array_elements(section->'items') where value->>'designation'=line->>'designation') then raise exception 'Matériel absent de la fiche'; end if;
  end if;
 end loop;
 if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos)>3 then raise exception 'Photos invalides'; end if;
 for photo in select value from jsonb_array_elements(p_photos) loop
  if coalesce(photo->>'path','') !~ ('^'||p_request_id::text||'/[a-f0-9-]+\.(jpg|png|webp)$') then raise exception 'Chemin photo invalide'; end if;
 end loop;
 insert into public.inventory_reports(request_id,submission_hash,vehicle_id,vehicle_name,registration,center,vehicle_revision,reporter_name,reporter_contact,items,photos)
 values(p_request_id,p_hash,v.id,v.name,v.registration,v.center,v.revision,trim(p_name),trim(p_contact),p_items,p_photos) returning * into r;
 insert into public.inventory_report_mail(report_id) values(r.id);
 return jsonb_build_object('reference',r.reference,'existing',false);
end; $$;

create function public.update_inventory_report(p_id uuid,p_revision integer,p_status text,p_comment text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.inventory_reports;
begin
 perform public.require_stock_admin();
 if p_status is null or p_status not in ('new','in_progress','resolved') or coalesce(length(trim(p_comment)),0) not between 3 and 1500 then raise exception 'Statut ou commentaire invalide'; end if;
 select * into r from public.inventory_reports where id=p_id for update;
 if not found then raise exception 'Signalement introuvable'; end if;
 if r.revision is distinct from p_revision then raise exception 'Signalement modifié. Rechargez avant de continuer.' using errcode='40001'; end if;
 update public.inventory_reports set status=p_status,revision=revision+1,updated_at=now() where id=p_id;
 insert into public.inventory_report_events(report_id,actor_id,old_status,new_status,comment) values(r.id,auth.uid(),r.status,p_status,trim(p_comment));
end; $$;

create function public.claim_inventory_report_mail()
returns setof public.inventory_report_mail language plpgsql security definer set search_path='' as $$
begin
 return query
 with jobs as (select report_id from public.inventory_report_mail where (state='pending' or state='sending') and available_at<=now() and attempts<8 order by available_at for update skip locked limit 5)
 update public.inventory_report_mail m set state='sending',attempts=m.attempts+1,lease_id=gen_random_uuid(),available_at=now()+interval '5 minutes'
 from jobs where m.report_id=jobs.report_id returning m.*;
end; $$;
create function public.finish_inventory_report_mail(p_report uuid,p_lease uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.inventory_report_mail set state=case when p_success then 'sent' when attempts>=8 then 'failed' else 'pending' end,
 sent_at=case when p_success then now() else null end,
 available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),last_error=case when p_success then null else left(p_error,200) end
 where report_id=p_report and lease_id=p_lease and state='sending';
end; $$;
-- Une tâche dont le dernier essai a été interrompu reste visible comme échouée.
create function public.expire_inventory_report_mail()
returns void language sql security definer set search_path='' as $$
 update public.inventory_report_mail set state='failed',last_error='Dernière tentative interrompue'
 where state='sending' and attempts>=8 and available_at<=now();
$$;
create function public.retry_inventory_report_mail(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_stock_admin();
 update public.inventory_report_mail set state='pending',attempts=0,available_at=now(),lease_id=null,last_error=null where report_id=p_id and state='failed';
end; $$;

revoke all on function public.take_inventory_report_quota(text),public.submit_inventory_report(uuid,text,text,integer,text,text,jsonb,jsonb),public.claim_inventory_report_mail(),public.finish_inventory_report_mail(uuid,uuid,boolean,text),public.expire_inventory_report_mail() from public,anon,authenticated;
grant execute on function public.take_inventory_report_quota(text),public.submit_inventory_report(uuid,text,text,integer,text,text,jsonb,jsonb),public.claim_inventory_report_mail(),public.finish_inventory_report_mail(uuid,uuid,boolean,text),public.expire_inventory_report_mail() to service_role;
revoke all on function public.update_inventory_report(uuid,integer,text,text),public.retry_inventory_report_mail(uuid) from public,anon;
grant execute on function public.update_inventory_report(uuid,integer,text,text),public.retry_inventory_report_mail(uuid) to authenticated;
commit;
