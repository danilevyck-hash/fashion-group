-- ─────────────────────────────────────────────────────────────────────────────
-- Índice para la query del aging de CXC (Causa 1-A del audit de performance).
--
-- switch_estadocuenta_aging es una VIEW (no materializada) que se recalcula en
-- cada carga de CXC. Su query base hace seq-scan de switch_estadocuenta
-- WHERE saldo <> 0 y agrupa por (empresa_key, cliente_codigo). Los índices
-- existentes —(empresa_key, cliente_switch_id) y el parcial (empresa_key, saldo)
-- WHERE saldo > 0— NO cubren ni el predicado <> 0 ni la llave de agrupación
-- por cliente_codigo (texto). Este índice parcial sí.
--
-- Aditivo y no destructivo. CREATE INDEX CONCURRENTLY para NO bloquear escrituras
-- en la tabla viva (igual que idx_switch_facturas_cliente_switch_id_fecha).
-- IMPORTANTE: CONCURRENTLY no corre dentro de una transacción → ejecutar este
-- statement SOLO (sin BEGIN/COMMIT) en Supabase Dashboard → SQL Editor.
--
-- NO materializa la vista (eso es la Causa 1-B y va aparte). Solo el índice.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estadocuenta_empresa_codigo
  ON switch_estadocuenta (empresa_key, cliente_codigo)
  WHERE saldo <> 0;
