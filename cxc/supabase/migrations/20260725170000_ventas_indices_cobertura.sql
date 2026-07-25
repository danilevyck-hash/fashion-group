-- ─────────────────────────────────────────────────────────────────────────────
-- Migration (PASO 1 de 2): índices de COBERTURA para las agregaciones de /ventas
--
-- Compañera de 20260725170100_ventas_dashboard_summary_mes_sargable.sql
-- (esa reescribe la RPC). Esta solo CREA ÍNDICES: aditiva y reversible.
--
-- ── DIAGNÓSTICO (medido 25-jul-2026 contra producción) ──────────────────────
--
-- ventas_dashboard_summary(p_anio) tarda 8,2-8,8 s en frío. La prueba dura:
--   ventas_dashboard_summary(2020) devuelve `[]` (2 bytes, CERO filas) y aun así
--   tarda 3,354 ms. Hace todo el trabajo aunque no tenga nada que devolver.
--
-- Por qué: la rama "mes en curso" de la RPC lee dos VISTAS NO materializadas que
-- agregan la tabla COMPLETA, y recién después filtra por mes:
--   · switch_ventas_unificado_vw = GROUP BY sobre las 52.222 filas de
--     switch_facturas (fila promedio ~1.116 B, con raw_data jsonb) -> ~58 MB de heap.
--   · switch_costo_unificado_vw  = GROUP BY sobre las 197.128 filas de
--     switch_articulo_diario (fila promedio ~374 B) -> ~74 MB de heap.
-- El predicado `v.mes = cur.m` es una condición de JOIN contra una CTE, así que
-- Postgres NO la puede empujar dentro de la vista: agrega los ~132 MB, hace el
-- LEFT JOIN de las dos agregaciones y al final se queda con ~8 filas.
--
-- Medición por componente (misma sesión, PostgREST):
--   vista ventas sin filtro   3.285 / 520 / 404 ms
--   vista costo  sin filtro   3.646 / 1.566 / 521 ms   (pico observado 4.882 ms)
--   MV rollup (histórico)       501 / 505 / 264 ms  <- ya está resuelto, no es el cuello
--   RPC completa              8.233 / 5.105 / 1.946 ms
-- Con el filtro de mes empujado a mano, las MISMAS vistas bajan a 277-430 ms.
--
-- ── QUÉ FALTA (y por qué estos índices) ─────────────────────────────────────
--
-- Índices actuales de las dos tablas:
--   switch_facturas         (empresa_key, fecha), (empresa_key, cliente_switch_id),
--                           (empresa_key, vendedor_switch_id), (cliente_switch_id, fecha)
--   switch_articulo_diario  (empresa_key, fecha), (empresa_key, codigo)
-- TODOS los índices por fecha LIDERAN con empresa_key. Un barrido por rango de
-- fecha SIN empresa_key (que es exactamente lo que necesita el mes en curso, y lo
-- que necesitan el REFRESH de la MV y ventas_proyeccion_cierre_v6) no puede hacer
-- seek: cae a seq scan del heap completo. Es el mismo hallazgo que ya documentó
-- 20260609160000_switch_facturas_cliente_switch_id_idx.sql para la ficha de cliente.
--
-- Estos dos índices lideran con `fecha` y llevan en INCLUDE las columnas que las
-- agregaciones necesitan, de modo que Postgres puede resolverlas con INDEX ONLY
-- SCAN, sin tocar el heap:
--
--   switch_facturas        agrega: empresa_key, tipo_comprobante, subtotal_descuento
--   switch_articulo_diario agrega: empresa_key, tipo, costo_total
--
-- Tamaño estimado y ahorro de I/O:
--   idx_sf_fecha_cover   52.222 filas x ~66 B  ~=  3,8 MB   vs  58 MB de heap  (~15x menos)
--   idx_sad_fecha_cover 197.128 filas x ~59 B  ~= 13,0 MB   vs  74 MB de heap  (~5,7x menos)
--   Camino "agregar todo": 132 MB -> ~17 MB
--   Camino "solo mes en curso" (con la RPC del PASO 2): el mes de julio son
--   1.160 filas de 52.222 (2,2 por ciento) y 3.608 de 197.128 (1,8 por ciento)
--   -> ~0,3 MB leídos por rango en el índice, en vez de 132 MB. ~450x menos.
--
-- ── A QUÉ MÁS LE SIRVE (mismo síntoma, misma causa) ─────────────────────────
--   · refresh_ventas_rollup_mensual_mv (cron refresh-clientes-views, los
--     "canceling statement due to statement timeout" del 4-jul y 23-jul):
--     el REFRESH reconstruye la MV desde estas dos vistas, o sea agrega los
--     132 MB por definición. Ahí la RPC reescrita NO ayuda; el índice de
--     cobertura sí (es su único remedio posible sin cambiar la MV).
--   · ventas_proyeccion_cierre_v6: barre switch_facturas con
--     `fecha >= DATE '2025-05-01'` (rango enorme, sin empresa_key).
--   · ventas_dashboard_prev_same_period_v2: rangos de fecha sin empresa_key.
--
-- ── CÓMO APLICAR (IMPORTANTE) ───────────────────────────────────────────────
-- CONCURRENTLY no bloquea escrituras, pero NO puede correr dentro de una
-- transacción. El SQL Editor de Supabase manda todo el contenido de la pestaña
-- como un solo bloque implícito -> si pegas los dos CREATE juntos falla con
-- "CREATE INDEX CONCURRENTLY cannot run inside a transaction block".
--
--   >>> Ejecutar CADA CREATE INDEX POR SEPARADO, uno por corrida. <<<
--
-- Si aun así el editor lo envuelve, la alternativa es quitar CONCURRENTLY: la
-- creación normal toma un ShareLock que bloquea INSERT/UPDATE de la tabla
-- mientras dura (estimado: pocos segundos a estas escalas). Hacerlo fuera de las
-- ventanas de sync (05:30-07:35 UTC) y fuera de 23:50-00:20 / 05:50-06:10 UTC.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── CORRIDA 1 ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sf_fecha_cover
  ON switch_facturas (fecha, empresa_key)
  INCLUDE (tipo_comprobante, subtotal_descuento);


-- ── CORRIDA 2 ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sad_fecha_cover
  ON switch_articulo_diario (fecha, empresa_key)
  INCLUDE (tipo, costo_total);


-- ── CORRIDA 3 (opcional pero recomendada) ────────────────────────────────────
-- OJO: VACUUM tampoco puede correr dentro de una transacción. Ejecutar cada
-- VACUUM por separado, igual que los CREATE INDEX de arriba.
-- Un INDEX ONLY SCAN solo evita el heap en las páginas marcadas "all visible" en
-- el visibility map. Las dos tablas se re-escriben en cada sync, así que sus
-- páginas recientes quedan sucias hasta el próximo VACUUM. ANALYZE deja al
-- planner con estadísticas frescas para que elija el índice nuevo; el VACUUM
-- puebla el visibility map para que el index only scan de verdad no toque heap.
-- Son operaciones online (no bloquean lecturas ni escrituras).
VACUUM (ANALYZE) switch_facturas;
VACUUM (ANALYZE) switch_articulo_diario;

-- Opcional, si el beneficio se degrada entre syncs: hacer que autovacuum pase
-- más seguido por estas dos tablas (toma SHARE UPDATE EXCLUSIVE, es instantáneo).
-- ALTER TABLE switch_facturas        SET (autovacuum_vacuum_scale_factor = 0.05);
-- ALTER TABLE switch_articulo_diario SET (autovacuum_vacuum_scale_factor = 0.05);


-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP INDEX CONCURRENTLY IF EXISTS idx_sf_fecha_cover;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_sad_fecha_cover;
