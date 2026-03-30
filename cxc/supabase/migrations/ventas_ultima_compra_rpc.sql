CREATE OR REPLACE FUNCTION get_ultima_compra()
RETURNS TABLE(cliente text, ultima_fecha date) AS $$
  SELECT
    TRIM(REGEXP_REPLACE(cliente, '\s+', ' ', 'g')) as cliente,
    MAX(fecha)::date as ultima_fecha
  FROM ventas_raw
  WHERE subtotal > 0
  GROUP BY TRIM(REGEXP_REPLACE(cliente, '\s+', ' ', 'g'))
$$ LANGUAGE sql STABLE;
