-- comision_factura_vendedor — el vendedor se guarda con la GRAFÍA de Switch.
--
-- 🩸 Daniel, 12-nov-2026: «al hacer cambio de vendedor, se me duplicó el nombre
-- de Rodrigo». Pasó tres facturas de Vistana de octubre (11-000003131,
-- 11-000003133, 11-000003160, City Mall Paso Canoa, de DANIEL LEVY) a Rodrigo.
-- La tabla las guardó como «RODRIGO» (la 20261111130000 forzaba MAYÚSCULAS con
-- un CHECK y el trigger), pero Switch y la tasa lo escriben «Rodrigo» y
-- comision_vendedor_canonico() NO pasa a mayúsculas (solo recorta y aplica el
-- alias). La v10 agrupa por texto exacto → dos filas: «Rodrigo» y «RODRIGO»,
-- y la segunda ni siquiera tomaba la tasa de Rodrigo (cobro 0 %).
--
-- Arreglo, en el ÚNICO lugar por donde pasa toda escritura (el trigger):
--   • el vendedor se resuelve a la grafía que esa persona tiene EN ESA EMPRESA
--     (facturas → recibos → tasas), comparando sin mayúsculas; sin ninguna, el
--     canónico tal cual. Así la RPC y el detalle lo ven como LA MISMA persona.
--   • el CHECK de mayúsculas se cambia por «recortado y no vacío».
--   • las filas ya guardadas se recanonizan (SET vendedor = vendedor dispara el
--     trigger). Hoy son 3, las 3 de Rodrigo.
-- Ningún total del mes se mueve: solo se juntan dos filas en una.
-- Candado: comision-factura-vendedor-grafia.test.ts.

ALTER TABLE comision_factura_vendedor
  DROP CONSTRAINT IF EXISTS comision_factura_vendedor_vendedor_normalizado;
ALTER TABLE comision_factura_vendedor
  ADD CONSTRAINT comision_factura_vendedor_vendedor_normalizado
    CHECK (vendedor = BTRIM(vendedor) AND vendedor <> '');

CREATE OR REPLACE FUNCTION comision_factura_vendedor_canonicalizar()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_canonico text := COALESCE(comision_vendedor_canonico(NEW.vendedor), BTRIM(NEW.vendedor));
BEGIN
  NEW.vendedor := COALESCE(
    (SELECT x.nombre FROM (
        SELECT comision_vendedor_canonico(sf.vendedor_nombre) AS nombre, sf.fecha AS cuando, 1 AS orden
          FROM switch_facturas sf WHERE sf.empresa_key = NEW.empresa_key
        UNION ALL
        SELECT comision_vendedor_canonico(r.vendedor_registro), r.fecha::timestamptz, 2
          FROM switch_recibos r WHERE r.empresa_key = NEW.empresa_key
        UNION ALL
        SELECT t.vendedor_nombre, NULL::timestamptz, 3 FROM comision_vendedor_tasa t
      ) x
      WHERE UPPER(x.nombre) = UPPER(v_canonico)
      ORDER BY x.orden, x.cuando DESC NULLS LAST
      LIMIT 1),
    v_canonico
  );
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN comision_factura_vendedor.vendedor IS
  'Vendedor CANÓNICO con la grafía que tiene en Switch para esa empresa (el trigger la resuelve sin mayúsculas): a quién pasa la comisión de venta.';

-- Las filas ya guardadas («RODRIGO» → «Rodrigo»).
UPDATE comision_factura_vendedor SET vendedor = vendedor;

NOTIFY pgrst, 'reload schema';
