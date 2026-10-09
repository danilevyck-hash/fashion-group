-- ═════════════════════════════════════════════════════════════════════════════
-- Despachos › Pedidos — «En preparación» y «En espera de muestra»
-- (Daniel, 9-oct-2026, sobre el flujo `PEDIDOS_FLUJO_SIMPLE_2026_10`)
-- ═════════════════════════════════════════════════════════════════════════════
-- Pendiente → En preparación (bodega: le entregaron la hoja) → Preparado
-- (bodega, con bultos) → Recibido (secretaria).
--
-- «En espera de muestra»: una marca sobre En preparación (faltan piezas que
-- bodega trae de otro lado), con nota opcional. No es un estado.
--
-- 🔑 SOLO AGREGA: el CHECK de `estado` suma 'en_preparacion' (los valores de
-- hoy siguen valiendo) y las columnas nuevas nacen en NULL. Ninguna fila se
-- toca: lo que está en Preparado o Recibido se queda donde está.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE pedidos_bodega_estado DROP CONSTRAINT IF EXISTS pedidos_bodega_estado_valido;
ALTER TABLE pedidos_bodega_estado
  ADD CONSTRAINT pedidos_bodega_estado_valido
  CHECK (estado IN ('pendiente', 'en_preparacion', 'preparado', 'verificado', 'recibido'));

ALTER TABLE pedidos_bodega_estado
  ADD COLUMN IF NOT EXISTS en_preparacion_por   text,
  ADD COLUMN IF NOT EXISTS en_preparacion_en    timestamptz,
  ADD COLUMN IF NOT EXISTS espera_muestra_desde timestamptz,
  ADD COLUMN IF NOT EXISTS espera_muestra_por   text,
  ADD COLUMN IF NOT EXISTS espera_muestra_nota  text;

-- «En espera de muestra» solo existe En preparación. Todas las filas de hoy
-- tienen la columna en NULL, así que el CHECK no rechaza ninguna.
ALTER TABLE pedidos_bodega_estado DROP CONSTRAINT IF EXISTS pedidos_bodega_espera_muestra_solo_en_preparacion;
ALTER TABLE pedidos_bodega_estado
  ADD CONSTRAINT pedidos_bodega_espera_muestra_solo_en_preparacion
  CHECK (espera_muestra_desde IS NULL OR estado = 'en_preparacion');

ALTER TABLE pedidos_bodega_estado DROP CONSTRAINT IF EXISTS pedidos_bodega_espera_muestra_nota_largo;
ALTER TABLE pedidos_bodega_estado
  ADD CONSTRAINT pedidos_bodega_espera_muestra_nota_largo
  CHECK (espera_muestra_nota IS NULL OR char_length(espera_muestra_nota) <= 200);

COMMENT ON COLUMN pedidos_bodega_estado.en_preparacion_por IS
  'Quien marco En preparacion (bodega o admin): confirma que la hoja del pedido llego a bodega.';
COMMENT ON COLUMN pedidos_bodega_estado.espera_muestra_desde IS
  'En espera de muestra: faltan piezas finales que bodega trae de otro lado. Solo con estado '
  'en_preparacion; marcar Preparado la quita. NULL = no esta en espera.';
COMMENT ON COLUMN pedidos_bodega_estado.espera_muestra_nota IS
  'Opcional: que pieza falta (max 200).';

NOTIFY pgrst, 'reload schema';
