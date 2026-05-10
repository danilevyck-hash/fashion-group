-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: backfill cliente_id en ventas_raw y cxc_rows
--
-- Agrega columna cliente_id (FK a clientes_master) en ambas tablas históricas
-- y la rellena por match exacto contra clientes_master.nombre_normalized.
--
-- Match key: nombre_normalized (UPPER + remove [.,] + collapse spaces).
-- Solo se hace backfill para empresas B2B; las retail (boston, american_classic)
-- quedan con cliente_id = NULL por diseño.
--
-- Esperado post-backfill (según análisis de Fase 0 con N2):
--   ventas_raw B2B: ~76% con cliente_id NOT NULL (los huérfanos son
--     consumidor final / personas físicas / variantes ortográficas).
--   cxc_rows B2B: ~98% con cliente_id NOT NULL.
--
-- Idempotente: el ALTER TABLE usa IF NOT EXISTS y el UPDATE usa join, así
-- que repetir la migración no hace daño (re-asigna a los mismos ids).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ventas_raw
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes_master(id);
CREATE INDEX IF NOT EXISTS idx_ventas_raw_cliente_id ON ventas_raw(cliente_id);

ALTER TABLE cxc_rows
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes_master(id);
CREATE INDEX IF NOT EXISTS idx_cxc_rows_cliente_id ON cxc_rows(cliente_id);

-- ventas_raw: normaliza el cliente al vuelo (UPPER + remove [.,] + collapse)
-- y joinea contra clientes_master.nombre_normalized.
UPDATE ventas_raw v
SET cliente_id = m.id
FROM clientes_master m
WHERE m.deleted = false
  AND v.empresa IN ('vistana', 'fashion_wear', 'fashion_shoes',
                    'active_shoes', 'active_wear', 'joystep')
  AND regexp_replace(
        regexp_replace(upper(trim(v.cliente)), '[.,]', '', 'g'),
        '\s+', ' ', 'g'
      ) = m.nombre_normalized;

-- cxc_rows: nombre_normalized ya está normalizado en la tabla, join directo.
UPDATE cxc_rows c
SET cliente_id = m.id
FROM clientes_master m
WHERE m.deleted = false
  AND c.company_key IN ('vistana', 'fashion_wear', 'fashion_shoes',
                        'active_shoes', 'active_wear', 'joystep')
  AND c.nombre_normalized = m.nombre_normalized;
