-- ============================================================================
-- Marketing — período trabajado (desde/hasta) en el gasto de impulsadora
-- ============================================================================
-- QUÉ ARREGLA
-- Hasta ahora el pago de una impulsadora cubría UN MES entero (mk_facturas.
-- impulsadora_mes) y el sistema rechazaba un segundo pago del mismo mes. Daniel
-- necesita pagar por QUINCENA ("del 1 al 15 de julio"), así que el pago pasa a
-- guardar el rango de días realmente trabajado.
--
-- QUÉ AGREGA
--   periodo_desde / periodo_hasta (DATE, ambas NULL-ables) en mk_facturas.
--
-- QUÉ PASA SI NO SE CORRE
-- La app NO se rompe: al guardar detecta que las columnas no existen y registra
-- el pago como antes (solo impulsadora_mes), con el período escrito en el
-- concepto del gasto. Las tarjetas de impulsadora siguen mostrando los meses
-- como pagados/pendientes completos, y el anti-duplicado sigue protegiendo,
-- pero NO se van a poder cargar dos quincenas del mismo mes (la segunda choca
-- con la primera, que sin rango se lee como el mes entero). O sea: hasta correr
-- este SQL, la función de quincenas no queda disponible.
--
-- NO TOCA NINGUNA FILA EXISTENTE. Los pagos mensuales viejos quedan con las dos
-- columnas en NULL y la app los sigue leyendo como "mes completo" — no se
-- migran ni se reescriben nunca.
--
-- ADITIVA e IDEMPOTENTE (cero DELETE / DROP COLUMN / DROP TABLE / UPDATE).
-- Aplicar UNA vez en Supabase Dashboard -> SQL Editor.
--
-- REQUISITO PREVIO: la migración 20260708160000_marketing_impulsadoras.sql
-- (crea mk_impulsadoras e impulsadora_mes). Si esa no está corrida, correla
-- primero.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Columnas del período trabajado
-- ----------------------------------------------------------------------------
-- Primer día trabajado que cubre el gasto (inclusive). NULL en los gastos de
-- proyecto normales y en los pagos mensuales anteriores a este cambio.
ALTER TABLE mk_facturas
  ADD COLUMN IF NOT EXISTS periodo_desde DATE;

-- Último día trabajado (inclusive). Un solo día = periodo_hasta igual a
-- periodo_desde.
ALTER TABLE mk_facturas
  ADD COLUMN IF NOT EXISTS periodo_hasta DATE;

-- ----------------------------------------------------------------------------
-- 2. Integridad del rango
-- ----------------------------------------------------------------------------
-- Van las dos o ninguna, y el final nunca antes del inicio. Las filas actuales
-- tienen ambas NULL, así que cumplen el CHECK sin tocarse.
ALTER TABLE mk_facturas DROP CONSTRAINT IF EXISTS mk_facturas_periodo_check;
ALTER TABLE mk_facturas
  ADD CONSTRAINT mk_facturas_periodo_check
  CHECK (
    (periodo_desde IS NULL AND periodo_hasta IS NULL)
    OR (periodo_desde IS NOT NULL AND periodo_hasta IS NOT NULL
        AND periodo_hasta >= periodo_desde)
  );

-- ----------------------------------------------------------------------------
-- 3. Índice para el chequeo de solapamiento al registrar un pago
-- ----------------------------------------------------------------------------
-- Al guardar se leen los pagos vigentes de esa impulsadora para ver si el rango
-- nuevo pisa días ya pagados.
CREATE INDEX IF NOT EXISTS idx_mk_facturas_impulsadora_periodo
  ON mk_facturas(impulsadora_id, periodo_desde)
  WHERE impulsadora_id IS NOT NULL;

COMMIT;

-- Recargar el cache de esquema de PostgREST (Supabase REST).
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- 4. Verificación (no modifica nada) — revisar el output en el SQL Editor
-- ----------------------------------------------------------------------------
-- 4a. Las dos columnas existen y son nullable.
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'mk_facturas'
  AND column_name IN ('periodo_desde', 'periodo_hasta')
ORDER BY column_name;

-- 4b. Nada cambió: todos los pagos de impulsadora siguen ahí y ninguno tiene
--     período todavía (se va llenando a medida que se registren pagos nuevos).
SELECT
  COUNT(*)                                          AS pagos_impulsadora,
  COUNT(*) FILTER (WHERE periodo_desde IS NOT NULL) AS con_periodo,
  COUNT(*) FILTER (WHERE periodo_desde IS NULL)     AS sin_periodo_mensuales
FROM mk_facturas
WHERE impulsadora_id IS NOT NULL;
