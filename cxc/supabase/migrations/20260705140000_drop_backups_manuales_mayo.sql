-- Limpieza aprobada por Daniel (5-jul-2026): drop de las 4 tablas de backup
-- MANUAL de mayo 2026, obsoletas desde que el Backup v2 (NDJSON.gz diario +
-- replica R2) esta en produccion. Libera ~48 MB (~18 por ciento de la DB).
--
-- Verificado antes del drop:
--   - Cero referencias vivas en codigo (solo comentarios historicos y los
--     SQL de supabase/backups/sprint1-20260509 que las CREARON).
--   - No estan en los 49 DATASETS del cron de backup.
--   - Conteos al 5-jul: 45,354 / 45,150 / 7,924 / 559 filas.
--
-- REGLA DURA: ventas_raw (la real, 48,378 filas) NO SE TOCA. Este archivo
-- solo dropea tablas cuyo nombre contiene "backup". No agregar nada mas aqui.

drop table if exists backup_ventas_raw_20260509;
drop table if exists ventas_raw_backup_20260506_full;
drop table if exists ventas_raw_backup_20260505;
drop table if exists backup_cxc_rows_20260509;
