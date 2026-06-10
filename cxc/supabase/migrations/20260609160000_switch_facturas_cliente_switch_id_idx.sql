-- Índice faltante para la ficha de cliente (/clientes/[codigo]).
--
-- La ficha consulta switch_facturas filtrando por cliente_switch_id SIN empresa_key:
--   · Ventas YTD:  WHERE cliente_switch_id IN (...) AND fecha >= <inicio_año>
--   · Última:      WHERE cliente_switch_id IN (...) ... ORDER BY fecha DESC
-- Los 3 índices existentes lideran con empresa_key (empresa_key,fecha),
-- (empresa_key,cliente_switch_id), (empresa_key,vendedor_switch_id) → no pueden
-- hacer seek por cliente_switch_id solo → seq scan de ~50K filas (~784ms).
--
-- Índice compuesto liderando con cliente_switch_id + fecha como 2da columna:
-- la 1ra resuelve el filtro IN(cliente_switch_id), la 2da cubre el rango
-- (fecha >= inicio_año) y el ORDER BY fecha (scan en reversa para DESC) sin sort.
--
-- ADITIVO Y REVERSIBLE: solo crea un índice, no toca ni borra data.
-- CONCURRENTLY = no bloquea escrituras de switch_facturas durante la creación
-- (no puede correr dentro de una transacción; ejecutar como statement suelto en
-- el SQL Editor, no envuelto en BEGIN/COMMIT).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_switch_facturas_cliente_switch_id_fecha
  ON switch_facturas (cliente_switch_id, fecha);

-- Rollback (si hiciera falta revertir):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_switch_facturas_cliente_switch_id_fecha;
