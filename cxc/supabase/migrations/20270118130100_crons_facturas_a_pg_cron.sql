-- Las 15 corridas de `switch-sync tipo=facturas` pasan de vercel.json a pg_cron:
-- las 13 de cada hora de 7 a. m. a 6 p. m. de Panamá (las 8 empresas) y las
-- dos de solo american_classic (00:15 y 03:00 UTC). MISMOS minutos UTC, misma
-- ruta, mismo `slot`. vercel.json queda en 80 de 100. Sin filas tocadas.
-- Depende de 20270118130000 (pg_cron, pg_net y `public.fg_cron_llamar`).
--
-- ══ REGLAS ══════════════════════════════════════════════════════════════════
-- · Una entrada = una ocurrencia = un slot: cada job lleva SU minuto y SU
--   `slot=facturas-<hhmm>`, igual que en vercel.json. Nada de listas de horas.
-- · Nombre del job: fg-<ruta>-<hhmm UTC>. `cron.schedule` por nombre es
--   idempotente: repetir esta migración actualiza, no duplica.
-- · pg_cron corre en UTC (cron.timezone = GMT): «50 11 * * *» = 06:50 Panamá.
-- · El registro de código (SWITCH_CRON_ENTRADAS, src/lib/cron-telemetry.ts)
--   tiene estas 15 con `origen: "pg_cron"`. El candado cron-calendario.test.ts
--   exige que estén AQUÍ y NO en vercel.json (una corrida doble en la misma
--   empresa expulsa la sesión de Switch).
--
-- ══ ORDEN DE PUBLICACIÓN ════════════════════════════════════════════════════
-- 1. Aplicar 20270118130000 y cargar `cron_secret` en Vault (cualquier hora).
-- 2. Aplicar ESTA migración entre las 03:05 y las 11:45 UTC (22:05 → 06:45 de
--    Panamá): es el único hueco del día sin ninguna corrida de facturas.
-- 3. Integrar en ese mismo hueco la solicitud que quita las 15 de vercel.json.
--    Si la solicitud entra después de las 11:50 UTC con esta migración ya
--    aplicada, las dos fuentes disparan a la vez: NO hacerlo.
--
-- ══ VOLVER ATRÁS ════════════════════════════════════════════════════════════
--   select cron.unschedule(jobname) from cron.job where jobname like 'fg-switch-sync-facturas-%';
--   …y devolver las 15 entradas a vercel.json (git revert de la solicitud).

select cron.schedule('fg-switch-sync-facturas-0015', '15 0 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresa=american_classic&slot=facturas-0015')$$);
select cron.schedule('fg-switch-sync-facturas-0300', '0 3 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresa=american_classic&slot=facturas-0300')$$);
select cron.schedule('fg-switch-sync-facturas-1150', '50 11 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1150')$$);
select cron.schedule('fg-switch-sync-facturas-1230', '30 12 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1230')$$);
select cron.schedule('fg-switch-sync-facturas-1330', '30 13 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1330')$$);
select cron.schedule('fg-switch-sync-facturas-1415', '15 14 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1415')$$);
select cron.schedule('fg-switch-sync-facturas-1500', '0 15 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1500')$$);
select cron.schedule('fg-switch-sync-facturas-1645', '45 16 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1645')$$);
select cron.schedule('fg-switch-sync-facturas-1730', '30 17 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1730')$$);
select cron.schedule('fg-switch-sync-facturas-1840', '40 18 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1840')$$);
select cron.schedule('fg-switch-sync-facturas-1900', '0 19 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-1900')$$);
select cron.schedule('fg-switch-sync-facturas-2020', '20 20 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-2020')$$);
select cron.schedule('fg-switch-sync-facturas-2140', '40 21 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-2140')$$);
select cron.schedule('fg-switch-sync-facturas-2230', '30 22 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-2230')$$);
select cron.schedule('fg-switch-sync-facturas-2300', '0 23 * * *', $$select public.fg_cron_llamar('/api/cron/switch-sync?tipo=facturas&empresas=american_classic,vistana,fashion_wear,fashion_shoes,active_shoes,active_wear,joystep,confecciones_boston&slot=facturas-2300')$$);
