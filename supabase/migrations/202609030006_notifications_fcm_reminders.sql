-- =============================================================================
-- Mon Bilan — Phase 6: FCM push reminders
-- =============================================================================

-- ------------------------------------------------------------
-- Scheduler + HTTP caller for Edge Functions
-- ------------------------------------------------------------

-- Supabase hosted projects support these extensions.
-- If not available in the local dev environment, migrations should still run in the target DB.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ------------------------------------------------------------
-- Push token storage (no authentication / single household)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- "web" for this app in browsers. Later: "android" (Phase 7).
  platform text NOT NULL DEFAULT 'web',
  fcm_token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_seen_at timestamptz,
  CONSTRAINT push_devices_platform_nonempty CHECK (length(trim(platform)) > 0),
  CONSTRAINT push_devices_token_nonempty CHECK (length(trim(fcm_token)) > 0),
  CONSTRAINT push_devices_platform_unique UNIQUE (platform),
  CONSTRAINT push_devices_fcm_token_unique UNIQUE (fcm_token)
);

CREATE TRIGGER trg_push_devices_updated_at
BEFORE UPDATE ON public.push_devices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX push_devices_enabled_idx ON public.push_devices (enabled);

-- ------------------------------------------------------------
-- Reminder preferences (single row, no auth ownership)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT false,
  church_sunday_income_enabled boolean NOT NULL DEFAULT true,
  church_withdrawal_check_enabled boolean NOT NULL DEFAULT true,
  business_daily_enabled boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Africa/Douala',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT notification_preferences_profile_key_unique UNIQUE (profile_key),
  CONSTRAINT notification_preferences_timezone_nonempty CHECK (length(trim(timezone)) > 0)
);

CREATE TRIGGER trg_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.notification_preferences (
  profile_key,
  enabled,
  church_sunday_income_enabled,
  church_withdrawal_check_enabled,
  business_daily_enabled,
  timezone
)
VALUES ('default', false, true, true, true, 'Africa/Douala')
ON CONFLICT (profile_key) DO NOTHING;

-- ------------------------------------------------------------
-- Deduplication + lightweight sent log (prune later)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key text NOT NULL UNIQUE,
  reminder_type text NOT NULL,
  domain text NOT NULL,
  scheduled_for_date date NOT NULL,
  target_route text NOT NULL,
  status text NOT NULL DEFAULT 'sending',
  fcm_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  sent_at timestamptz,
  CONSTRAINT notification_logs_status_check CHECK (status IN ('sending', 'sent', 'failed'))
);

CREATE INDEX notification_logs_sent_idx ON public.notification_logs (sent_at DESC);
CREATE INDEX notification_logs_scheduled_idx ON public.notification_logs (scheduled_for_date DESC);

-- ------------------------------------------------------------
-- RLS + grants for tables written by the frontend
-- ------------------------------------------------------------

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_push_devices ON public.push_devices;
CREATE POLICY allow_all_push_devices
ON public.push_devices
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_notification_preferences ON public.notification_preferences;
CREATE POLICY allow_all_notification_preferences
ON public.notification_preferences
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.push_devices,
  public.notification_preferences
TO anon, authenticated;

