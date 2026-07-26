-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: índices por `fecha` para ventas_raw
--
-- Aditiva y reversible: SOLO crea índices. Ninguna función cambia, ninguna cifra
-- de la app cambia. El código funciona igual si esta migración todavía no corrió
-- (los planes caen en seq scan, que es exactamente lo que hacen hoy).
--
-- ── DIAGNÓSTICO (medido 26-jul-2026 contra producción) ──────────────────────
--
-- pg_stat_user_tables: ventas_raw es la tabla MÁS LEÍDA de toda la base —
-- 7.616 seq scans, 278.907.206 filas leídas. La tabla tiene 48.378 filas y
-- 38 MB, o sea que 278.907.206 / 48.378 ≈ 5.765 barridos COMPLETOS.
--
-- Quién los produce (reconstruido resolviendo CREATE OR REPLACE / DROP FUNCTION
-- sobre las 263 migraciones, quedándose con la última definición de cada nombre):
--
--   multifashion_overview_serie_v1(p_year)      2 scans × 2 llamadas = 4
--     WHERE empresa='american_classic' AND is_wholesale=false
--       AND fecha BETWEEN v_anio_inicio AND LEAST(v_corte,'2025-04-30')
--   multifashion_proyeccion_cierre_v1 -> _multifashion_retail_blend_sum   3
--     mismo predicado, tres ventanas de fecha
--   ventas_dashboard_prev_same_period_v2(p_year)                          2
--     WHERE fecha < '2025-05-01' AND fecha >= (prev_year-01-01 − 1 día)
--   ventas_proyeccion_cierre_v6(p_anio)                                   1
--     WHERE fecha < DATE '2025-05-01'
--
-- Total: 10 seq scans completos por CADA carga SSR de /ventas (y de
-- /multifashion, que comparte las tres primeras). 10 × 48.378 = 483.780 filas
-- por carga. 278.907.206 / 483.780 ≈ 577 cargas — el orden de magnitud cierra.
-- Ninguna de esas rutas tiene caché (`force-dynamic`, sin revalidate).
--
-- ── POR QUÉ NO HAY ÍNDICE QUE SIRVA ─────────────────────────────────────────
-- Los 8 índices actuales de ventas_raw son: PK(id), UNIQUE(n_sistema,empresa),
-- (empresa,anio), (empresa,anio,mes), (anio,mes), (cliente_id),
-- ((TRIM(UPPER(cliente)))) WHERE empresa='american_classic', y
-- (fecha) WHERE is_wholesale = true.
--
-- NINGUNO sirve a los predicados de arriba:
--   · los tres por (anio, mes) están MUERTOS — ningún lector vigente filtra por
--     `anio`/`mes`; todos filtran por `fecha`.
--   · el parcial por fecha cubre `is_wholesale = true`, y los 7 escaneos de
--     multifashion filtran `is_wholesale = FALSE`. Medido: solo 9 filas de las
--     48.378 tienen is_wholesale = true, así que ese índice no cubre nada útil.
--
-- ── QUÉ APORTA (medido, no estimado) ────────────────────────────────────────
-- Un seq scan completo de ventas_raw cuesta 1-29 ms (delta contra el piso de red
-- de 164-180 ms, con N=20 corridas interleaved y payload idéntico). O sea:
--
--   >>> Esto NO es lo que hace lenta a /ventas. <<<
--
-- Los 10 scans suman ~150-290 ms de los ~2.200-3.300 ms que tarda el SSR de
-- /ventas con la base calma. El ahorro directo de estos dos índices es de
-- ~180 ms por carga (≈140 ms el parcial, ≈40 ms el de fecha).
--
-- El motivo REAL para crearlos es el otro: sacarle a la base 278M filas leídas
-- de encima. La app tiene dos estados medidos el 26-jul — con la base calma
-- /ventas responde en 2,2-3,3 s; dentro de las ventanas de crons (17:00-17:50,
-- 15:00-15:30, 19:00-19:15, 21:00-21:20 UTC) las MISMAS RPC pasan de 400 ms a
-- 10-18 s, se comen el statement_timeout y disparan los reintentos de
-- withDbRetry hasta 23-39 s. Es en esas ventanas donde 278M filas de lectura
-- evitable pesan. Bajar el trabajo de fondo es lo que angosta esos picos.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP INDEX CONCURRENTLY IF EXISTS idx_ventas_raw_ac_retail_fecha;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_ventas_raw_fecha;
--
-- ── CÓMO APLICAR (IMPORTANTE) ───────────────────────────────────────────────
-- CONCURRENTLY no bloquea escrituras pero NO puede correr dentro de una
-- transacción, y el SQL Editor de Supabase manda toda la pestaña como un bloque
-- implícito.
--
--   >>> Ejecutar CADA CORRIDA POR SEPARADO, una por vez. <<<
--
-- Fuera de 23:50-00:20 y 05:50-06:10 UTC, y fuera de las ventanas de sync.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── CORRIDA 1 ────────────────────────────────────────────────────────────────
-- Cubre los 7 escaneos de Multifashion (overview_serie ×4 + blend_sum ×3), que
-- son el 70% del contador. El WHERE parcial replica el predicado literal de esas
-- funciones (is_wholesale = false) y deja el índice en ~25.718 filas.
-- Para p_year = 2026 el rango pedido es VACÍO (LEAST(corte,'2025-04-30') queda
-- antes del 2026-01-01): con índice eso se resuelve sin tocar el heap.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ventas_raw_ac_retail_fecha
  ON ventas_raw (empresa, fecha)
  WHERE is_wholesale = false;


-- ── CORRIDA 2 ────────────────────────────────────────────────────────────────
-- Cubre los 2 escaneos de ventas_dashboard_prev_same_period_v2 (rangos de ~1 año
-- sobre `fecha`, sin empresa).
--
-- NO cubre ventas_proyeccion_cierre_v6: su predicado `fecha < '2025-05-01'`
-- devuelve 27.518 de 48.378 filas (57% de la tabla), y ahí el planner elige seq
-- scan y hace bien. Ese scan se queda como está a propósito.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ventas_raw_fecha
  ON ventas_raw (fecha);


-- ── CORRIDA 3 ────────────────────────────────────────────────────────────────
-- Estadísticas frescas para que el planner vea los índices nuevos.
ANALYZE ventas_raw;


-- ─────────────────────────────────────────────────────────────────────────────
-- NO INCLUIDO A PROPÓSITO (requiere confirmación de Daniel)
--
-- Estos tres índices de ventas_raw están MUERTOS — ningún lector vigente filtra
-- por `anio`/`mes`, y `(empresa,anio)` es además prefijo estricto de
-- `(empresa,anio,mes)`. Encarecen cada UPDATE del trigger
-- refresh_wholesale_flag_on_master_change (cron sync-clientes-master, 07:00):
--
--   DROP INDEX CONCURRENTLY IF EXISTS idx_ventas_raw_empresa_anio;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_ventas_raw_empresa_anio_mes;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_ventas_raw_anio_mes;
--
-- No se dropean acá porque no puedo descartar que alguien corra SQL manual por
-- (anio, mes) contra esta tabla. Antes de borrarlos, verificar tráfico real:
--
--   SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)), idx_scan
--   FROM pg_stat_user_indexes WHERE relname = 'ventas_raw' ORDER BY idx_scan;
--
-- Lo mismo aplica a idx_sad_empresa_fecha en switch_articulo_diario, que es
-- prefijo estricto de la UNIQUE (empresa_key, fecha, articulo_id, tipo).
-- ─────────────────────────────────────────────────────────────────────────────
