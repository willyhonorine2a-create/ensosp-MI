-- OPTIONNEL : exécuter uniquement sur le projet de TEST après activation des mails.
-- Dans Supabase Vault, créer préalablement :
-- inventory_report_worker_url = URL HTTPS de la fonction report-notifications
-- inventory_report_worker_secret = même secret que REPORT_WORKER_SECRET
-- Ne jamais copier ces valeurs dans le dépôt ou le chat.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='inventory_report_worker_url' and decrypted_secret like 'https://%/functions/v1/report-notifications')
 or not exists(select 1 from vault.decrypted_secrets where name='inventory_report_worker_secret' and length(decrypted_secret)>=32) then
  raise exception 'Configurer inventory_report_worker_url et inventory_report_worker_secret dans Supabase Vault avant la planification';
 end if;
end;
$$;
select cron.schedule('inventory-report-notifications','* * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='inventory_report_worker_url'),
  headers := jsonb_build_object('Content-Type','application/json','x-report-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='inventory_report_worker_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
 );
$job$);
commit;
