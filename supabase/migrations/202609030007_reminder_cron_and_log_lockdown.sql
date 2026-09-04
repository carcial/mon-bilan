-- Phase 6: lock notification logs to the server, schedule one daily evaluation.
-- Africa/Douala is UTC+1 year-round (no DST). 19:00 local = 18:00 UTC.

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_logs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invoke_send_push_reminders()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT ds.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'project_url'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO v_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name IN ('reminder_invoke_key', 'publishable_key', 'anon_key')
  ORDER BY CASE ds.name
    WHEN 'reminder_invoke_key' THEN 0
    WHEN 'publishable_key' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_url IS NULL OR length(trim(v_url)) = 0 OR v_key IS NULL OR length(trim(v_key)) = 0 THEN
    RAISE WARNING 'invoke_send_push_reminders skipped: store Vault secrets project_url and reminder_invoke_key';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('type', 'cron')
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_send_push_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_send_push_reminders() FROM anon, authenticated;

DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'send-push-reminders-daily'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

SELECT cron.schedule(
  'send-push-reminders-daily',
  '0 18 * * *',
  $$SELECT public.invoke_send_push_reminders();$$
);
