-- Run this in Supabase Dashboard > SQL Editor
-- Recalculate subtotals for items where subtotal is 0 but cantidad and precio exist

UPDATE reclamo_items
SET subtotal = cantidad * precio_unitario
WHERE subtotal = 0 AND cantidad > 0 AND precio_unitario > 0;

-- Verify: show all items with their calculated values
-- SELECT id, referencia, cantidad, precio_unitario, subtotal, cantidad * precio_unitario AS calculated FROM reclamo_items;
