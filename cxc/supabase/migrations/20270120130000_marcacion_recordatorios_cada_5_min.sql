-- requiere la migración de pg_cron del otro agente: 20270118130000_pg_cron_pg_net_vault.sql (instala pg_cron + pg_net y
-- carga el secreto `cron_secret` en Supabase Vault). Esta NO instala nada.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA LLAMADA CADA 5 MINUTOS de los recordatorios de Marcación (16-nov-2026).
--
-- 🔴 NO VA EN vercel.json: la base llama sola a /api/recordatorios-marcacion
-- con `pg_cron` + `pg_net`, con el secreto `cron_secret` de Vault (nunca en el
-- repo). Sin el secreto la llamada sale sin llave y la ruta contesta 401: no
-- avisa a nadie y no rompe nada.
-- Para apagarlo: select cron.unschedule('fg-recordatorios-marcacion');
--
-- No toca ninguna fila de negocio: UNA fila en cron.job.
-- ─────────────────────────────────────────────────────────────────────────────

-- Con el mismo nombre, cron.schedule reemplaza la programación anterior.
SELECT cron.schedule(
  'fg-recordatorios-marcacion',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://www.fashiongr.com/api/recordatorios-marcacion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE((
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_secret'
      ), '')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
