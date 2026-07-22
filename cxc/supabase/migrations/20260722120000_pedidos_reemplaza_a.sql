-- ─────────────────────────────────────────────────────────────────────────────
-- Pedidos enviados a Switch no editables — trazabilidad de reemplazos.
--
-- El API de Switch NO permite editar ni anular pedidos (solo crear). Cuando un
-- pedido ya enviado necesita correccion, el flujo nuevo es "Duplicar y
-- corregir": se clona como pedido NUEVO en borrador y el original queda
-- bloqueado y marcado. Esta columna guarda ese vinculo:
--
--   reemplaza_a = id del pedido original que este pedido reemplaza (nullable).
--
-- El "Reemplazado por" del original se deriva con query inversa
-- (orders WHERE reemplaza_a = id AND deleted = false) — sin columna espejo.
--
-- Migracion ADITIVA y segura (no toca datos ni vistas: la vista
-- reebok_pedidos_unificado_vw selecciona columnas explicitas y no se ve
-- afectada). Aplicar manual en Supabase Dashboard → SQL Editor (proyecto
-- principal — reebok_orders y joybees_orders viven ahi).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reebok_orders
  ADD COLUMN IF NOT EXISTS reemplaza_a uuid REFERENCES reebok_orders(id);

ALTER TABLE joybees_orders
  ADD COLUMN IF NOT EXISTS reemplaza_a uuid REFERENCES joybees_orders(id);

-- Indices parciales para la query inversa (casi todas las filas son NULL).
CREATE INDEX IF NOT EXISTS reebok_orders_reemplaza_a_idx
  ON reebok_orders (reemplaza_a)
  WHERE reemplaza_a IS NOT NULL;

CREATE INDEX IF NOT EXISTS joybees_orders_reemplaza_a_idx
  ON joybees_orders (reemplaza_a)
  WHERE reemplaza_a IS NOT NULL;

NOTIFY pgrst, 'reload schema';
