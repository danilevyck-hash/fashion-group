-- ─────────────────────────────────────────────────────────────────────────────
-- LA LLAMADA CADA 5 MINUTOS de los recordatorios de Marcación (16-nov-2026).
--
-- 🔴 NO VA EN vercel.json: la regla de los crons no se toca. La base llama
-- sola a /api/recordatorios-marcacion con `pg_cron` + `pg_net`.
--
-- 🔴 EL SECRETO NO ESTÁ EN ESTE ARCHIVO. Vive en Supabase Vault y se carga
-- UNA VEZ, aparte, en el editor SQL de Supabase (con el valor de CRON_SECRET
-- de Vercel; no se guarda en el repo):
--
--     select vault.create_secret('<valor de CRON_SECRET>', 'marcacion_recordatorios_cron_secret');
--
-- Para cambiarlo después:
--     select vault.update_secret(
--       (select id from vault.secrets where name = 'marcacion_recordatorios_cron_secret'),
--       '<valor nuevo>');
--
-- Sin el secreto la llamada sale sin llave y la ruta contesta 401: no avisa a
-- nadie y no rompe nada. Para apagarlo: select cron.unschedule('marcacion-recordatorios');
--
-- No toca ninguna fila de negocio: crea las extensiones (si faltan) y UNA fila
-- en cron.job.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Con el mismo nombre, cron.schedule reemplaza la programación anterior.
SELECT cron.schedule(
  'marcacion-recordatorios',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://www.fashiongr.com/api/recordatorios-marcacion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE((
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'marcacion_recordatorios_cron_secret'
      ), '')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
