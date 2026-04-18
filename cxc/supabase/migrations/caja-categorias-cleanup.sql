-- Collapse legacy free-text categorías to the canonical "Otros".
UPDATE caja_gastos
   SET categoria = 'Otros'
 WHERE categoria IN ('Varios', 'Otro / General');

-- "Limpieza" had zero usage in production audit; drop from the catálogo
-- so the closed dropdown only shows the 6 approved entries.
DELETE FROM caja_categorias WHERE nombre = 'Limpieza';
