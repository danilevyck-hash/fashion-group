-- ═════════════════════════════════════════════════════════════════════════════
-- Despachos › Pedidos — el flujo SIMPLIFICADO, detrás de un interruptor
-- (7-oct-2026, `PEDIDOS_FLUJO_SIMPLE_2026_10`, hoy `false`)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 7-oct-2026, simplificando lo publicado HOY MISMO (`20261231120000_
-- pedidos_bultos.sql`): se va la asignación de bulto POR ARTÍCULO; bodega
-- anota UN número de bultos por pedido, y los dos pasos de la secretaria pasan
-- de ser «Verificado» a «Facturado» (factura en Switch) y «Despachado»
-- (confirma que salió con sus etiquetas).
--
-- 🔑 SOLO ENSANCHA: el CHECK de `estado` AGREGA 'facturado' y 'despachado'.
-- Los valores de hoy ('pendiente' · 'preparado' · 'verificado') siguen siendo
-- válidos — ninguna fila se toca, ninguna se renombra. El código apagado
-- (`PEDIDOS_FLUJO_SIMPLE_2026_10 = false`) nunca escribe los dos nuevos.
--
-- `bultos`: el número que anota bodega, UN entero por pedido (1 a 9999, igual
-- rango que el bulto por línea de hoy). Columna propia porque con el flujo
-- simple ya no hay `pedidos_linea_bulto` de donde contarlos.
--
-- Las dos firmas nuevas, mismo patrón que `preparado_por/_en` de la migración
-- anterior: una columna por paso para no perder quién hizo cuál.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE pedidos_bodega_estado DROP CONSTRAINT IF EXISTS pedidos_bodega_estado_valido;
ALTER TABLE pedidos_bodega_estado
  ADD CONSTRAINT pedidos_bodega_estado_valido
  CHECK (estado IN ('pendiente', 'preparado', 'verificado', 'facturado', 'despachado'));

ALTER TABLE pedidos_bodega_estado
  ADD COLUMN IF NOT EXISTS bultos         integer,
  ADD COLUMN IF NOT EXISTS facturado_por  text,
  ADD COLUMN IF NOT EXISTS facturado_en   timestamptz,
  ADD COLUMN IF NOT EXISTS despachado_por text,
  ADD COLUMN IF NOT EXISTS despachado_en  timestamptz;

ALTER TABLE pedidos_bodega_estado
  ADD CONSTRAINT pedidos_bodega_estado_bultos_rango
  CHECK (bultos IS NULL OR (bultos >= 1 AND bultos <= 9999));

COMMENT ON COLUMN pedidos_bodega_estado.bultos IS
  'Flujo SIMPLIFICADO (PEDIDOS_FLUJO_SIMPLE_2026_10): un solo numero de bultos por '
  'pedido, que anota bodega al prepararlo. NULL = todavia no se anoto, o el pedido va '
  'por el flujo de bulto-por-linea (pedidos_linea_bulto).';
COMMENT ON COLUMN pedidos_bodega_estado.facturado_por IS
  'Quien marco Facturado (la secretaria o admin), a MANO, despues de facturar en '
  'Switch. No es automatico: ver pedidos-flujo-simple.ts, el porque completo.';
COMMENT ON COLUMN pedidos_bodega_estado.despachado_por IS
  'Quien marco Despachado (la secretaria o admin): confirma que el pedido salio con '
  'sus etiquetas. Ultimo paso; el pedido queda cerrado.';
COMMENT ON COLUMN pedidos_bodega_estado.estado IS
  'pendiente | preparado | verificado (flujo de hoy, bulto por linea) | facturado | '
  'despachado (flujo simplificado, 7-oct-2026, un bulto por pedido). Sin fila = '
  'pendiente. Nombres de ERP; ningun valor viejo se renombra.';

NOTIFY pgrst, 'reload schema';
