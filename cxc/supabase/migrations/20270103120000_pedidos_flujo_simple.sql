-- ═════════════════════════════════════════════════════════════════════════════
-- Despachos › Pedidos — el flujo SIMPLIFICADO, detrás de un interruptor
-- (7-oct-2026, `PEDIDOS_FLUJO_SIMPLE_2026_10`, hoy `false`)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 7-oct-2026, simplificando lo publicado HOY MISMO (`20261231120000_
-- pedidos_bultos.sql`): se va la asignación de bulto POR ARTÍCULO; bodega
-- anota UN número de bultos por pedido. TRES estados y nada más (Daniel,
-- recortando el alcance en la misma conversación): Pendiente → Preparado →
-- Recibido. Facturar en Switch y lo que sale en Etiquetas quedan AFUERA de
-- Pedidos — no hay columna ni estado para eso aquí.
--
-- 🔑 SOLO ENSANCHA: el CHECK de `estado` AGREGA 'recibido'. Los valores de hoy
-- ('pendiente' · 'preparado' · 'verificado', del otro flujo) siguen siendo
-- válidos — ninguna fila se toca, ninguna se renombra. El código apagado
-- (`PEDIDOS_FLUJO_SIMPLE_2026_10 = false`) nunca escribe 'recibido'.
--
-- `bultos`: el número que anota bodega, UN entero por pedido (1 a 9999, igual
-- rango que el bulto por línea de hoy). Columna propia porque con el flujo
-- simple ya no hay `pedidos_linea_bulto` de donde contarlos.
--
-- `recibido_por/_en`: la firma del único paso nuevo de la secretaria, mismo
-- patrón que `preparado_por/_en` de la migración anterior.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE pedidos_bodega_estado DROP CONSTRAINT IF EXISTS pedidos_bodega_estado_valido;
ALTER TABLE pedidos_bodega_estado
  ADD CONSTRAINT pedidos_bodega_estado_valido
  CHECK (estado IN ('pendiente', 'preparado', 'verificado', 'recibido'));

ALTER TABLE pedidos_bodega_estado
  ADD COLUMN IF NOT EXISTS bultos       integer,
  ADD COLUMN IF NOT EXISTS recibido_por text,
  ADD COLUMN IF NOT EXISTS recibido_en  timestamptz;

ALTER TABLE pedidos_bodega_estado
  ADD CONSTRAINT pedidos_bodega_estado_bultos_rango
  CHECK (bultos IS NULL OR (bultos >= 1 AND bultos <= 9999));

COMMENT ON COLUMN pedidos_bodega_estado.bultos IS
  'Flujo SIMPLIFICADO (PEDIDOS_FLUJO_SIMPLE_2026_10): un solo numero de bultos por '
  'pedido, que anota bodega al prepararlo. NULL = todavia no se anoto, o el pedido va '
  'por el flujo de bulto-por-linea (pedidos_linea_bulto).';
COMMENT ON COLUMN pedidos_bodega_estado.recibido_por IS
  'Quien marco Recibido (la secretaria o admin): confirma que tiene el pedido en '
  'mano. Es el ULTIMO paso de Pedidos — facturar en Switch y Etiquetas quedan '
  'afuera de este modulo a proposito (Daniel, 7-oct-2026).';
COMMENT ON COLUMN pedidos_bodega_estado.estado IS
  'pendiente | preparado | verificado (flujo de hoy, bulto por linea) | recibido '
  '(flujo simplificado, 7-oct-2026, un bulto por pedido, termina en Recibido). Sin '
  'fila = pendiente. Nombres de ERP; ningun valor viejo se renombra.';

NOTIFY pgrst, 'reload schema';
