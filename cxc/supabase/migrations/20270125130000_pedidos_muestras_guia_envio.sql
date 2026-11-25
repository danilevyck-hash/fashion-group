-- ═════════════════════════════════════════════════════════════════════════════
-- Despachos › Muestras › N.° de guía del envío (25-nov-2026, Daniel: guía
-- OPCIONAL, UNA POR CAJA). Al marcar «Enviada» / «Enviar todas» el vendedor
-- puede escribir un N.° de guía; queda en todas las referencias de esa acción.
-- Bodega lee «Enviada · Guía 123456 · 25-nov».
--
-- 🔑 SOLO AGREGA: columna nueva, NULL para todas las filas existentes.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE pedidos_muestras
  ADD COLUMN IF NOT EXISTS guia_envio text
  CHECK (guia_envio IS NULL OR (char_length(guia_envio) BETWEEN 1 AND 40));

COMMENT ON COLUMN pedidos_muestras.guia_envio IS
  'N.° de guía con que el vendedor mandó la muestra (opcional; uno por caja, el mismo en todas las referencias de la misma acción «Enviada»).';
