-- ═════════════════════════════════════════════════════════════════════════════
-- ÚLTIMA COMPRA POR CLIENTE — switch_ultima_compra_cliente_v1
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 13-ago-2026, textual: "asi como esta ultimo pago x dias, tambien
-- quiero ver ultima compra (q seria la factura)".
--
-- Es el ESPEJO de switch_ultimo_pago_cliente_v2: una fila por (empresa,
-- cliente) con la fecha y el monto del documento más reciente, para que el CXC
-- lo lea de UNA vista agregada y no con una consulta por cliente. La base va en
-- compute Micro y se cayó varias veces esta semana: el costo importa.
--
-- 🔴 ÚLTIMA COMPRA = LA ÚLTIMA **FACTURA**. `tipo_comprobante = 'Factura'` y
-- nada más. En este repo las notas de crédito llegan POSITIVAS y solo se
-- distinguen por ese campo: contarlas como compra sería el error de signos que
-- ya se pagó dos veces (su firma es que la diferencia da EXACTAMENTE el doble de
-- las NC). Tampoco entran Notas de Débito, Tiquetes ni Transacciones: una
-- devolución no es una compra y un ajuste tampoco. Medido en el grupo:
-- 9.652 Facturas · 2.597 Notas de Crédito · 619 Notas de Débito · 1.401
-- Tiquetes · 1.119 Transacciones.
--
-- 🔴 EL MONTO ES `total` (CON ITBMS), igual que en la cuenta corriente. Es la
-- cifra que el cliente ve en su estado de cuenta y la que se compara contra un
-- recibo. (Ventas usa `subtotal_descuento`, SIN ITBMS — otra pregunta, otro
-- número; mezclarlos es lo que hay que evitar.)
--
-- ⚠️ LA FECHA VA EN DÍA PANAMÁ. `switch_facturas.fecha` es timestamptz UTC y
-- Panamá es UTC-5 fijo: leída en UTC pelada, una factura emitida de noche cae al
-- día siguiente y el "hace N días" de la pantalla se corre un día. Es el mismo
-- gotcha que ya mordió en loadImpuestoMap. Así queda en el MISMO calendario que
-- `switch_recibos.fecha`, que es un date de día Panamá.
--
-- El código del cliente sale de `switch_clientes` por subconsulta escalar (no
-- por JOIN): si esa tabla llegara a tener dos filas para el mismo cliente, un
-- JOIN duplicaría la fila de la vista y el CXC vería dos "últimas compras".
--
-- ⚠️ ESTA VISTA NO FILTRA EMPRESA, igual que la del último pago: acota quien la
-- lee. `/api/cxc/ultima-compra` la acota a `empresasConCxc()` — la plata de
-- Boston no se mezcla con la del grupo, ni siquiera para un cliente que exista
-- en los dos lados.
-- ═════════════════════════════════════════════════════════════════════════════

-- Índice de cobertura del DISTINCT ON. Sin él, cada lectura de la vista es un
-- scan de switch_facturas (52k filas, ~58 MB de heap por el raw_data jsonb).
CREATE INDEX IF NOT EXISTS idx_sf_empresa_cliente_fecha
  ON switch_facturas (empresa_key, cliente_switch_id, fecha DESC);

-- La subconsulta del código corre una vez por cliente (~466 filas).
CREATE INDEX IF NOT EXISTS idx_switch_clientes_empresa_switchid
  ON switch_clientes (empresa_key, cliente_switch_id);

CREATE OR REPLACE VIEW switch_ultima_compra_cliente_v1 AS
SELECT DISTINCT ON (f.empresa_key, f.cliente_switch_id)
  f.empresa_key,
  f.cliente_switch_id,
  (SELECT c.codigo
     FROM switch_clientes c
    WHERE c.empresa_key = f.empresa_key
      AND c.cliente_switch_id = f.cliente_switch_id
    LIMIT 1)                                          AS cliente_codigo,
  (f.fecha AT TIME ZONE 'America/Panama')::date       AS ultima_compra_fecha,
  COALESCE(f.total, 0)                                AS ultima_compra_monto
FROM switch_facturas f
WHERE f.fecha IS NOT NULL
  AND f.cliente_switch_id IS NOT NULL
  AND f.tipo_comprobante = 'Factura'   -- NO notas de crédito, NO tiquetes
ORDER BY f.empresa_key, f.cliente_switch_id, f.fecha DESC, f.id DESC;

GRANT SELECT ON switch_ultima_compra_cliente_v1 TO service_role;

NOTIFY pgrst, 'reload schema';

-- Verificación — el caso de Daniel (2026-08-11 · 6968.38):
--   SELECT ultima_compra_fecha, ultima_compra_monto
--   FROM switch_ultima_compra_cliente_v1
--   WHERE empresa_key = 'fashion_wear' AND cliente_codigo = 'D-25';
-- Y que ninguna NC se haya colado (debe dar 0):
--   SELECT count(*) FROM switch_ultima_compra_cliente_v1 u
--   JOIN switch_facturas f ON f.empresa_key = u.empresa_key
--    AND f.cliente_switch_id = u.cliente_switch_id
--    AND (f.fecha AT TIME ZONE 'America/Panama')::date = u.ultima_compra_fecha
--    AND f.total = u.ultima_compra_monto
--   WHERE f.tipo_comprobante <> 'Factura';
