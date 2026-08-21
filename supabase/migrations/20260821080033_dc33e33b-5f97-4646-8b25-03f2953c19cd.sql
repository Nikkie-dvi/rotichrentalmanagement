SELECT cron.unschedule('tenant-credit-watch-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tenant-credit-watch-daily');

SELECT cron.schedule(
  'tenant-credit-watch-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--1484cfc1-3b68-45a7-a86a-a77d9d6bdfab.lovable.app/api/public/hooks/credit-watch',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1amRmYWtobmRjZXFtcnBzeHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NjA0NjIsImV4cCI6MjEwMDIzNjQ2Mn0.u4PZ8f7RRfC16dxW2UYkMCrdfUz1I0xIksFVv_spW4I"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  );
  $$
);