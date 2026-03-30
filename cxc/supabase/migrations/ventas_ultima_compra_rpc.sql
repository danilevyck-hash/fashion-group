CREATE OR REPLACE FUNCTION get_ultima_compra()
RETURNS TABLE(cliente text, empresa text, ultima_fecha date) AS $$
  SELECT cliente, empresa, MAX(fecha)::date
  FROM ventas_raw
  WHERE subtotal > 0
  GROUP BY cliente, empresa
$$ LANGUAGE sql STABLE;
