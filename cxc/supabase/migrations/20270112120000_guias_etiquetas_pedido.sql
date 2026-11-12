-- ═════════════════════════════════════════════════════════════════════════════
-- guias_etiquetas — EL N.° DE PEDIDO, OPCIONAL (12-nov-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 12-nov-2026: la etiqueta lleva, opcional, el N.° de pedido de Switch
-- («16-000002926»), escrito a mano al hacer el envío. Se imprime chico y gris
-- debajo de la factura. Sin pedido, el papel sale idéntico al de antes.
--
-- 🔴 ADITIVA: una columna NULLABLE, sin DEFAULT, sin UPDATE ni DELETE de filas.
-- El pedido es del ENVÍO: se escribe una vez y se copia a cada fila del envío,
-- igual que `destino` (la tabla no tiene una fila por envío).
--
-- ⚠️ El código FALLA ABIERTO sin esta columna: la lista se lee sin ella y un
-- envío sin pedido se guarda como siempre.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE guias_etiquetas
  ADD COLUMN IF NOT EXISTS pedido text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guias_etiquetas_pedido_corto'
  ) THEN
    ALTER TABLE guias_etiquetas
      ADD CONSTRAINT guias_etiquetas_pedido_corto
      CHECK (pedido IS NULL OR (pedido = btrim(pedido) AND pedido <> '' AND length(pedido) <= 30));
  END IF;
END $$;

COMMENT ON COLUMN guias_etiquetas.pedido IS
  'N.° de pedido de Switch, opcional, escrito a mano al crear el envío (12-nov-2026). Se copia a cada fila del envío. NULL = sin pedido (nunca cadena vacía). Se imprime chico debajo de la factura.';
