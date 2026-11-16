-- pg_cron + pg_net + el secreto de /api/cron en Vault: la base puede disparar
-- rutas de cron del sistema. Libera cupos de `vercel.json` (tope 100).
-- Instala las dos extensiones y una función, `public.fg_cron_llamar(ruta)`,
-- que lee `cron_secret` de Vault y llama a https://www.fashiongr.com<ruta>
-- con `Authorization: Bearer …`. NO programa ningún job: eso lo hace la
-- migración siguiente (20270118130100). Sin filas tocadas.
--
-- ══ POR QUÉ ═════════════════════════════════════════════════════════════════
-- vercel.json tenía 95 entradas de cron sobre un tope de 100 (16-nov-2026).
-- Daniel aprobó mover a pg_cron las tareas que corren varias veces al día. Los
-- horarios NO cambian: pg_cron corre en UTC (cron.timezone = GMT en Supabase),
-- igual que vercel.json. El registro de código (SWITCH_CRON_ENTRADAS en
-- src/lib/cron-telemetry.ts) sigue sabiendo cada horario con `origen: "pg_cron"`,
-- así los latidos por slot, la reconciliación, la regla 2 y datos-frescos
-- vigilan igual que antes. Candados: cron-registro.test.ts · cron-calendario.test.ts.
--
-- ══ EL SECRETO: NUNCA EN EL REPO ════════════════════════════════════════════
-- Esta migración NO escribe el valor. Después de aplicarla, UNA vez, Daniel (o
-- el agente con su «sí») carga en Vault el mismo CRON_SECRET que tiene Vercel:
--
--   · En el SQL Editor de Supabase (proyecto rspocgqhtpveytgbtler):
--       select vault.create_secret('<EL VALOR DE CRON_SECRET EN VERCEL>',
--                                  'cron_secret',
--                                  'Bearer de /api/cron para pg_cron');
--
--   · O desde la terminal, sin pegar el valor a mano (lo lee de Vercel y lo
--     manda por la API de administración; nada queda en un archivo):
--       cd cxc && vercel env pull /tmp/fg.env --environment production >/dev/null
--       S=$(grep '^CRON_SECRET=' /tmp/fg.env | cut -d= -f2- | tr -d '"'); rm /tmp/fg.env
--       curl -s -X POST https://api.supabase.com/v1/projects/rspocgqhtpveytgbtler/database/query \
--         -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
--         -d "{\"query\":\"select vault.create_secret('$S','cron_secret','Bearer de /api/cron para pg_cron')\"}"
--
--   · Comprobar que está, SIN mostrarlo:
--       select name, created_at from vault.secrets where name = 'cron_secret';
--
--   · Rotarlo el día que cambie en Vercel:
--       select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<nuevo>');
--
-- Si el secreto falta, `fg_cron_llamar` levanta un error (queda en
-- cron.job_run_details) y NO manda una petición sin credencial.
--
-- ══ TIEMPO DE ESPERA ════════════════════════════════════════════════════════
-- pg_net espera 5 s por defecto. Las rutas de sync tardan minutos
-- (switch-sync tiene maxDuration = 800 s), así que el valor por defecto de la
-- función es 800 000 ms. pg_cron NO espera la respuesta: encola la petición y
-- la ruta sigue corriendo en Vercel aunque pg_net la dé por vencida.
--
-- ══ CÓMO MIRAR QUÉ PASÓ ═════════════════════════════════════════════════════
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 20;
--   select id, status_code, created from net._http_response order by created desc limit 10;
--   (`status` = success solo dice que la petición se ENCOLÓ; el resultado real
--   lo dicen los latidos por slot en cron_heartbeats y switch_sync_log.)

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function public.fg_cron_llamar(ruta text, espera_ms integer default 800000)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  secreto text;
begin
  if ruta is null or ruta not like '/api/cron/%' then
    raise exception 'fg_cron_llamar: la ruta tiene que empezar por /api/cron/ (recibí %)', ruta;
  end if;
  select decrypted_secret into secreto
    from vault.decrypted_secrets
   where name = 'cron_secret';
  if secreto is null or secreto = '' then
    raise exception 'fg_cron_llamar: falta el secreto cron_secret en Vault (ver la migración 20270118130000)';
  end if;
  return net.http_get(
    url := 'https://www.fashiongr.com' || ruta,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secreto),
    timeout_milliseconds := espera_ms
  );
end
$$;

comment on function public.fg_cron_llamar(text, integer) is
  'Llama a https://www.fashiongr.com<ruta> con el Bearer de Vault (cron_secret). La usan los jobs fg-* de pg_cron. Solo postgres.';

-- Solo la base la llama (los jobs corren como postgres). Nadie la alcanza por PostgREST.
revoke all on function public.fg_cron_llamar(text, integer) from public, anon, authenticated, service_role;
