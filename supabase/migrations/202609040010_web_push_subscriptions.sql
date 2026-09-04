-- Extend push_devices for standard Web Push (endpoint + p256dh + auth)
-- while keeping existing Firebase rows as provider = 'firebase'.

ALTER TABLE public.push_devices
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'firebase',
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS p256dh text,
  ADD COLUMN IF NOT EXISTS auth text;

ALTER TABLE public.push_devices
  DROP CONSTRAINT IF EXISTS push_devices_platform_unique;

ALTER TABLE public.push_devices
  DROP CONSTRAINT IF EXISTS push_devices_token_nonempty;

ALTER TABLE public.push_devices
  ALTER COLUMN fcm_token DROP NOT NULL;

ALTER TABLE public.push_devices
  DROP CONSTRAINT IF EXISTS push_devices_provider_check;

ALTER TABLE public.push_devices
  ADD CONSTRAINT push_devices_provider_check
    CHECK (provider IN ('webpush', 'firebase'));

ALTER TABLE public.push_devices
  ADD CONSTRAINT push_devices_token_nonempty
    CHECK (fcm_token IS NULL OR length(trim(fcm_token)) > 0);

ALTER TABLE public.push_devices
  DROP CONSTRAINT IF EXISTS push_devices_webpush_subscription_check;

ALTER TABLE public.push_devices
  ADD CONSTRAINT push_devices_webpush_subscription_check
    CHECK (
      provider <> 'webpush'
      OR (
        endpoint IS NOT NULL AND length(trim(endpoint)) > 0
        AND p256dh IS NOT NULL AND length(trim(p256dh)) > 0
        AND auth IS NOT NULL AND length(trim(auth)) > 0
      )
    );

ALTER TABLE public.push_devices
  DROP CONSTRAINT IF EXISTS push_devices_firebase_token_check;

ALTER TABLE public.push_devices
  ADD CONSTRAINT push_devices_firebase_token_check
    CHECK (
      provider <> 'firebase'
      OR (fcm_token IS NOT NULL AND length(trim(fcm_token)) > 0)
    );

ALTER TABLE public.push_devices
  DROP CONSTRAINT IF EXISTS push_devices_endpoint_unique;

ALTER TABLE public.push_devices
  ADD CONSTRAINT push_devices_endpoint_unique UNIQUE (endpoint);

CREATE INDEX IF NOT EXISTS push_devices_provider_enabled_idx
  ON public.push_devices (provider, enabled);
