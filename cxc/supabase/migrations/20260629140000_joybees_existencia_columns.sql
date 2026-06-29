-- Joybees catálogo automático (patrón Reebok): columnas de inventario en Switch.
-- existencia = saldo físico; disponibilidad = vendible (saldo − apartado);
-- keep_visible = forzar visible aunque existencia=0 (igual que Reebok).
-- El sync escribe estas 3 + mantiene `stock` (= existencia) para que el catálogo
-- público y los componentes actuales (que leen stock) sigan funcionando sin tocarlos.
-- Aditivo y nullable → no rompe las 81 filas actuales.

ALTER TABLE joybees_products
  ADD COLUMN IF NOT EXISTS existencia     int,
  ADD COLUMN IF NOT EXISTS disponibilidad int,
  ADD COLUMN IF NOT EXISTS keep_visible   boolean;

NOTIFY pgrst, 'reload schema';
