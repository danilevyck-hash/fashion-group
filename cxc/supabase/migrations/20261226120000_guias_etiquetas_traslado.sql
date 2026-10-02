-- GUÍAS › ETIQUETAS — TRASLADO SIN FACTURA (2-oct-2026, `ETIQUETAS_TRASLADO_2026_10`).
-- Daniel: «¿y si quiero mandar algo extra de la bodega que no está en el
-- sistema?» (muebles, ganchos, paneles). Un traslado es UNA fila sin factura:
-- `switch_factura_id` NULL, `secuencial` = 'Traslado' y el CONTENIDO en `nota`
-- (obligatorio, ≤ 15 por el CHECK que ya existe).
--
-- 🔴 ADITIVA: no toca ni una fila. El índice único por factura viva
-- (`empresa_key, switch_factura_id`) sigue igual: NULL no choca con NULL, así
-- que cada traslado es su propio envío y las facturas siguen sin repetirse.
-- ⚠️ El código FALLA ABIERTO sin esta migración: el POST de un traslado
-- contesta 503 y lo dice; las facturas se etiquetan igual que hoy.
-- ✅ Daniel aprobó el 2-oct-2026 («sigue»).

ALTER TABLE guias_etiquetas ALTER COLUMN switch_factura_id DROP NOT NULL;

ALTER TABLE guias_etiquetas DROP CONSTRAINT IF EXISTS guias_etiquetas_factura_o_traslado;
ALTER TABLE guias_etiquetas ADD CONSTRAINT guias_etiquetas_factura_o_traslado CHECK (
  switch_factura_id IS NOT NULL
  OR (secuencial = 'Traslado' AND nota IS NOT NULL)
);

COMMENT ON COLUMN guias_etiquetas.switch_factura_id IS
  'switch_facturas.switch_factura_id — el id real de Switch. NULL = traslado sin '
  'factura (secuencial = ''Traslado'', el contenido en nota).';
