-- GUÍAS › ETIQUETAS — TRASLADO SIN EMPRESA (2-oct-2026, `ETIQUETAS_TRASLADO_2026_10`).
-- Daniel: «cuando es traslado, a veces puede ser que sea empresa o que sea
-- traslado… puede ser solamente traslado». En un traslado la empresa es
-- OPCIONAL: `empresa_key` NULL solo si la fila es un traslado (el papel dice
-- FASHION GROUP arriba). Una factura sigue exigiendo empresa.
--
-- 🔴 ADITIVA: no toca ni una fila. El índice único (`empresa_key,
-- switch_factura_id`) sigue igual: un traslado ya tiene la factura en NULL.
-- ✅ Daniel aprobó el 2-oct-2026.

ALTER TABLE guias_etiquetas ALTER COLUMN empresa_key DROP NOT NULL;

ALTER TABLE guias_etiquetas DROP CONSTRAINT IF EXISTS guias_etiquetas_factura_o_traslado;
ALTER TABLE guias_etiquetas ADD CONSTRAINT guias_etiquetas_factura_o_traslado CHECK (
  (switch_factura_id IS NOT NULL AND empresa_key IS NOT NULL)
  OR (secuencial = 'Traslado' AND nota IS NOT NULL)
);

COMMENT ON COLUMN guias_etiquetas.empresa_key IS
  'Empresa del envío. NULL = traslado sin empresa (secuencial = ''Traslado'').';
